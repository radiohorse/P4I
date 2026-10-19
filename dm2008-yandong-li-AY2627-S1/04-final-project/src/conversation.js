import { CONFIG, MODES, REPLY_CONFIG } from './config.js';
import { choosePhrase, generateResponse, revealProgress } from './response-generator.js';

const MESSAGES = {
  IDLE: 'A little quiet',
  USER_PLAYING: 'Listening',
  WAITING_TO_REPLY: 'Letting it linger',
  SYSTEM_REPLYING: 'A quiet reply',
};

export class Conversation {
  constructor(state, recorder, audio, setStatus, { random = Math.random } = {}) {
    Object.assign(this, { state, recorder, audio, setStatus, random });
    this.reply = null;
    this.round = 0;
    this.previousNoteCount = Infinity;
    this.replyCount = 0;
    this.notesPlayed = 0;
    this.waitUntil = Infinity;
    this.lastUserEnd = 0;
  }

  transition(mode) {
    this.state.mode = mode;
    this.refreshStatus();
  }

  refreshStatus() {
    if (this.audio.ready) this.setStatus(MESSAGES[this.state.mode], true);
  }

  userStarted(now = performance.now()) {
    this.stopReply(now);
    this.audio.duckReply(true);
    this.round = 0;
    this.previousNoteCount = Infinity;
    this.waitUntil = Infinity;
    this.transition(MODES.USER_PLAYING);
  }

  userFinished(now = performance.now()) {
    this.lastUserEnd = now;
    this.waitUntil = now + REPLY_CONFIG.initialWaitMs;
    this.transition(MODES.WAITING_TO_REPLY);
  }

  // Blur/hidden tabs become quiet, without later replaying a backlog of notes.
  suspend(now = performance.now()) {
    this.stopReply(now);
    this.audio.duckReply(true);
    this.waitUntil = Infinity;
    this.transition(MODES.IDLE);
  }

  reset() {
    this.suspend();
    this.round = 0;
    this.previousNoteCount = Infinity;
    this.replyCount = 0;
    this.notesPlayed = 0;
    this.lastUserEnd = 0;
  }

  stopReply(now) {
    if (!this.reply) return;
    this.reply.visual.endedAt = now;
    this.reply = null; // The only pending queue is discarded; tails keep releasing.
  }

  tick(now = performance.now()) {
    if (this.state.mode === MODES.IDLE || this.state.mode === MODES.USER_PLAYING) return;
    if (this.audio.muted) { this.suspend(now); return; }
    if (!this.audio.ready) {
      if (this.audio.state !== 'starting' && this.audio.state !== 'locked') this.suspend(now);
      return;
    }
    if (now - this.lastUserEnd > REPLY_CONFIG.maxIdleMs) { this.suspend(now); return; }
    if (this.state.mode === MODES.WAITING_TO_REPLY) {
      if (now < this.waitUntil) return;
      const source = choosePhrase(this.recorder.phrases, this.random);
      const noteLimit = Math.max(1, Math.floor(this.previousNoteCount * 0.7));
      const generated = generateResponse(source, this.round, this.random, noteLimit);
      if (!generated) { this.transition(MODES.IDLE); return; }
      this.previousNoteCount = generated.notes.length;
      const visual = {
        id: `reply-${++this.replyCount}`, kind: 'reply', phase: this.replyCount,
        points: generated.path, reveal: 0, endedAt: null,
      };
      this.state.visiblePhrases.push(visual);
      if (this.state.visiblePhrases.length > CONFIG.maxVisiblePhrases) this.state.visiblePhrases.shift();
      this.reply = {
        generated, visual, start: this.audio.scheduleTime, next: 0,
        sounding: [], lastTick: this.audio.clockTime,
      };
      this.round++;
      this.audio.duckReply(false);
      this.transition(MODES.SYSTEM_REPLYING);
    }

    const reply = this.reply;
    if (!reply) return;
    const clock = this.audio.clockTime;
    // A sleeping/busy tab must never fire accumulated notes together on waking.
    if (clock - reply.lastTick > 0.5) { this.suspend(now); return; }
    reply.lastTick = clock;
    const note = reply.generated.notes[reply.next];
    if (note && reply.start + note.onset <= this.audio.scheduleTime) {
      if (clock - (reply.start + note.onset) <= REPLY_CONFIG.maxLateSeconds) {
        const played = this.audio.playReply(note, reply.start + note.onset);
        if (played) {
          reply.sounding.push({ ...note, onset: played.time - reply.start });
          this.notesPlayed++;
        }
      }
      reply.next++; // At most one note per frame; never burst after a stall.
    }
    reply.visual.reveal = revealProgress(reply.sounding, clock - reply.start);
    const end = Math.max(reply.generated.duration, ...reply.sounding.map(n => n.onset + n.duration));
    if (clock < reply.start + end + 0.4 || reply.next < reply.generated.notes.length) return;
    this.stopReply(now);
    if (this.round >= REPLY_CONFIG.maxRounds) {
      this.transition(MODES.IDLE);
    } else {
      this.waitUntil = now + REPLY_CONFIG.laterWaitMs[this.round - 1] + this.random() * 2000;
      this.transition(MODES.WAITING_TO_REPLY);
    }
  }

  snapshot() {
    return {
      conversationState: this.state.mode,
      replyRound: this.round,
      replyCount: this.replyCount,
      replyNotesPlayed: this.notesPlayed,
      activeReply: this.reply ? structuredClone({
        sourceId: this.reply.generated.sourceId,
        notes: this.reply.generated.notes,
        duration: this.reply.generated.duration,
        playedNotes: this.reply.sounding.length,
        progress: this.reply.visual.reveal,
      }) : null,
    };
  }
}

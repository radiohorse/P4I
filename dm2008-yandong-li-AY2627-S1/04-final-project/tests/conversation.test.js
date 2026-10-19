import test from 'node:test';
import assert from 'node:assert/strict';
import { Conversation } from '../src/conversation.js';
import { PhraseRecorder } from '../src/phrase-recorder.js';
import { CONFIG, MODES, PITCHES, REPLY_CONFIG } from '../src/config.js';
import { choosePhrase, generateResponse, revealProgress } from '../src/response-generator.js';

function record(recorder, start = 0, count = 8) {
  const phrase = recorder.start({ width: 1000, height: 600 }, start);
  for (let i = 0; i < count; i++) {
    recorder.addNote(PITCHES[i % PITCHES.length], 0.45, 0.45, start + i * 180);
    recorder.addPoint(100 + i * 30, 500 - i * 15, start + i * 180);
  }
  recorder.finish(start + count * 180);
  return phrase;
}

function harness(count = 8) {
  const recorder = new PhraseRecorder();
  record(recorder, 0, count);
  const state = { mode: MODES.IDLE, visiblePhrases: [] };
  const played = [];
  const audio = {
    ready: true, state: 'ready', clockTime: 0, ducked: true,
    get scheduleTime() { return this.clockTime + 0.03; },
    duckReply(value) { this.ducked = value; },
    playReply(note, time) {
      assert.equal(this.ducked, false);
      played.push({ ...note, time, wall: this.clockTime });
      return { time: Math.max(time, this.scheduleTime) };
    },
  };
  const conversation = new Conversation(state, recorder, audio, () => {}, { random: () => 0.5 });
  let now = 0;
  return {
    recorder, state, audio, played, conversation,
    advance(ms) {
      const until = now + ms;
      while (now < until) {
        now = Math.min(until, now + 16);
        audio.clockTime = now / 1000;
        conversation.tick(now);
      }
      return now;
    },
    get now() { return now; },
  };
}

test('memory keeps the three newest phrases, timestamps and paths, with recency weighting', () => {
  const recorder = new PhraseRecorder();
  for (let i = 0; i < 20; i++) record(recorder, i * 10000);
  assert.deepEqual(recorder.phrases.map(p => p.id), [18, 19, 20]);
  assert.equal(choosePhrase(recorder.phrases, () => 0).id, 18);
  assert.equal(choosePhrase(recorder.phrases, () => 2 / 7).id, 19);
  assert.equal(choosePhrase(recorder.phrases, () => 0.5).id, 20);
  const saved = recorder.exportData().phrases.at(-1);
  assert.equal(saved.notes[1].onset, 0.18);
  assert.equal(saved.notes[1].duration, 0.45);
  assert.equal(saved.path[1].time, 0.18);
});

test('a very long gesture has bounded storage while preserving path endpoints', () => {
  const recorder = new PhraseRecorder();
  recorder.start({ width: 1000, height: 600 }, 0);
  for (let i = 0; i < 12000; i++) {
    recorder.addPoint(i % 1000, i % 600, i);
    if (i % 2 === 0) recorder.addNote('C4', 0.45, 0.4, i);
  }
  const phrase = recorder.finish(12000);
  assert.ok(phrase.path.length <= CONFIG.maxRecordedPoints);
  assert.ok(phrase.notes.length <= CONFIG.maxRecordedNotes);
  assert.equal(phrase.path[0].time, 0);
  assert.equal(phrase.path.at(-1).time, 11.999);
  assert.equal(phrase.notes.at(-1).onset, 11.998);
  assert.ok(phrase.path.every((p, i) => i === 0 || p.time >= phrase.path[i - 1].time));
});

test('variations retain source pitch classes and shape, change the phrase, and decrease density', () => {
  const recorder = new PhraseRecorder();
  const source = record(recorder, 0, 20);
  const original = structuredClone(source);
  let seed = 17;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 100; trial++) {
    let previousCount = Infinity;
    let previousVelocity = Infinity;
    for (let round = 0; round < 3; round++) {
      const reply = generateResponse(source, round, random);
      assert.ok(reply.notes.length <= REPLY_CONFIG.maxNotes[round]);
      assert.ok(reply.notes.length <= previousCount);
      assert.ok(reply.notes[0].velocity < previousVelocity);
      previousCount = reply.notes.length;
      previousVelocity = reply.notes[0].velocity;
      assert.ok(reply.notes.every(note => PITCHES.includes(note.pitch)));
      assert.ok(reply.notes.every(note => source.notes.some(n => n.pitch[0] === note.pitch[0])));
      assert.ok(reply.notes.every((note, i) => i === 0 || note.onset - reply.notes[i - 1].onset >= 0.379));
      assert.ok(reply.notes.every(note => note.duration > 0.45 && note.duration <= 1.2));
      assert.ok(reply.path.length <= REPLY_CONFIG.maxPathPoints);
      assert.ok(reply.path.every((p, i) => Math.abs(p.nx - source.path[i].nx) < 0.06 && Math.abs(p.ny - source.path[i].ny) < 0.09));
      assert.notDeepEqual(reply.notes, source.notes);
    }
  }
  assert.deepEqual(source, original, 'Generating replies must never mutate the remembered phrase.');
});

test('single taps and empty recordings are handled without inventing melodies', () => {
  const recorder = new PhraseRecorder();
  const source = record(recorder, 0, 1);
  const reply = generateResponse(source, 0, () => 0.5);
  assert.equal(reply.notes.length, 1);
  assert.equal(reply.notes[0].pitch, source.notes[0].pitch);
  assert.ok(reply.notes[0].duration > source.notes[0].duration);
  assert.equal(generateResponse(null), null);
  assert.equal(choosePhrase([{ notes: [], path: [] }]), null);
});

test('the response waits two seconds, runs one queue, and reveals its line on the audio clock', () => {
  const h = harness();
  h.conversation.userStarted(0);
  assert.equal(h.state.mode, MODES.USER_PLAYING);
  h.advance(3000);
  assert.equal(h.played.length, 0);
  h.conversation.userFinished(h.now);
  h.advance(1999);
  assert.equal(h.state.mode, MODES.WAITING_TO_REPLY);
  assert.equal(h.played.length, 0);
  h.advance(1);
  assert.equal(h.state.mode, MODES.SYSTEM_REPLYING);
  assert.equal(h.played.length, 1);
  assert.equal(h.state.visiblePhrases[0].reveal, 0, 'Do not draw before scheduled audio begins.');
  h.advance(240);
  assert.ok(h.state.visiblePhrases[0].reveal > 0 && h.state.visiblePhrases[0].reveal < 1);
  assert.equal(h.conversation.replyCount, 1);
});

test('a new gesture immediately owns the conversation and cancels every future reply note', () => {
  const h = harness();
  h.conversation.userFinished(0);
  h.advance(2200);
  const count = h.played.length;
  const interrupted = h.state.visiblePhrases[0];
  h.conversation.userStarted(h.now);
  assert.equal(h.audio.ducked, true);
  assert.equal(h.state.mode, MODES.USER_PLAYING);
  assert.equal(h.conversation.reply, null);
  assert.equal(interrupted.endedAt, h.now);
  h.advance(30000);
  assert.equal(h.played.length, count);
  h.conversation.userFinished(h.now);
  h.advance(1999);
  assert.equal(h.played.length, count);
  h.advance(1);
  assert.equal(h.conversation.replyCount, 2);
  assert.equal(h.conversation.round, 1);
});

test('inactivity yields only three increasingly sparse replies then lasting silence', () => {
  const h = harness(20);
  h.conversation.userFinished(0);
  h.advance(90000);
  assert.equal(h.conversation.replyCount, 3);
  assert.equal(h.state.mode, MODES.IDLE);
  assert.equal(h.conversation.reply, null);
  const total = h.played.length;
  assert.ok(total <= 19);
  h.advance(180000);
  assert.equal(h.played.length, total);
  assert.equal(h.recorder.phrases.length, 1, 'Replies never remember themselves.');
});

test('hidden/suspended contexts and stalled frames do not produce a catch-up burst', () => {
  for (const cause of ['hidden', 'suspended', 'stalled']) {
    const h = harness();
    h.conversation.userFinished(0);
    h.advance(2200);
    const count = h.played.length;
    if (cause === 'hidden') h.conversation.suspend(h.now);
    if (cause === 'suspended') { h.audio.ready = false; h.audio.state = 'suspended'; }
    if (cause === 'stalled') h.audio.clockTime += 10;
    h.conversation.tick(h.now + 10000);
    assert.equal(h.state.mode, MODES.IDLE);
    assert.equal(h.conversation.reply, null);
    assert.equal(h.audio.ducked, true);
    assert.equal(h.played.length, count);
  }
});

test('line growth rests during the same pauses as the music', () => {
  const notes = [
    { onset: 0, duration: 0.6, pathEnd: 0.4 },
    { onset: 1.5, duration: 0.8, pathEnd: 1 },
  ];
  assert.equal(revealProgress(notes, -0.1), 0);
  assert.equal(revealProgress(notes, 0.8), 0.4);
  assert.equal(revealProgress(notes, 1.4), 0.4);
  assert.ok(revealProgress(notes, 1.9) > 0.4);
  assert.equal(revealProgress(notes, 3), 1);
});

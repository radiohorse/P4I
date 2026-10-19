import { CONFIG, PITCHES } from './config.js';
import { pitchIndexAt, stablePitchIndex } from './scale.js';

export class Interaction {
  constructor(canvas, state, recorder, audio, setStatus, conversation = null) {
    Object.assign(this, { canvas, state, recorder, audio, setStatus, conversation });
    this.pointerId = null;
    this.keyboardDrawing = false;
    this.pendingSessions = new Set();

    canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    canvas.addEventListener('pointermove', event => this.pointerMove(event));
    canvas.addEventListener('pointerup', event => this.pointerUp(event));
    for (const eventName of ['pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(eventName, event => {
        if (event.pointerId === this.pointerId) this.finish(true);
      });
    }
    canvas.addEventListener('pointerleave', () => {
      if (!state.drawing) state.cursor.visible = false;
    });
    canvas.addEventListener('keydown', event => this.keyDown(event));
    canvas.addEventListener('keyup', event => {
      if (event.code === 'Space' && this.keyboardDrawing) { event.preventDefault(); this.finish(); }
    });
    document.addEventListener('keydown', () => canvas.removeAttribute('data-pointer-focus'));
    canvas.addEventListener('blur', () => this.finish(true));
    window.addEventListener('blur', () => this.finish(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.finish(true);
    });
  }

  position(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
  }

  pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary || this.state.drawing) return;
    event.preventDefault();
    this.canvas.setAttribute('data-pointer-focus', '');
    this.canvas.focus({ preventScroll: true });
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.begin(this.position(event));
  }

  pointerMove(event) {
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (!event.isPrimary || this.keyboardDrawing) return;
    const point = this.position(event);
    Object.assign(this.state.cursor, point, { visible: true });
    if (this.state.drawing) {
      this.addPoint(point);
      this.tick();
    }
  }

  pointerUp(event) {
    if (event.pointerId !== this.pointerId) return;
    this.addPoint(this.position(event), true);
    this.tick();
    this.finish();
    if (event.pointerType === 'touch') this.state.cursor.visible = false;
  }

  begin(point) {
    const now = performance.now();
    const viewport = { width: this.canvas.clientWidth, height: this.canvas.clientHeight };
    const phrase = this.recorder.start(viewport, now);
    const visual = { id: phrase.id, kind: 'user', points: [], endedAt: null };
    const session = {
      phrase, visual, startedAt: now, initialIndex: pitchIndexAt(point.y, viewport.height),
      region: pitchIndexAt(point.y, viewport.height), lastPitchIndex: null,
      firstPlayed: false, unlocked: false, cancelled: false,
    };
    this.state.drawing = session;
    this.conversation?.userStarted(now);
    this.state.visiblePhrases.push(visual);
    if (this.state.visiblePhrases.length > CONFIG.maxVisiblePhrases) this.state.visiblePhrases.shift();
    Object.assign(this.state.cursor, point, { visible: true, pressed: true });
    this.addPoint(point, true);
    this.state.hasDrawn = true;
    document.body.classList.add('has-drawn');

    // Call unlock synchronously inside the gesture, even when the first note waits.
    const wasReady = this.audio.ready;
    this.pendingSessions.add(session);
    const unlocking = this.audio.unlock();
    if (!wasReady) this.setStatus('Opening the sound…');
    unlocking.then(ready => {
      if (!ready || session.cancelled) return;
      session.unlocked = true;
      this.setStatus('Sound is on', true);
      this.conversation?.refreshStatus();
      // A quick click still gets its first note, recorded in the captured phrase.
      if (this.playNote(session, session.initialIndex, session.startedAt)) {
        session.firstPlayed = true;
      }
    }).catch(error => {
      console.error('Audio could not start:', error);
      this.setStatus('Sound couldn’t start. Touch again to retry.');
    }).finally(() => this.pendingSessions.delete(session));
  }

  addPoint(point, force = false) {
    const session = this.state.drawing;
    if (!session) return;
    Object.assign(this.state.cursor, point);
    session.region = stablePitchIndex(point.y, this.canvas.clientHeight, session.region);
    const last = session.visual.points.at(-1);
    if (!force && last && Math.hypot(point.x - last.x, point.y - last.y) < 0.8) return;
    const recorded = this.recorder.addPoint(point.x, point.y);
    session.visual.points.push(recorded);
    // Display sampling is independent of the larger musical-memory path budget.
    if (session.visual.points.length > CONFIG.maxVisualPoints) {
      session.visual.points = session.visual.points.filter((_, i, points) => i % 2 === 0 || i === points.length - 1);
    }
  }

  playNote(session, index, onsetTime = performance.now()) {
    const pitch = PITCHES[index];
    const played = this.audio.play(pitch, CONFIG.noteVelocity);
    if (!played) return false;
    this.recorder.addNote(pitch, played.duration, played.velocity, onsetTime, session.phrase);
    session.lastPitchIndex = index;
    this.state.lastNoteAt = performance.now();
    if (this.state.drawing === session) this.state.cursor.pitch = pitch;
    return true;
  }

  tick(now = performance.now()) {
    const session = this.state.drawing;
    if (!session || !session.unlocked || !this.audio.ready) return;
    // If the voice pool was full on press, resume this gesture when a voice frees.
    if (!session.firstPlayed) {
      session.firstPlayed = this.playNote(session, session.region, now);
      return;
    }
    if (session.region === session.lastPitchIndex) return;
    if (now - this.state.lastNoteAt < CONFIG.noteIntervalMs) return;
    // Check each frame as well as each move: a throttled crossing sounds even
    // if the pointer stops immediately after entering its new pitch region.
    this.playNote(session, session.region, now);
  }

  finish(cancelPending = false) {
    if (cancelPending) {
      for (const pending of this.pendingSessions) pending.cancelled = true;
      this.conversation?.suspend();
    }
    const session = this.state.drawing;
    if (!session) return;
    if (cancelPending) session.cancelled = true;
    session.visual.endedAt = performance.now();
    this.recorder.finish(session.visual.endedAt);
    this.state.drawing = null;
    if (!cancelPending) this.conversation?.userFinished(session.visual.endedAt);
    this.state.cursor.pressed = false;
    this.state.cursor.pitch = null;
    this.keyboardDrawing = false;
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  keyDown(event) {
    if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat || this.state.drawing) return;
      this.keyboardDrawing = true;
      const cursor = this.state.cursor;
      this.begin(cursor.visible ? cursor : { x: this.canvas.clientWidth / 2, y: this.canvas.clientHeight / 2 });
    }
    const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (!directions[event.code]) return;
    event.preventDefault();
    if (!this.keyboardDrawing) return;
    const [dx, dy] = directions[event.code];
    const step = this.canvas.clientHeight / PITCHES.length;
    this.addPoint({
      x: Math.max(0, Math.min(this.canvas.clientWidth, this.state.cursor.x + dx * step)),
      y: Math.max(0, Math.min(this.canvas.clientHeight, this.state.cursor.y + dy * step)),
    }, true);
    this.tick();
  }
}

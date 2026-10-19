// Phrase times use one monotonic clock and are stored in seconds, relative to
// the beginning of the gesture. Visual fading never removes this recording.
const currentTime = () => globalThis.performance?.now() ?? Date.now();

export class PhraseRecorder {
  constructor() {
    this.phrases = [];
    this.active = null;
    this.nextId = 1;
    this.phraseStartTimes = new WeakMap();
  }

  start({ width, height }, now = currentTime()) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError('A phrase needs a positive viewport width and height.');
    }

    // Preserve an unfinished gesture if a new gesture takes its place.
    if (this.active) this.finish(now);
    this.active = {
      id: this.nextId++,
      viewport: { width, height },
      duration: 0,
      notes: [],
      path: [],
    };
    this.phraseStartTimes.set(this.active, now);
    return this.active;
  }

  addPoint(x, y, now = currentTime()) {
    if (!this.active) return null;
    const { width, height } = this.active.viewport;
    const point = {
      x,
      y,
      nx: x / width,
      ny: y / height,
      time: this.elapsed(now),
    };
    // Keep original coordinates for fidelity and normalized ones for replay
    // at another canvas size. Compaction always preserves both endpoints.
    this.active.path.push(point);
    // Long continuous gestures keep their whole contour at lower resolution.
    if (this.active.path.length > CONFIG.maxRecordedPoints) {
      this.active.path = this.active.path.filter((_, i, points) => i % 2 === 0 || i === points.length - 1);
    }
    return point;
  }

  addNote(pitch, duration, velocity, now = currentTime(), phrase = this.active) {
    if (!this.phraseStartTimes.has(phrase)) return null;
    const note = { pitch, onset: this.elapsed(now, phrase), duration, velocity };
    phrase.notes.push(note);
    if (phrase.notes.length > CONFIG.maxRecordedNotes) phrase.notes.shift();
    // Audio may unlock after release. A captured phrase and original press
    // time preserve the intended onset even if another gesture has started.
    // A later supplied onset extends duration; release tails remain per-note.
    if (phrase !== this.active) phrase.duration = Math.max(phrase.duration, note.onset);
    return note;
  }

  finish(now = currentTime()) {
    if (!this.active) return null;
    const phrase = this.active;
    phrase.duration = this.elapsed(now);
    this.phrases.push(phrase);
    if (this.phrases.length > CONFIG.memorySize) this.phrases.shift();
    this.active = null;
    return phrase;
  }

  elapsed(now, phrase = this.active) {
    return Math.max(0, (now - this.phraseStartTimes.get(phrase)) / 1000);
  }

  exportData() {
    // Export completed gestures only. A deep copy lets future consumers edit
    // their copy without changing the live instrument's recorded history.
    return JSON.parse(JSON.stringify({
      schemaVersion: 1,
      scale: 'C major pentatonic',
      timeUnit: 'seconds',
      phrases: this.phrases,
    }));
  }

  clear() {
    this.phrases = [];
    this.active = null;
    this.nextId = 1;
    // Invalidates any late audio-unlock callback holding an old phrase.
    this.phraseStartTimes = new WeakMap();
  }
}
import { CONFIG } from './config.js';


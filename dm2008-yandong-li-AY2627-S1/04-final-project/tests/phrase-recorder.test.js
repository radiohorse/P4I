import test from 'node:test';
import assert from 'node:assert/strict';
import { PhraseRecorder } from '../src/phrase-recorder.js';

test('reset clears memory and invalidates a delayed note from the previous session', () => {
  const recorder = new PhraseRecorder();
  const old = recorder.start({ width: 800, height: 600 }, 0);
  recorder.finish(50);
  recorder.clear();
  assert.equal(recorder.addNote('C4', 0.45, 0.4, 0, old), null);
  assert.equal(recorder.phrases.length, 0);
  const fresh = recorder.start({ width: 800, height: 600 }, 1000);
  assert.equal(fresh.id, 1);
  assert.equal(fresh.notes.length, 0);
});

test('a gesture records musical timing and its drawing in the same time frame', () => {
  const recorder = new PhraseRecorder();
  recorder.start({ width: 1000, height: 500 }, 12000);
  recorder.addPoint(100, 250, 12000);
  recorder.addNote('C4', 0.7, 0.42, 12000);
  recorder.addPoint(400, 125, 12250);
  recorder.addNote('G4', 0.9, 0.48, 12250);
  // Even a tiny final movement matters when reconstructing a gesture.
  recorder.addPoint(400.2, 125.1, 12800);
  const phrase = recorder.finish(12800);

  assert.equal(phrase.duration, 0.8);
  assert.deepEqual(phrase.notes, [
    { pitch: 'C4', onset: 0, duration: 0.7, velocity: 0.42 },
    { pitch: 'G4', onset: 0.25, duration: 0.9, velocity: 0.48 },
  ]);
  assert.deepEqual(phrase.path[1], { x: 400, y: 125, nx: 0.4, ny: 0.25, time: 0.25 });
  assert.equal(phrase.path.at(-1).x, 400.2);
  assert.equal(phrase.path.at(-1).time, phrase.duration);
  assert.equal(recorder.active, null);
  assert.equal(recorder.phrases.length, 1);
});

test('later gestures have independent timing and cannot overwrite earlier recordings', () => {
  const recorder = new PhraseRecorder();
  recorder.start({ width: 800, height: 600 }, 1000);
  recorder.addPoint(200, 300, 1100);
  recorder.addNote('E4', 0.6, 0.5, 1100);
  const first = recorder.finish(1500);

  recorder.start({ width: 400, height: 300 }, 9000);
  recorder.addPoint(200, 300, 9000);
  recorder.addNote('A4', 0.8, 0.6, 9000);
  const second = recorder.finish(10000);

  assert.notEqual(first.id, second.id);
  assert.equal(first.path[0].nx, 0.25);
  assert.equal(second.path[0].nx, 0.5);
  assert.equal(first.notes[0].onset, 0.1);
  assert.equal(second.notes[0].onset, 0);
  assert.equal(first.duration, 0.5);
  assert.equal(second.duration, 1);
  assert.deepEqual(recorder.phrases, [first, second]);
});

test('export is a versioned, isolated snapshot of completed phrases', () => {
  const recorder = new PhraseRecorder();
  recorder.start({ width: 800, height: 600 }, 0);
  recorder.addPoint(100, 200, 0);
  recorder.addNote('D4', 0.6, 0.4, 0);
  recorder.finish(500);
  recorder.start({ width: 800, height: 600 }, 1000);
  recorder.addNote('C5', 0.7, 0.4, 1000);

  const exported = recorder.exportData();
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.scale, 'C major pentatonic');
  assert.equal(exported.timeUnit, 'seconds');
  assert.equal(exported.phrases.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), exported);

  exported.phrases[0].notes[0].pitch = 'F#4';
  exported.phrases[0].path[0].x = 999;
  exported.phrases[0].viewport.width = 1;
  assert.equal(recorder.phrases[0].notes[0].pitch, 'D4');
  assert.equal(recorder.phrases[0].path[0].x, 100);
  assert.equal(recorder.phrases[0].viewport.width, 800);

  recorder.finish(1500);
  assert.equal(exported.phrases.length, 1);
  assert.equal(recorder.exportData().phrases.length, 2);
});

test('interrupted gestures are preserved and extra release events are harmless', () => {
  const recorder = new PhraseRecorder();
  assert.equal(recorder.addPoint(0, 0, 0), null);
  assert.equal(recorder.addNote('C4', 0.6, 0.4, 0), null);
  assert.equal(recorder.finish(0), null);

  recorder.start({ width: 800, height: 600 }, 1000);
  recorder.addNote('C4', 0.6, 0.4, 1000);
  recorder.start({ width: 800, height: 600 }, 1500);
  assert.equal(recorder.phrases.length, 1);
  assert.equal(recorder.phrases[0].duration, 0.5);
  recorder.finish(1800);
  assert.equal(recorder.finish(1800), null);
  assert.equal(recorder.phrases.length, 2);
});

test('a quick tap keeps its delayed first note after a newer gesture starts', async () => {
  const recorder = new PhraseRecorder();
  const pressTime = 1000;
  const tapped = recorder.start({ width: 800, height: 600 }, pressTime);
  recorder.addPoint(100, 200, pressTime);
  let unlock;
  const audioReady = new Promise((resolve) => { unlock = resolve; });
  const delayedNote = audioReady.then(() => recorder.addNote('E4', 0.7, 0.45, pressTime, tapped));

  recorder.finish(1040);
  const newer = recorder.start({ width: 800, height: 600 }, 1200);
  recorder.addNote('A4', 0.8, 0.5, 1200);
  unlock();
  await delayedNote;

  assert.deepEqual(tapped.notes, [{ pitch: 'E4', onset: 0, duration: 0.7, velocity: 0.45 }]);
  assert.equal(tapped.duration, 0.04);
  assert.deepEqual(newer.notes, [{ pitch: 'A4', onset: 0, duration: 0.8, velocity: 0.5 }]);
  assert.equal(recorder.active, newer);
  assert.equal(recorder.exportData().phrases[0].notes[0].pitch, 'E4');
});

test('a late supplied onset extends its completed phrase and foreign targets are ignored', () => {
  const recorder = new PhraseRecorder();
  const phrase = recorder.start({ width: 800, height: 600 }, 1000);
  recorder.finish(1040);
  recorder.addNote('C4', 0.7, 0.45, 1300, phrase);
  assert.equal(phrase.notes[0].onset, 0.3);
  assert.equal(phrase.duration, 0.3);

  const other = new PhraseRecorder();
  const foreign = other.start({ width: 800, height: 600 }, 1000);
  assert.equal(recorder.addNote('C4', 0.7, 0.45, 1300, foreign), null);
  assert.equal(foreign.notes.length, 0);
  assert.equal(recorder.phrases.length, 1);
});

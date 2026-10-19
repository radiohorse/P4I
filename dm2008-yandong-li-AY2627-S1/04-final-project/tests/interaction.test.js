import test from 'node:test';
import assert from 'node:assert/strict';
import { Interaction } from '../src/interaction.js';
import { PhraseRecorder } from '../src/phrase-recorder.js';
import { createState } from '../src/state.js';

const settle = () => new Promise(resolve => setImmediate(resolve));

function dispatch(target, type, fields = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, fields);
  target.dispatchEvent(event);
}

function harness(t, { delayedUnlock = false, capacityAvailable = true } = {}) {
  const fakeWindow = new EventTarget();
  fakeWindow.matchMedia = () => ({ matches: false });
  const fakeDocument = new EventTarget();
  fakeDocument.hidden = false;
  fakeDocument.body = { classList: { add() {} } };

  // Each test restores globals so the recorder and audio suites stay isolated.
  for (const [name, value] of [['window', fakeWindow], ['document', fakeDocument]]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }

  const captures = new Set();
  const canvas = Object.assign(new EventTarget(), {
    clientWidth: 800,
    clientHeight: 600,
    dataset: {},
    focus() {},
    setAttribute() {},
    removeAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture(id) {
      captures.delete(id);
      dispatch(canvas, 'lostpointercapture', { pointerId: id });
    },
  });
  const state = createState();
  const recorder = new PhraseRecorder();
  const played = [];
  let resolveUnlock;
  const unlockPromise = delayedUnlock
    ? new Promise(resolve => { resolveUnlock = resolve; })
    : Promise.resolve(true);
  const audio = {
    ready: !delayedUnlock,
    unlock: () => unlockPromise.then(ready => { audio.ready = ready; return ready; }),
    play(pitch, velocity) {
      if (!capacityAvailable || !audio.ready) return null;
      played.push(pitch);
      return { duration: 0.45, velocity };
    },
  };
  const interaction = new Interaction(canvas, state, recorder, audio, () => {});
  const pointer = (type, fields = {}) => dispatch(canvas, type, {
    pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse',
    clientX: 100, clientY: 550, ...fields,
  });
  return {
    canvas, window: fakeWindow, state, recorder, interaction, played, pointer,
    unlock: () => resolveUnlock(true),
    allowVoices: () => { capacityAvailable = true; },
  };
}

for (const cancellation of ['pointercancel', 'lostpointercapture']) {
  test(`${cancellation} from another pointer leaves the active drawing intact`, async t => {
    const h = harness(t);
    h.pointer('pointerdown');
    await settle();
    h.pointer(cancellation, { pointerId: 2, isPrimary: false });
    assert.ok(h.state.drawing);
    assert.equal(h.recorder.phrases.length, 0);

    h.pointer('pointermove', { clientX: 200, clientY: 500 });
    h.pointer(cancellation);
    assert.equal(h.state.drawing, null);
    assert.equal(h.recorder.active, null);
    assert.equal(h.recorder.phrases.length, 1);
    assert.equal(h.recorder.phrases[0].path.at(-1).x, 200);
    assert.equal(h.canvas.hasPointerCapture(1), false);
  });
}

test('blurring after a quick tap cancels its delayed sound and a later gesture still plays', async t => {
  const h = harness(t, { delayedUnlock: true });
  h.pointer('pointerdown');
  h.pointer('pointerup');
  assert.equal(h.recorder.phrases.length, 1);
  dispatch(h.window, 'blur');
  h.unlock();
  await settle();

  assert.deepEqual(h.played, []);
  assert.equal(h.recorder.phrases[0].notes.length, 0);
  assert.equal(h.state.drawing, null);

  h.pointer('pointerdown');
  h.pointer('pointerup');
  await settle();
  assert.equal(h.played.length, 1);
  assert.equal(h.recorder.phrases[1].notes.length, 1);
  assert.equal(h.recorder.phrases[1].notes[0].onset, 0);
});

test('a gesture recovers from voice saturation at the current cursor pitch and time', async t => {
  const h = harness(t, { capacityAvailable: false });
  h.pointer('pointerdown');
  await settle();
  h.pointer('pointermove', { clientX: 300, clientY: 50 });
  assert.deepEqual(h.played, []);
  assert.equal(h.recorder.active.notes.length, 0);

  h.allowVoices();
  h.interaction.tick();
  assert.deepEqual(h.played, ['C5']);
  assert.equal(h.recorder.active.notes[0].pitch, 'C5');
  assert.ok(h.recorder.active.notes[0].onset > 0, 'A recovered note starts when capacity returns.');
  h.pointer('pointerup', { clientX: 300, clientY: 50 });
  const phrase = h.recorder.phrases[0];
  assert.equal(phrase.notes.length, 1);
  assert.ok(phrase.duration >= phrase.notes[0].onset);
});

test('Space release ends keyboard drawing but leaves a mouse gesture active', async t => {
  const h = harness(t);
  h.pointer('pointerdown');
  await settle();
  dispatch(h.canvas, 'keydown', { code: 'Space', repeat: false });
  dispatch(h.canvas, 'keyup', { code: 'Space' });
  assert.ok(h.state.drawing);
  assert.equal(h.recorder.phrases.length, 0);
  h.pointer('pointerup');
  assert.equal(h.recorder.phrases.length, 1);

  dispatch(h.canvas, 'keydown', { code: 'Space', repeat: false });
  await settle();
  assert.ok(h.state.drawing);
  dispatch(h.canvas, 'keyup', { code: 'Space' });
  assert.equal(h.state.drawing, null);
  assert.equal(h.recorder.phrases.length, 2);
});

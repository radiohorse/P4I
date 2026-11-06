import assert from 'node:assert/strict';
import { createGestureMapper, handProximity, opennessRatio } from '../src/gestureMapper.js';
import {
  createAudioEngine, PAD_DEPTH_WET, BELL_DEPTH_WET, DEPTH_RAMP_SECONDS,
  HAND_VOLUME_SMOOTH_SECONDS, HAND_LOST_FADE_SECONDS,
} from '../src/audioEngine.js';
import '../src/depthSketch.js';

function hand(size, ratio = 1.8, handedness = 'Left') {
  return {
    handedness, confidence: .99, wrist: { x: 200, y: 300 },
    ...Object.fromEntries(['index', 'middle', 'ring', 'pinky'].flatMap(finger => [
      [`${finger}_finger_mcp`, { x: 200, y: 300 - size }],
      [`${finger}_finger_tip`, { x: 200, y: 300 - size * ratio }],
    ])),
  };
}
assert.equal(handProximity(hand(40)), 0);
assert.equal(handProximity(hand(145)), 1);
assert.equal(handProximity(hand(90)), handProximity(hand(180), 960), 'source resolution independent');
assert.equal(handProximity(hand(90, 1)), handProximity(hand(90, 1.8)), 'finger spread does not set depth');
assert.equal(opennessRatio(hand(40)), opennessRatio(hand(145)), 'depth does not set openness');
assert.equal(handProximity(hand(90), 0), .5);

const view = { x: 0, y: 0, zoom: 1 };
function movement(fps) {
  const mapper = createGestureMapper();
  mapper.gotHands([hand(40), hand(145, 1.8, 'Right')], 0);
  mapper.updateHands(0, 0, view);
  assert.equal(mapper.hands.Left.proximity, 0);
  assert.equal(mapper.hands.Right.proximity, 1, 'hands have independent depth');
  for (let i = 1; i <= fps; i++) {
    const now = i * 1000 / fps;
    mapper.gotHands([hand(145)], now);
    mapper.updateHands(now, 1000 / fps, view);
    assert.ok(mapper.hands.Left.proximity > 0 && mapper.hands.Left.proximity < 1);
  }
  const near = mapper.hands.Left.proximity;
  mapper.gotHands([], 1400);
  mapper.updateHands(1400, 400, view);
  assert.equal(mapper.hands.Left.visible, false);
  assert.equal(mapper.hands.Left.proximity, near, 'loss preserves tail depth');
  mapper.gotHands([hand(40)], 1500);
  assert.equal(mapper.hands.Left.proximity, 0, 'return uses fresh depth');
  return near;
}
assert.ok(Math.abs(movement(30) - movement(120)) < 1e-12, 'frame-rate independent smoothing');

const effects = [];
class Node {
  disconnect() {} connect() {} amp() {} freq() {} start() {}
  triggerAttack() {} triggerRelease() {} releaseTime() {}
}
class Reverb extends Node {
  constructor() {
    super();
    this.ramps = [];
    this.node = { wet: { rampTo: (...args) => this.ramps.push(args) } };
    this.output = { gain: {
      target: 1, calls: [],
      cancelScheduledValues(time) { this.calls.push(['cancel', time]); },
      setValueAtTime(value, time) { this.calls.push(['set', value, time]); },
      setTargetAtTime(value, time, constant) { this.target = value; this.calls.push(['target', value, time, constant]); },
    } };
    effects.push(this);
  }
  wet(value) { this.initialWet = value; }
}
const clock = { currentTime: 0, resume: async () => {} };
const audio = createAudioEngine({ getAudioContext: () => clock, userStartAudio() {}, random: () => .9 },
  { SinOsc: Node, TriOsc: Node, Envelope: Node, LowPass: Node, Reverb });
audio.setHandProximity('pad', 1); // safe before Start
audio.setHandVolume('pad', 0);
await audio.start();
const [pad, bell] = effects;
assert.deepEqual(PAD_DEPTH_WET, { near: .2, far: 1 });
assert.deepEqual(BELL_DEPTH_WET, { near: .34, far: 1 });
assert.equal(pad.initialWet, .2);
assert.equal(bell.initialWet, .34);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
audio.playPad(60);
audio.setHandProximity('pad', 1);
close(pad.ramps.at(-1)[0], PAD_DEPTH_WET.near);
assert.equal(pad.ramps.at(-1)[1], DEPTH_RAMP_SECONDS);
assert.equal(bell.ramps.length, 0, 'Pad depth leaves Bell unchanged');
audio.setHandProximity('bell', 0);
assert.deepEqual(bell.ramps.at(-1), [BELL_DEPTH_WET.far, DEPTH_RAMP_SECONDS]);
audio.setHandProximity('pad', -2);
assert.deepEqual(pad.ramps.at(-1), [PAD_DEPTH_WET.far, DEPTH_RAMP_SECONDS]);
const calls = pad.ramps.length;
audio.setHandProximity('pad', NaN);
audio.setHandProximity('pad', 0);
assert.equal(pad.ramps.length, calls, 'invalid and unchanged depth schedule no ramps');
audio.pause();
audio.setHandProximity('pad', 1);
assert.equal(pad.ramps.length, calls, 'paused updates are ignored');
await audio.start();
audio.setHandProximity('pad', 1);
close(pad.ramps.at(-1)[0], PAD_DEPTH_WET.near);
assert.equal(effects.length, 2, 'depth updates and resume create no extra effects');

// Volume scales each complete instrument output, including existing notes and tails.
const padGain = pad.output.gain;
const bellGain = bell.output.gain;
assert.equal(padGain.target, 1, 'before-Start updates do not affect initial volume');
clock.currentTime = 10;
audio.setHandVolume('pad', .5);
assert.deepEqual(padGain.calls, [['cancel', 10], ['target', .5, 10, HAND_VOLUME_SMOOTH_SECONDS]]);
assert.equal(bellGain.calls.length, 0, 'left-hand volume leaves Bell unchanged');
audio.setHandVolume('bell', .25);
assert.equal(bellGain.target, .25);
assert.equal(padGain.target, .5, 'right-hand volume leaves Pad unchanged');
audio.playPad(62);
audio.playPadChord([48, 52, 55]);
audio.playBell(72);
assert.equal(padGain.target, .5, 'mono/chord note attacks do not override hand volume');
assert.equal(bellGain.target, .25, 'Bell attacks do not override hand volume');
const volumeCalls = padGain.calls.length;
audio.setHandVolume('pad', .5);
audio.setHandVolume('pad', NaN);
audio.setHandVolume('pad', Infinity);
audio.setHandVolume('unknown', 0);
assert.equal(padGain.calls.length, volumeCalls, 'unchanged and invalid volume do not schedule ramps');
audio.setHandVolume('pad', -1);
audio.setHandVolume('bell', 0);
assert.equal(padGain.target, 0, 'a left fist fades Pad and its reverb to silence');
assert.equal(bellGain.target, 0, 'a right fist fades Bell and its reverb to silence');
audio.playPadChord([48, 52, 55]);
audio.playBell(74);
assert.equal(padGain.target, 0, 'new chord notes cannot bypass a fading output');
assert.equal(bellGain.target, 0, 'new Bell notes cannot bypass a fading output');
audio.setHandVolume('pad', 2);
audio.setHandVolume('bell', 1);
assert.equal(padGain.target, 1, 'fully open restores, never amplifies, the current Pad level');
assert.equal(bellGain.target, 1, 'fully open restores the current Bell level');
audio.setHandVolume('bell', .4);
assert.deepEqual(bellGain.calls.slice(-2), [
  ['cancel', 10], ['target', .4, 10, HAND_VOLUME_SMOOTH_SECONDS],
]);
assert.equal(bellGain.calls.filter(call => call[0] === 'set' && call[2] <= 10).length, 0,
  'rapid reversals never reset gain at the current audio time');
audio.setHandVolume('pad', 1, false);
assert.deepEqual(padGain.calls.slice(-3), [
  ['cancel', 10], ['target', 0, 10, HAND_LOST_FADE_SECONDS],
  ['set', 0, 10 + HAND_LOST_FADE_SECONDS * 12],
]);
const lostCalls = padGain.calls.length;
audio.setHandVolume('pad', .5, false);
assert.equal(padGain.calls.length, lostCalls, 'draw frames must not restart or postpone a loss fade');
audio.setHandVolume('pad', .5, true);
assert.deepEqual(padGain.calls.slice(-2), [
  ['cancel', 10], ['target', .5, 10, HAND_VOLUME_SMOOTH_SECONDS],
], 'return cancels the future silence endpoint and smoothly changes the target');
audio.setHandVolume('pad', .00001);
assert.equal(padGain.target, 0, 'smoothed fist residue still reaches exact silence');
audio.pause();
const pausedCalls = padGain.calls.length;
audio.setHandVolume('pad', 0);
assert.equal(padGain.calls.length, pausedCalls, 'paused volume updates are ignored');
await audio.start();
audio.setHandVolume('pad', 0);
assert.equal(padGain.target, 0, 'resume accepts the current fist state');
assert.equal(effects.length, 2, 'volume updates reuse the original effect outputs');
console.log('PASS: distance endpoints, independent hands, exponential volume smoothing, slow loss fade without restarting, return cancellation, endpoint settling, sustained notes/chords/tails and resume');

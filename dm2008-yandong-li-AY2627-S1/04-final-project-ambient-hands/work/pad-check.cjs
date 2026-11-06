const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('sketch.js', 'utf8');

class AudioNodeMock {
  constructor(...args) { this.args = args; this.attacks = 0; this.releases = 0; this.connections = []; }
  disconnect() { this.disconnected = true; }
  connect(target) { this.connections.push(target); }
  amp(value) { this.amplitude = value; }
  freq(value) { this.frequency = value; }
  wet(value) { this.wetLevel = value; }
  start() { this.started = true; }
  triggerAttack() { this.attacks++; }
  triggerRelease() { this.releases++; }
}

function createContext() {
  let seed = 123456789;
  const clock = { currentTime: 0 };
  const context = vm.createContext({
    console, clock,
    getAudioContext: () => clock,
    millis: () => clock.currentTime * 1000,
    random(a, b) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = seed / 4294967296;
      return a === undefined ? n : b === undefined ? n * a : a + n * (b - a);
    },
    p5: { SinOsc: AudioNodeMock, TriOsc: AudioNodeMock, Envelope: AudioNodeMock,
      LowPass: AudioNodeMock, Reverb: AudioNodeMock },
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run('audioButton={html(){}}; scaleLabel={html(){}}; statusLabel={html(){}}');
  return { context, clock, run };
}

const lifecycle = createContext();
const { run, clock } = lifecycle;
run('createPadVoices()');
assert.equal(run('padVoices.length'), 2);
assert.equal(run('padFilter.args[0]'), 1600);
assert.equal(run('padVoices.every(v=>v.sine.disconnected && v.triangle.disconnected && v.envelope.disconnected)'), true);
assert.equal(run('playPad(60)'), true);
const first = run('activePadVoice');
assert.equal(first.envelope.attacks, 1);
clock.currentTime = 1;
assert.equal(run('playPad(60)'), true);
assert.equal(first.envelope.attacks, 1, 'same pitch must not restart attack');
clock.currentTime = 3;
assert.equal(run('playPad(62)'), true);
assert.equal(first.envelope.releases, 1);
const second = run('activePadVoice');
assert.notEqual(first, second);
clock.currentTime = 3.1;
assert.equal(run('playPad(64)'), false, 'busy fading voice must not be retuned');
assert.equal(run('activePadVoice'), second, 'busy pool must preserve current sustain');
clock.currentTime = 5.2;
assert.equal(run('playPad(64)'), true);
assert.equal(run('activePadVoice'), first);
run('releasePad(); releasePad(); releasePad()');
assert.equal(first.envelope.releases, 2, 'release must happen only once per held note');
assert.equal(run('activePadVoice'), null);

const schedule = createContext();
schedule.run(`
  audioRunning=true;
  intensitySlider={value:()=>100};
  var accepted=[];
  var releases=0;
  playPad=midi=>{accepted.push(midi);return true;};
  releasePad=()=>{releases++;};
  updateNoteGenerator(5,0);
`);
const next = schedule.run('nextOpportunityAt');
assert.ok(next >= 3000 && next <= 5000);
schedule.run('updateNoteGenerator(15,1000)');
assert.equal(schedule.run('accepted.length'), 1, 'moving must not force a rapid Pad change');
schedule.run(`updateNoteGenerator(15,${next})`);
assert.equal(schedule.run('accepted.length'), 2);
schedule.run('intensitySlider={value:()=>0};updateNoteGenerator(15,5001)');
assert.equal(schedule.run('accepted.length'), 2);
assert.equal(schedule.run('releases'), 1, 'zero intensity must release immediately');
schedule.run('intensitySlider={value:()=>100};updateNoteGenerator(-1,5002)');
assert.equal(schedule.run('releases'), 2);

const missed = createContext();
missed.run(`audioRunning=true; intensitySlider={value:()=>0}; var played=0;
  playPad=()=>{played++;return true;}; releasePad=()=>{};
  intensitySlider={value:()=>1}; random=(a,b)=>a===undefined?.99:b===undefined?a*.99:a+(b-a)*.99;
  updateNoteGenerator(5,0);`);
const retry = missed.run('nextOpportunityAt');
assert.ok(retry >= 3000 && retry <= 5000);
missed.run('updateNoteGenerator(5,100);updateNoteGenerator(5,1000)');
assert.equal(missed.run('nextOpportunityAt'), retry, 'miss must retain the slow retry interval');
assert.equal(missed.run('played'), 0);

const switches = createContext();
switches.run('createPadVoices();audioRunning=true;activeInstrument="Pad";playPad(60);instrument="Bell";updateInstrument()');
assert.equal(switches.run('activePadVoice'), null);
assert.equal(switches.run('bellVoices.length'), switches.run('VOICE_COUNT'));
switches.run('instrument="Pad";updateInstrument()');
assert.equal(switches.run('padVoices.length'), 2, 'switching back must reuse nodes');
switches.run('playPad(64);pauseAudio()');
assert.equal(switches.run('activePadVoice'), null);
assert.equal(switches.run('audioRunning'), false);

const probabilities = createContext();
const counts = { 3:0,4:0,5:0,6:0,7:0 };
for (let i=0;i<100000;i++) counts[probabilities.run('chooseNearbyDegree(5)')]++;
for (const [degree, p] of [[5,.4],[4,.2],[6,.2],[3,.1],[7,.1]]) {
  assert.ok(Math.abs(counts[degree]/100000-p)<.006);
}
for (const degree of [0,23]) {
  for (let i=0;i<1000;i++) {
    const selected=probabilities.run(`chooseNearbyDegree(${degree})`);
    assert.ok(selected>=0 && selected<24);
  }
}
console.log(JSON.stringify({result:'PASS', checks:[
  'two Pad voices and routed audio graph', 'same-note sustain without retrigger',
  'crossfade and release-safe reuse', 'idempotent release', '3-5 second hold',
  'no early mouse-movement retrigger', 'zero intensity and leaving canvas',
  'no per-frame retry after missed probability', 'Pad/Bell switching and pause',
  'shared weighted pitch selection and bounded neighbors'
], pitchCounts:counts}, null, 2));

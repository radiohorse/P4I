import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as g from '../src/generativeEngine.js';
import * as h from '../src/harmonicEngine.js';

function setup(factory) {
  let now=0,accepted=true,randomCalls=0;
  const notes=[];
  const audio={running:true,playBell(midi){if(accepted)notes.push({midi,at:now});return accepted;},playPad(){return true;},playPadChord(){return true;},releasePad(){}};
  const random=(a,b)=>{randomCalls++;return a===undefined?.01:b===undefined?.01*a:a+.01*(b-a);};
  const engine=factory({audio,random,getScale:()=> 'Dorian'});
  return {engine,audio,notes,get randomCalls(){return randomCalls;},busy(value){accepted=!value;},
    tick(time,intensity,zone=8){now=time;engine.updateNoteGenerator(engine.bell,zone,intensity,now);assert.ok(Number.isFinite(engine.bell.nextOpportunityAt),'Bell deadline must always be finite');}};
}

// The scale ramps linearly from 1x (fully open) to BELL_GAP_CLOSED_SCALE (closed).
assert.equal(g.bellGapScale(1),1);
assert.equal(g.bellGapScale(.5),1+(g.BELL_GAP_CLOSED_SCALE-1)/2);
assert.equal(g.bellGapScale(0),g.BELL_GAP_CLOSED_SCALE);
assert.ok(Number.isFinite(g.bellGapScale(undefined)));
for(let open=0;open<1;open+=.05)assert.ok(g.bellGapScale(open)>=g.bellGapScale(open+.05));

const report={};
for(const [name,factory] of [['random',g.createGenerativeEngine],['harmony',h.createHarmonicEngine]]){
  report[name]={};
  for(const openness of [1,.5,.1]){
    const test=setup(factory);
    for(let now=0;now<=60000;now+=10)test.tick(now,openness);
    const gaps=test.notes.slice(1).map((n,i)=>n.at-test.notes[i].at);
    assert.ok(gaps.length>0);
    const minimum=g.BELL_OPEN_MIN_GAP_MS*g.bellGapScale(openness);
    assert.ok(Math.min(...gaps)>=minimum-1,`${name}: notes became faster than the minimum interval`);
    report[name][openness]={notes:test.notes.length,minGapMs:Math.min(...gaps),meanGapMs:Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length)};
  }
  assert.ok(report[name]['1'].notes>report[name]['0.5'].notes);
  assert.ok(report[name]['0.5'].notes>report[name]['0.1'].notes);

  // Closing a hand must extend the wait that is already in progress.
  const pending=setup(factory);
  pending.tick(0,1);
  const originalDeadline=pending.engine.bell.nextOpportunityAt;
  const rngCalls=pending.randomCalls;
  pending.tick(originalDeadline-1,.2);
  assert.equal(pending.notes.length,1);
  assert.ok(pending.engine.bell.nextOpportunityAt>originalDeadline);
  assert.equal(pending.randomCalls,rngCalls,'do not reroll the gap every frame');
  const extendedDeadline=pending.engine.bell.nextOpportunityAt;
  pending.tick(extendedDeadline-1,.2);
  assert.equal(pending.notes.length,1);
  pending.tick(extendedDeadline,.2);
  assert.equal(pending.notes.length,2,'stable partly open hand must eventually play, not wait forever');

  pending.tick(extendedDeadline+10,.04);
  const afterFist=pending.notes.length;
  if(name==='harmony')assert.equal(pending.engine.bell.phrase,null);
  for(let t=extendedDeadline+20;t<extendedDeadline+6000;t+=17)pending.tick(t,.04);
  assert.equal(pending.notes.length,afterFist,'near-closed hands must not continue a phrase');
  pending.tick(extendedDeadline+6001,1,-1);
  assert.equal(pending.notes.length,afterFist,'lost hands must not trigger new notes');

  pending.audio.running=false;
  pending.tick(100000,1);
  assert.equal(pending.notes.length,afterFist);
  pending.audio.running=true;
  pending.engine.resetTimers(100000);
  pending.tick(100000,1);
  assert.equal(pending.notes.length,afterFist+1,'resume plays at most one note, without a catch-up burst');
  pending.tick(100000,1);
  assert.equal(pending.notes.length,afterFist+1);

  const jitter=setup(factory);
  jitter.tick(0,1);
  const originalGap=jitter.engine.bell.nextOpportunityAt;
  jitter.tick(originalGap*.1,.04);jitter.tick(originalGap*.2,1);
  assert.equal(jitter.notes.length,1,'brief fist/open jitter must not bypass the note interval');
  jitter.tick(originalGap,1);
  assert.equal(jitter.notes.length,2);

  const busy=setup(factory);
  busy.busy(true);busy.tick(0,1);
  const wait=busy.engine.bell.nextOpportunityAt;
  assert.ok(wait>=g.BELL_OPEN_MIN_GAP_MS);
  if(name==='harmony')assert.equal(busy.engine.bell.lastNote,null);
  busy.busy(false);busy.tick(wait,1);
  assert.equal(busy.notes.length,1,'busy-voice retry must not consume a melody note');
}

// This change is Bell-only: the Pad path and musical choice functions must be intact.
const before=fs.readFileSync('work/harmonic-before-bell-speed.js','utf8');
const after=fs.readFileSync('src/harmonicEngine.js','utf8');
assert.equal(after.slice(after.indexOf('  function updatePad('),after.indexOf('  function noteGap(')),before.slice(before.indexOf('  function updatePad('),before.indexOf('  function noteGap(')));
assert.equal(after.slice(after.indexOf('export function stepClass('),after.indexOf('export function createHarmonicEngine(')),before.slice(before.indexOf('export function stepClass('),before.indexOf('export function createHarmonicEngine(')));

console.log(JSON.stringify({result:'PASS',checks:['both generators slow down monotonically as the hand closes','finite deadlines (NaN regression)','pending wait extends without rerolling or starvation','near-fist cancels phrases and lost hands are silent','Pause/reset has no catch-up burst','busy voices do not consume notes','Pad and harmonic pitch-selection code unchanged'],report},null,2));

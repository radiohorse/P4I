import assert from 'node:assert/strict';
import {createHarmonicEngine} from '../src/harmonicEngine.js';
import {BELL_OPEN_MIN_GAP_MS,BELL_OPEN_MAX_GAP_MS,bellGapScale} from '../src/generativeEngine.js';
import {createAudioEngine,VOICE_COUNT,BELL_STEAL_FADE_MS} from '../src/audioEngine.js';

const report={};
for(const openness of [1,.5,.1]){
  let now=0;
  const events=[];
  // A 0.99 roll would always reject the old partly-open phrase-start probability.
  const random=(a,b)=>a===undefined?.99:b===undefined?a*.99:a+.99*(b-a);
  const audio={running:true,releasePad(){},playPadChord(){return true;},playBell(midi){events.push({at:now,midi});return true;}};
  const e=createHarmonicEngine({audio,random,getScale:()=> 'Dorian'});
  for(now=0;now<=10000;now++){
    e.updateNoteGenerator(e.bell,8,openness,now);
    assert.ok(Number.isFinite(e.bell.nextOpportunityAt));
  }
  const gaps=events.slice(1).map((event,i)=>event.at-events[i].at);
  assert.ok(e.bell.phraseCount>2,'test must cross multiple phrase boundaries');
  const minimum=BELL_OPEN_MIN_GAP_MS*bellGapScale(openness);
  const maximum=BELL_OPEN_MAX_GAP_MS*bellGapScale(openness);
  assert.ok(Math.min(...gaps)>=minimum-1);
  assert.ok(Math.max(...gaps)<=maximum+1,'no phrase rest or probability skip may extend a normal gap');
  const before=events.length;
  for(now=10001;now<11000;now++)e.updateNoteGenerator(e.bell,8,.04,now);
  assert.equal(events.length,before);
  assert.equal(e.bell.phrase,null);
  report[openness]={notes:events.length,phrases:e.bell.phraseCount,minGapMs:Math.min(...gaps),maxGapMs:Math.max(...gaps)};
}

// Test bounded Bell voice reuse and pending cancellation with controllable wall/audio clocks.
const timers=new Map();let timerId=0,wall=0;
const originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
const clock={currentTime:0,resume:async()=>{}};
const nodes=[],attacks=[],releases=[];
const makeNode=type=>class{
  constructor(...args){this.id=nodes.length;this.isBell=type==='Envelope'&&args[2]===0;nodes.push(this);}
  disconnect(){}connect(){}amp(){}wet(){}start(){}freq(){}
  releaseTime(value){releases.push(value);}
  triggerRelease(){}
  triggerAttack(){if(this.isBell)attacks.push({wall,audio:clock.currentTime});}
};
const library=Object.fromEntries(['SinOsc','TriOsc','Envelope','LowPass','Reverb'].map(t=>[t,makeNode(t)]));
function advance(time,audioTime=time/1000){
  clock.currentTime=audioTime;
  let limit=10000;
  while(true){
    const next=[...timers.entries()].filter(([,t])=>t.at<=time).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next)break;
    assert.ok(limit-->0,'timer retries must remain bounded');
    timers.delete(next[0]);wall=next[1].at;next[1].fn();
  }
  wall=time;
}
try{
  globalThis.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:wall+ms});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const audio=createAudioEngine({getAudioContext:()=>clock,userStartAudio(){},random:(a,b)=>(a+b)/2},library);
  await audio.start();
  const count=nodes.length;
  for(let i=0;i<100;i++){
    advance(i*20);
    assert.equal(audio.playBell(60+i%12),true,'fast Bell requests must not wait for the whole pool to empty');
  }
  advance(2020);
  assert.equal(attacks.length,100);
  assert.equal(nodes.length,count,'voice stealing must not grow the audio graph');
  assert.ok(releases.includes(BELL_STEAL_FADE_MS/1000));
  const gaps=attacks.slice(1).map((event,i)=>event.wall-attacks[i].wall);
  assert.ok(Math.max(...gaps)<=20+BELL_STEAL_FADE_MS+1,'no multi-second gap after filling the pool');

  // Fill every voice again at one instant, then cancel a scheduled replacement as a fist would.
  advance(10000);
  for(let i=0;i<VOICE_COUNT;i++)assert.equal(audio.playBell(60+i),true);
  const beforeCancel=attacks.length;
  assert.equal(audio.playBell(80),true);
  audio.cancelPendingBellNotes();
  advance(10040);
  assert.equal(attacks.length,beforeCancel,'a fist must cancel deferred attacks');
  assert.equal(audio.playBell(81),true);
  audio.pause();
  await audio.start();
  advance(10100);
  assert.equal(attacks.length,beforeCancel,'Pause/Start must not revive a stale deferred note');

  advance(20000);
  for(let i=0;i<VOICE_COUNT;i++)audio.playBell(60+i);
  const beforeSuspend=attacks.length;
  audio.playBell(82);
  advance(20100,20); // Wall time passes, but the audio clock is suspended.
  assert.equal(attacks.length,beforeSuspend,'retune only after audio time reaches the end of the fade');
  advance(20130,20.03);
  assert.equal(attacks.length,beforeSuspend+1);
  audio.pause();
  assert.equal(timers.size,0);
  report.voicePool={nodes:count,attacks:100,maxGapMs:Math.max(...gaps),queuedNotesCancelled:true,audioClockChecked:true};
}finally{
  globalThis.setTimeout=originalSetTimeout;globalThis.clearTimeout=originalClearTimeout;
}
console.log(JSON.stringify({result:'PASS',checks:['phrase boundaries use the normal note gap','open hands do not randomly skip new phrases','fists stop and cancel deferred notes','fixed Bell pool stays continuous under rapid input','no graph growth, stale callbacks or premature retuning'],report},null,2));

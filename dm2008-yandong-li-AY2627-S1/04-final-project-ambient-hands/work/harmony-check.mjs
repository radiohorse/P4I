// Node check for the harmonic experiment: node work/harmony-check.mjs
// Seeded randomness, fake audio and simulated hands; no browser, camera or sound card needed.
import assert from 'node:assert/strict';
import { SCALES, ZONE_COUNT, scaleDegreeToMidi } from '../src/musicTheory.js';
import * as h from '../src/harmonicEngine.js';
import { createAudioEngine, PAD_CHORD_VOICES } from '../src/audioEngine.js';

function seeded(seed) {
  return (a, b) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const n = seed / 4294967296;
    return a === undefined ? n : b === undefined ? n * a : a + n * (b - a);
  };
}
const checked = [];
const report = {};

// 1. Chord bank: in the scale, perfect fifth, no diminished, tonic present.
for (const mode of Object.keys(SCALES)) {
  const bank = h.buildChordBank(mode);
  const scalePCs = SCALES[mode];
  for (const chord of bank) {
    for (const pc of chord.pitchClasses) assert.ok(scalePCs.includes(pc), `${mode} ${chord.label}: ${pc} not in scale`);
    const root = chord.pitchClasses[0];
    assert.ok(chord.pitchClasses.includes((root + 7) % 12), `${mode} ${chord.label} has no perfect fifth`);
    assert.ok(!chord.pitchClasses.includes((root + 6) % 12), `${mode} ${chord.label} is diminished`);
  }
  assert.equal(h.tonicChord(bank).pitchClasses[0], 0, `${mode} tonic chord must be on C`);
  for (let step = 0; step < 7; step++) {
    assert.ok(bank.some(chord => chord.steps.includes(step)), `${mode}: no chord contains step ${step}`);
  }
  report[mode] = bank.map(chord => chord.label).join(' ');
}
checked.push('six chord banks: every tone in the mode, every chord has a perfect fifth, no diminished, every hand note has a chord');

// 2. chooseChord / voiceChord follow the hand.
{
  const random = seeded(7);
  for (const mode of Object.keys(SCALES)) {
    const bank = h.buildChordBank(mode);
    for (let zone = 0; zone < ZONE_COUNT; zone++) {
      for (let i = 0; i < 40; i++) {
        const chord = h.chooseChord(zone, bank[Math.floor(random(bank.length))], bank, random);
        assert.ok(h.chordHasDegree(chord, zone), `${mode} zone ${zone}: ${chord.label} misses the hand note`);
        const voicing = h.voiceChord(chord, zone);
        assert.equal(voicing.length, chord.offsets.length);
        for (const degree of voicing) {
          assert.ok(degree >= 0 && degree < ZONE_COUNT, `voicing ${voicing} out of the 24 zones`);
          assert.ok(h.chordHasDegree(chord, degree));
        }
        assert.ok(Math.max(...voicing) - Math.min(...voicing) <= 6, 'close voicing spans at most a seventh');
        assert.ok(voicing.some(degree => h.stepClass(degree) === h.stepClass(zone)), 'voicing contains the hand note');
      }
    }
  }
}
checked.push('chord choice always contains the hand note; voicings are close, inside the 24 zones and include the hand note');

// 3. Ten simulated minutes at 60 fps with two moving hands.
function simulate(seed) {
  const random = seeded(seed);
  const handRandom = seeded(seed + 1);
  const events = [];
  const audio = {
    running: true,
    playPadChord: midis => { events.push(['pad', ...midis]); return true; },
    playBell: midi => { events.push(['bell', midi]); return true; },
    releasePad: () => events.push(['release']),
  };
  const engine = h.createHarmonicEngine({ audio, random, getScale: () => 'Dorian' });
  const { pad, bell, harmony } = engine;
  let padZone = 8, bellZone = 15, padOpen = 1, bellOpen = 1;
  const notes = [], chordChanges = [], unresolved = [];
  let lastNote = null, lastChanged = harmony.changedAt, lastChord = harmony.chord.label;
  for (let frame = 0; frame < 60 * 600; frame++) {
    const now = frame * (1000 / 60);
    if (frame % 120 === 0) { // every 2 s the hands drift
      padZone = Math.min(23, Math.max(0, padZone + Math.round(handRandom(-3, 3))));
      bellZone = Math.min(23, Math.max(0, bellZone + Math.round(handRandom(-2, 2))));
      padOpen = handRandom() < 0.1 ? 0 : handRandom() < 0.3 ? 0.5 : 1;
      bellOpen = handRandom() < 0.1 ? 0 : handRandom() < 0.3 ? 0.5 : 1;
    }
    const pz = padOpen > 0 ? padZone : -1;
    const bz = bellOpen > 0 ? bellZone : -1;
    engine.updateNoteGenerator(pad, pz, padOpen, now);
    if (pz < 0) assert.equal(harmony.chord.label, lastChord, 'chord persists while the Pad hand is away');
    if (harmony.changedAt !== lastChanged) {
      chordChanges.push({ at: now, from: lastChord, to: harmony.chord.label });
      lastChanged = harmony.changedAt;
      lastChord = harmony.chord.label;
    }
    const phraseBefore = bell.phrase;
    engine.updateNoteGenerator(bell, bz, bellOpen, now);
    if (bell.lastNote !== lastNote) {
      lastNote = bell.lastNote;
      notes.push({ ...lastNote, at: now, chordObject: harmony.chord });
    } else if (phraseBefore && !bell.phrase && phraseBefore.pendingMotion !== 0) {
      unresolved.push(phraseBefore.id); // the hand left during a passing tone
    }
  }
  return { events, notes, chordChanges, unresolved, unfinishedPhrase: bell.phrase?.id };
}

const run = simulate(2024);
const again = simulate(2024);
assert.deepEqual(again.events, run.events, 'same seed must give the same music');
checked.push('deterministic: the same seed produces identical Pad/Bell events');

{
  const gaps = run.chordChanges.slice(1).map((c, i) => c.at - run.chordChanges[i].at);
  assert.ok(Math.min(...gaps) >= h.PAD_MIN_CHORD_MS - 20, `chord changed after only ${Math.min(...gaps)} ms`);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  // The Pad hold settings were tuned to 200-1000 ms before this Bell change.
  // Keep checking the explicit minimum chord lifetime, but report the mean instead of
  // requiring the old 4-second average (shared Bell RNG consumption also changes this sample).
  report.chordChanges = { count: run.chordChanges.length, minGapMs: Math.round(Math.min(...gaps)), meanGapMs: Math.round(mean) };
  report.firstChords = run.chordChanges.slice(0, 12).map(c => c.to).join(' -> ');
  for (const event of run.events.filter(e => e[0] === 'pad')) {
    const midis = event.slice(1);
    const scaleNotes = Array.from({ length: ZONE_COUNT }, (_, d) => scaleDegreeToMidi(d, 'Dorian'));
    for (const m of midis) assert.ok(scaleNotes.includes(m), `Pad note ${m} is outside the zone notes`);
  }
}
checked.push('chords respect PAD_MIN_CHORD_MS and persist when the Pad hand leaves; mean timing is reported');

{
  const { notes, unresolved } = run;
  let passing = 0, absorbed = 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    assert.ok(note.degree >= 0 && note.degree < ZONE_COUNT);
    if (note.kind !== 'passing') {
      assert.ok(h.chordHasDegree(note.chordObject, note.degree), `${note.kind} note is not a chord tone of ${note.chord}`);
    }
    if (note.notesLeft === 1) assert.notEqual(note.kind, 'passing', 'a phrase may not end on a passing tone');
    if (note.kind === 'passing') {
      passing++;
      assert.ok(!h.chordHasDegree(note.chordObject, note.degree), 'passing tone must be a non-chord tone');
      const prev = notes[i - 1];
      assert.equal(prev.phraseId, note.phraseId);
      assert.equal(Math.abs(note.degree - prev.degree), 1, 'passing tone is approached by step');
      const next = notes[i + 1];
      if (next && next.phraseId === note.phraseId) {
        if (next.kind === 'resolution') {
          assert.equal(Math.abs(next.degree - note.degree), 1, 'passing tone resolves by step');
        } else {
          // The Pad changed chord under the passing tone and the new chord contains it,
          // so it is already consonant and the melody may continue freely.
          assert.ok(h.chordHasDegree(next.chordObject, note.degree), 'unresolved passing tone');
          absorbed++;
        }
      } else {
        assert.ok(unresolved.includes(note.phraseId) || run.unfinishedPhrase===note.phraseId,
          'only an interrupted phrase or the simulation cutoff can leave a passing tone');
      }
    }
  }
  const resolved = notes.filter(n => n.kind === 'resolution');
  const sameDirection = resolved.filter(n => {
    const i = notes.indexOf(n);
    return Math.sign(n.degree - notes[i - 1].degree) === Math.sign(notes[i - 1].degree - notes[i - 2].degree);
  }).length;
  const phrases = new Set(notes.map(n => n.phraseId)).size;
  const chordShare = notes.filter(n => n.kind !== 'passing').length / notes.length;
  assert.ok(chordShare >= 0.5, `passing tones must resolve to chord tones: share ${chordShare}`);
  assert.ok(passing > 0, 'passing tones should occur occasionally');
  const perMinute = notes.length / 10;
  // Density is now deliberately continuous and follows the user's tempo settings.
  // Exact note/phrase boundary gaps are checked in continuous-bell-check.mjs.
  report.bell = {
    notes: notes.length, phrases, notesPerMinute: Math.round(perMinute),
    chordToneShare: +chordShare.toFixed(3), passingTones: passing,
    resolvedSameDirection: sameDirection, resolvedByStepBack: resolved.length - sameDirection,
    interruptedPassingTones: unresolved.length, absorbedByChordChange: absorbed,
    meanPhraseLength: +(notes.length / phrases).toFixed(2),
  };
}
checked.push('Bell: chord tones alternate with resolved passing tones, phrases never end on a passing tone, density reported');

// 4. Pad chord voices in the real audio engine (mocked p5.sound).
{
  const log = [];
  let id = 0;
  const node = type => class {
    constructor() { this.id = id++; this.type = type; }
    disconnect() {} connect() {} amp() {} wet() {} start() {}
    freq(f) { this.f = f; }
    triggerAttack() { log.push(['attack', this.id]); }
    triggerRelease() { log.push(['release', this.id]); }
  };
  const lib = Object.fromEntries(['SinOsc', 'TriOsc', 'Envelope', 'LowPass', 'Reverb'].map(t => [t, node(t)]));
  const clock = { currentTime: 0, resume: async () => {} };
  const audio = createAudioEngine({ getAudioContext: () => clock, userStartAudio() {}, random: seeded(3) }, lib);
  assert.equal(audio.playPadChord([48, 52, 55]), false, 'no chord before Start');
  await audio.start();
  const nodesAfterStart = id;
  const count = kind => log.filter(e => e[0] === kind).length;
  assert.equal(audio.playPadChord([48, 52, 55]), true);
  assert.equal(id - nodesAfterStart, PAD_CHORD_VOICES * 3, 'chord pool is created once, on the first chord');
  assert.equal(count('attack'), 3);
  log.length = 0;
  assert.equal(audio.playPadChord([48, 53, 57]), true);
  assert.deepEqual([count('attack'), count('release')], [2, 2], 'common tone 48 keeps sustaining');
  log.length = 0;
  audio.releasePad();
  assert.equal(count('release'), 3);
  assert.equal(audio.playPadChord([50, 53, 57]), true, '3 voices are still free while 5 fade out');
  assert.equal(audio.playPadChord([43, 47, 50, 55]), false, 'no free voice may be retuned while fading');
  clock.currentTime = 2.2;
  assert.equal(audio.playPadChord([43, 47, 50, 55]), true);
  const nodes = id;
  audio.pause(); await audio.start(); audio.playPadChord([48, 52, 55]);
  assert.equal(id, nodes, 'Start/Pause reuse the chord pool');
}
checked.push('audio: chord pool is lazy, common tones sustain, fading voices are never retuned, pause releases chords');

console.log(JSON.stringify({ result: 'PASS', checked, report }, null, 2));

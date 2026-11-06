import { SCALES, ZONE_COUNT, START_DEGREE, scaleDegreeToMidi, midiToLabel } from "./musicTheory.js";
import {
  BELL_OPEN_MIN_GAP_MS, BELL_OPEN_MAX_GAP_MS, BELL_FIST_THRESHOLD,
  resetBellWait, refreshBellWait, scheduleBellWait,
} from "./generativeEngine.js";
// Keep these exports available for debugging; the shared settings live in generativeEngine.js.
export { BELL_GAP_CLOSED_SCALE, bellGapScale } from "./generativeEngine.js";

// Experiment: a shared harmonic context instead of independent random notes.
// The Pad hand chooses a slowly changing chord; the Bell hand plays short phrases over it.
// It has the same interface as createGenerativeEngine, so sketch.js can swap one for the other.

// ---------- Chord bank ----------
// Shapes are scale steps above the chord root: 0 = root, 1 = second, 2 = third, 4 = fifth, 6 = seventh.
// Every chord must contain a perfect fifth (7 semitones), so diminished chords never enter the bank.
// requires: { step: [allowed semitones above the root] } filters out harsh colors.
export const CHORD_SHAPES = [
  { name: "triad",   steps: [0, 2, 4],    weight: 1 },
  { name: "sus2",    steps: [0, 1, 4],    weight: 0.3,  requires: { 1: [2] } },
  { name: "seventh", steps: [0, 2, 4, 6], weight: 0.35, requires: { 6: [10, 11] } },
];
// Preference for each root, by scale step from the tonic: I, II, III, IV, V, VI, VII.
export const ROOT_WEIGHTS = [1.6, 0.7, 0.7, 1.1, 1.1, 0.9, 0.7];
// How well the hand's note fits as each chord member (key = scale steps above the root).
export const ROLE_WEIGHTS = { 0: 1, 1: 0.5, 2: 0.6, 4: 0.8, 6: 0.4 };
export const STAY_WEIGHT = 3;    // Keep the current chord while it still contains the hand's note.
export const COLOR_WEIGHT = 2.8; // Same root, different shape, e.g. Dm -> Dm7.

// ---------- Pad timing (milliseconds) ----------
export const PAD_CHORD_MIN_HOLD_MS = 200;
export const PAD_CHORD_MAX_HOLD_MS = 1000;
export const PAD_REST_MIN_MS = 50;     // Silence after a skipped decision (half-closed hand).
export const PAD_REST_MAX_MS = 200;
// Shortest time any chord lasts. Also: if the hand moves off the chord, change after this long
// instead of waiting for the full hold. Before that, the Pad re-voices the current chord near the hand.
export const PAD_MIN_CHORD_MS = 1000;
export const PAD_RETRY_MS = 90;         // Voices still fading out: try again soon.

// ---------- Bell phrases ----------
export const BELL_PHRASE_MIN_NOTES = 2;
export const BELL_PHRASE_MAX_NOTES = 8; // Reached only with a fully open hand.
export const BELL_NOTE_GAPS = [
  { ms: BELL_OPEN_MIN_GAP_MS, probability: 0.3 },
  { ms: (BELL_OPEN_MIN_GAP_MS + BELL_OPEN_MAX_GAP_MS) / 2, probability: 0.45 },
  { ms: BELL_OPEN_MAX_GAP_MS, probability: 0.25 },
];
export const BELL_GAP_JITTER = 0.96; // Multiply by 0.04-1.96, then clamp to the open-hand min/max gap.
export const BELL_RETRY_MS = BELL_OPEN_MIN_GAP_MS;
export const MELODY_RANGE = 3;         // Bell notes stay within zones of the hand.
export const PASSING_TONE_CHANCE = 0.15;
export const ENDING_ROOT_WEIGHT = 4.5; // Phrase endings lean toward the chord root.

// Scale step (0-6, 0 = tonic C) of a zone. Zone 0 is START_DEGREE steps above C.
export function stepClass(degree) {
  return (((START_DEGREE + degree) % 7) + 7) % 7;
}

function stepSemitones(intervals, root, offset) {
  const step = root + offset;
  return intervals[step % 7] + 12 * Math.floor(step / 7) - intervals[root];
}

function chordLabel(rootPitchClass, shapeName, semitones) {
  const name = midiToLabel(60 + rootPitchClass).slice(0, -1); // "C4" -> "C"
  if (shapeName === "sus2") return `${name}sus2`;
  const minor = semitones[1] === 3;
  if (shapeName === "seventh") {
    const seventh = semitones[3];
    if (minor) return `${name}${seventh === 10 ? "m7" : "m(maj7)"}`;
    return `${name}${seventh === 11 ? "maj7" : "7"}`;
  }
  return minor ? `${name}m` : name;
}

export function buildChordBank(scaleName) {
  const intervals = SCALES[scaleName] || SCALES.Ionian;
  const bank = [];
  for (let root = 0; root < 7; root++) {
    for (const shape of CHORD_SHAPES) {
      const semitones = shape.steps.map(offset => stepSemitones(intervals, root, offset));
      if (semitones[shape.steps.indexOf(4)] !== 7) continue;
      const allowed = Object.entries(shape.requires || {}).every(([offset, values]) =>
        values.includes(semitones[shape.steps.indexOf(Number(offset))]));
      if (!allowed) continue;
      bank.push({
        label: chordLabel(intervals[root], shape.name, semitones),
        root,
        shape: shape.name,
        offsets: shape.steps,
        steps: shape.steps.map(offset => (root + offset) % 7),
        pitchClasses: semitones.map(semitone => (intervals[root] + semitone) % 12),
        weight: shape.weight * ROOT_WEIGHTS[root],
      });
    }
  }
  return bank;
}

export function tonicChord(bank) {
  return bank.find(chord => chord.root === 0 && chord.shape === "triad");
}

export function chordHasDegree(chord, degree) {
  return chord.steps.includes(stepClass(degree));
}

function pickWeighted(options, random) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  const roll = random(total);
  let accumulated = 0;
  for (const option of options) {
    accumulated += option.weight;
    if (roll < accumulated) return option;
  }
  return options[options.length - 1];
}

// Only chords that contain the hand's note are candidates, so the Pad always agrees with the hand.
export function chooseChord(zone, current, bank, random) {
  const handStep = stepClass(zone);
  const options = bank
    .filter(chord => chord.steps.includes(handStep))
    .map(chord => {
      let weight = chord.weight * ROLE_WEIGHTS[(handStep - chord.root + 7) % 7];
      if (current && chord.label === current.label) weight *= STAY_WEIGHT;
      else if (current && chord.root === current.root) weight *= COLOR_WEIGHT;
      return { chord, weight };
    });
  return pickWeighted(options, random).chord;
}

// Close voicing: the nearest chord root at or below the hand, with the other tones stacked above it.
// Returns zone degrees (0-23), so every Pad note is also a visible zone.
export function voiceChord(chord, zone) {
  let root = zone;
  while (root >= 0 && stepClass(root) !== chord.root) root--;
  if (root < 0) {
    root = zone;
    while (stepClass(root) !== chord.root) root++;
  }
  if (root + chord.offsets[chord.offsets.length - 1] >= ZONE_COUNT) root -= 7;
  return chord.offsets.map(offset => root + offset);
}

function leapWeight(distance) {
  if (distance === null) return 1;
  if (distance === 0) return 0.3;
  if (distance <= 2) return 1;
  if (distance <= 4) return 0.55;
  return 0.25;
}

// One melody note. kind is "chord", "passing" or "resolution".
// A passing tone steps off a chord tone and must continue by step, same direction, to a chord tone.
export function chooseMelodyNote({ center, chord, previous = null, pendingMotion = 0, notesLeft = 1, random }) {
  const isChordTone = degree => degree >= 0 && degree < ZONE_COUNT && chordHasDegree(chord, degree);

  if (pendingMotion !== 0 && previous !== null) {
    if (isChordTone(previous + pendingMotion)) return { degree: previous + pendingMotion, kind: "resolution" };
    // The Pad changed chord under the passing tone: step back instead.
    if (isChordTone(previous - pendingMotion)) return { degree: previous - pendingMotion, kind: "resolution" };
  }

  const low = Math.max(0, center - MELODY_RANGE);
  const high = Math.min(ZONE_COUNT - 1, center + MELODY_RANGE);

  // notesLeft >= 2 leaves room for the resolution note inside the phrase.
  if (previous !== null && notesLeft >= 2 && isChordTone(previous) && random() < PASSING_TONE_CHANCE) {
    const options = [-1, 1]
      .map(motion => ({ degree: previous + motion, motion }))
      .filter(({ degree, motion }) =>
        degree >= low && degree <= high && !isChordTone(degree) && isChordTone(degree + motion));
    if (options.length > 0) {
      const pick = options[Math.floor(random(options.length))];
      return { degree: pick.degree, kind: "passing", motion: pick.motion };
    }
  }

  const options = [];
  for (let degree = low; degree <= high; degree++) {
    if (!isChordTone(degree)) continue;
    let weight = (1 / (1 + Math.abs(degree - center)))
      * leapWeight(previous === null ? null : Math.abs(degree - previous));
    if (notesLeft === 1 && stepClass(degree) === chord.root) weight *= ENDING_ROOT_WEIGHT;
    options.push({ degree, weight });
  }
  if (options.length === 0) {
    // Fallback (should not happen with MELODY_RANGE >= 2): nearest chord tone anywhere.
    for (let distance = 1; distance < ZONE_COUNT; distance++) {
      for (const degree of [center - distance, center + distance]) {
        if (isChordTone(degree)) return { degree, kind: "chord" };
      }
    }
  }
  return { degree: pickWeighted(options, random).degree, kind: "chord" };
}

export function createHarmonicEngine({ audio, random, getScale, padHand = "Left", bellHand = "Right" }) {
  const pad = { hand: padHand, nextOpportunityAt: 0, glow: new Array(ZONE_COUNT).fill(0), sounding: false };
  const bell = {
    hand: bellHand, nextOpportunityAt: 0, glow: new Array(ZONE_COUNT).fill(0),
    phrase: null, lastNote: null, phraseCount: 0,
    waitStartedAt: 0, baseWaitMs: null,
  };
  // The shared context. The Pad writes it; the Bell reads it. It persists while the Pad hand is away.
  const harmony = { scale: null, bank: [], chord: null, voicing: [], changedAt: -Infinity };
  syncScale();

  function syncScale() {
    const scale = getScale();
    if (scale === harmony.scale) return;
    harmony.scale = scale;
    harmony.bank = buildChordBank(scale);
    harmony.chord = tonicChord(harmony.bank);
    harmony.voicing = [];
    harmony.changedAt = -Infinity;
    pad.sounding = false;
    bell.phrase = null;
    resetBellWait(bell, 0);
  }

  function updatePad(zone, intensity, nowMs) {
    if (zone < 0 || intensity <= 0) {
      audio.releasePad();
      pad.sounding = false;
      pad.nextOpportunityAt = nowMs;
      return;
    }
    const canChange = nowMs - harmony.changedAt >= PAD_MIN_CHORD_MS;
    const handLeftChord = pad.sounding && canChange && !chordHasDegree(harmony.chord, zone);
    if (nowMs < pad.nextOpportunityAt && !handLeftChord) return;

    // Openness is the chance that this decision plays; otherwise the Pad rests.
    if (random() >= intensity) {
      audio.releasePad();
      pad.sounding = false;
      pad.nextOpportunityAt = nowMs + random(PAD_REST_MIN_MS, PAD_REST_MAX_MS);
      return;
    }
    // Too soon for new harmony (e.g. the hand just came back): keep the chord, move only the voicing.
    const chord = canChange ? chooseChord(zone, harmony.chord, harmony.bank, random) : harmony.chord;
    const voicing = voiceChord(chord, zone);
    const midis = voicing.map(degree => scaleDegreeToMidi(degree, harmony.scale));
    if (!audio.playPadChord(midis)) {
      pad.nextOpportunityAt = nowMs + PAD_RETRY_MS;
      return;
    }
    pad.nextOpportunityAt = nowMs + random(PAD_CHORD_MIN_HOLD_MS, PAD_CHORD_MAX_HOLD_MS);
    if (chord.label !== harmony.chord.label) harmony.changedAt = nowMs;
    harmony.chord = chord;
    harmony.voicing = voicing;
    pad.sounding = true;
    for (const degree of voicing) pad.glow[degree] = Math.max(pad.glow[degree], degree === zone ? 1 : 0.55);
  }

  function noteGap() {
    const gap = pickWeighted(BELL_NOTE_GAPS.map(g => ({ ms: g.ms, weight: g.probability })), random).ms;
    const varied = gap * random(1 - BELL_GAP_JITTER, 1 + BELL_GAP_JITTER);
    return Math.min(BELL_OPEN_MAX_GAP_MS, Math.max(BELL_OPEN_MIN_GAP_MS, varied));
  }

  function updateBell(zone, intensity, nowMs) {
    if (zone < 0 || intensity <= BELL_FIST_THRESHOLD) {
      bell.phrase = null;
      audio.cancelPendingBellNotes?.();
      refreshBellWait(bell, intensity);
      return;
    }
    refreshBellWait(bell, intensity);
    if (nowMs < bell.nextOpportunityAt) return;

    if (!bell.phrase) {
      // An open hand always continues. Openness controls pace and phrase length, not random rests.
      const maxNotes = BELL_PHRASE_MIN_NOTES + intensity * (BELL_PHRASE_MAX_NOTES - BELL_PHRASE_MIN_NOTES);
      bell.phrase = {
        id: ++bell.phraseCount,
        notesLeft: Math.round(random(BELL_PHRASE_MIN_NOTES, maxNotes)),
        previous: null,
        pendingMotion: 0,
      };
    }

    const phrase = bell.phrase;
    const note = chooseMelodyNote({
      center: zone, chord: harmony.chord, previous: phrase.previous,
      pendingMotion: phrase.pendingMotion, notesLeft: phrase.notesLeft, random,
    });
    if (!audio.playBell(scaleDegreeToMidi(note.degree, harmony.scale))) {
      scheduleBellWait(bell, nowMs, BELL_RETRY_MS, intensity); // All Bell voices still ringing.
      return;
    }
    bell.glow[note.degree] = 1;
    bell.lastNote = { ...note, phraseId: phrase.id, notesLeft: phrase.notesLeft, chord: harmony.chord.label };
    phrase.previous = note.degree;
    phrase.pendingMotion = note.kind === "passing" ? note.motion : 0;
    phrase.notesLeft--;
    if (phrase.notesLeft <= 0) bell.phrase = null;
    // A phrase boundary uses exactly the same gap as any other note: no extra rest.
    scheduleBellWait(bell, nowMs, noteGap(), intensity);
  }

  function updateNoteGenerator(voice, zone, intensity, nowMs) {
    if (!audio.running) return;
    syncScale();
    if (voice === pad) updatePad(zone, intensity, nowMs);
    else updateBell(zone, intensity, nowMs);
  }

  function resetTimers(nowMs) {
    pad.nextOpportunityAt = nowMs;
    resetBellWait(bell, nowMs);
    pad.sounding = false;
    bell.phrase = null;
  }

  function clearGlows() {
    pad.glow.fill(0);
    bell.glow.fill(0);
  }

  return { pad, bell, harmony, updateNoteGenerator, resetTimers, clearGlows };
}

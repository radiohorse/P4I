import { ZONE_COUNT, scaleDegreeToMidi } from "./musicTheory.js";

// Timing controls when to choose; NOTE_CHOICES controls what to choose.
export const MIN_WAIT_MS = 60;
export const MAX_WAIT_MS = 320;
export const PAD_MIN_HOLD_MS = 100;
export const PAD_MAX_HOLD_MS = 1100;
export const NOTE_CHOICES = [
  { offset: 0,  probability: 0.4 },
  { offset: -1, probability: 0.2 },
  { offset: 1,  probability: 0.2 },
  { offset: -2, probability: 0.1 },
  { offset: 2,  probability: 0.1 },
];

export function chooseNearbyDegree(centerDegree, random) {
  const choices = NOTE_CHOICES.filter(({ offset }) => {
    const degree = centerDegree + offset;
    return degree >= 0 && degree < ZONE_COUNT;
  });
  const totalWeight = choices.reduce((total, choice) => total + choice.probability, 0);
  const roll = random(totalWeight);
  let accumulated = 0;
  for (const choice of choices) {
    accumulated += choice.probability;
    if (roll < accumulated) return centerDegree + choice.offset;
  }
  return centerDegree + choices[choices.length - 1].offset;
}

export function createGenerativeEngine({ audio, random, getScale, padHand = "Left", bellHand = "Right" }) {
  // Independent timers and glow arrays let both hands play simultaneously.
  const pad = { hand: padHand, nextOpportunityAt: 0, glow: new Array(ZONE_COUNT).fill(0) };
  const bell = { hand: bellHand, nextOpportunityAt: 0, glow: new Array(ZONE_COUNT).fill(0) };

  function updateNoteGenerator(voice, zone, intensity, nowMs) {
    if (!audio.running) return;
    const isPad = voice === pad;
    if (isPad && (zone < 0 || intensity <= 0)) {
      audio.releasePad();
      voice.nextOpportunityAt = nowMs;
      return;
    }
    if (nowMs < voice.nextOpportunityAt) return;

    // No per-frame probability, and no catch-up burst after a stalled frame.
    const wait = isPad
      ? random(PAD_MIN_HOLD_MS, PAD_MAX_HOLD_MS)
      : random(MIN_WAIT_MS, MAX_WAIT_MS);
    voice.nextOpportunityAt = nowMs + wait;
    if (zone < 0 || random() >= intensity) {
      if (isPad) audio.releasePad();
      return;
    }

    const degree = chooseNearbyDegree(zone, random);
    const midi = scaleDegreeToMidi(degree, getScale());
    const accepted = isPad ? audio.playPad(midi) : audio.playBell(midi);
    if (!accepted) return;
    if (degree >= 0 && degree < ZONE_COUNT) voice.glow[degree] = 1;
  }

  function resetTimers(nowMs) {
    pad.nextOpportunityAt = nowMs;
    bell.nextOpportunityAt = nowMs;
  }

  function clearGlows() {
    pad.glow.fill(0);
    bell.glow.fill(0);
  }

  return { pad, bell, updateNoteGenerator, resetTimers, clearGlows };
}

import { ZONE_COUNT, scaleDegreeToMidi } from "./musicTheory.js";

// Bell speed settings shared by the random and harmony generators. All times are milliseconds.
// Larger gaps mean slower notes. Closing the hand stretches each gap toward 5x its open value.
export const BELL_OPEN_MIN_GAP_MS = 30;
export const BELL_OPEN_MAX_GAP_MS = 190;
export const BELL_GAP_CLOSED_SCALE = 5;
export const BELL_FIST_THRESHOLD = 0.05; // Treat <= 5% openness as a closed hand, including smoothing residue.

// Pad timing is independent; its existing settings are preserved.
export const PAD_MIN_HOLD_MS = 50;
export const PAD_MAX_HOLD_MS = 1000;
export const NOTE_CHOICES = [
  { offset: 0,  probability: 0.4 },
  { offset: -1, probability: 0.2 },
  { offset: 1,  probability: 0.2 },
  { offset: -2, probability: 0.1 },
  { offset: 2,  probability: 0.1 },
];

export function bellGapScale(intensity) {
  const open = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return 1 + (BELL_GAP_CLOSED_SCALE - 1) * (1 - open);
}

export function resetBellWait(bell, nowMs) {
  bell.waitStartedAt = nowMs;
  bell.baseWaitMs = null;
  bell.nextOpportunityAt = nowMs;
}

export function refreshBellWait(bell, intensity) {
  if (bell.baseWaitMs === null || bell.baseWaitMs === undefined) return;
  // Recalculate from the original start, NOT from now. Otherwise the deadline would move forever.
  bell.nextOpportunityAt = bell.waitStartedAt + bell.baseWaitMs * bellGapScale(intensity);
}

export function scheduleBellWait(bell, nowMs, baseWaitMs, intensity) {
  bell.waitStartedAt = nowMs;
  bell.baseWaitMs = baseWaitMs;
  refreshBellWait(bell, intensity);
}

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
  const bell = {
    hand: bellHand, nextOpportunityAt: 0, glow: new Array(ZONE_COUNT).fill(0),
    waitStartedAt: 0, baseWaitMs: null,
  };

  function updateNoteGenerator(voice, zone, intensity, nowMs) {
    if (!audio.running) return;
    const isPad = voice === pad;
    if (isPad && (zone < 0 || intensity <= 0)) {
      audio.releasePad();
      voice.nextOpportunityAt = nowMs;
      return;
    }
    if (!isPad) {
      if (zone < 0 || intensity <= BELL_FIST_THRESHOLD) {
        audio.cancelPendingBellNotes?.();
        // Keep the previous wait so brief fist/open jitter cannot create rapid extra notes.
        refreshBellWait(bell, intensity);
        return;
      }
      // The current wait also lengthens while the hand closes; no new random number is drawn here.
      refreshBellWait(bell, intensity);
    }
    if (nowMs < voice.nextOpportunityAt) return;

    // No per-frame probability, and no catch-up burst after a stalled frame.
    if (isPad) {
      voice.nextOpportunityAt = nowMs + random(PAD_MIN_HOLD_MS, PAD_MAX_HOLD_MS);
    } else {
      scheduleBellWait(bell, nowMs, random(BELL_OPEN_MIN_GAP_MS, BELL_OPEN_MAX_GAP_MS), intensity);
    }
    // Bell is continuous while open; Pad retains its existing probability-controlled rests.
    if (zone < 0 || (isPad && random() >= intensity)) {
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
    resetBellWait(bell, nowMs);
  }

  function clearGlows() {
    pad.glow.fill(0);
    bell.glow.fill(0);
  }

  return { pad, bell, updateNoteGenerator, resetTimers, clearGlows };
}

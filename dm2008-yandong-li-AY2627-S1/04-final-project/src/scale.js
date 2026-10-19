import { PITCHES, CONFIG } from './config.js';

export function pitchIndexAt(y, height) {
  const fraction = Math.max(0, Math.min(1, 1 - y / Math.max(1, height)));
  return Math.min(PITCHES.length - 1, Math.floor(fraction * PITCHES.length));
}

// A small dead zone around boundaries prevents jitter from retriggering notes.
export function stablePitchIndex(y, height, previousIndex = null) {
  if (previousIndex !== null) {
    const bandHeight = height / PITCHES.length;
    const top = height - (previousIndex + 1) * bandHeight;
    const bottom = height - previousIndex * bandHeight;
    const margin = Math.min(CONFIG.pitchHysteresisPx, bandHeight * 0.15);
    if (y >= top - margin && y <= bottom + margin) return previousIndex;
  }
  return pitchIndexAt(y, height);
}

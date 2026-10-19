import { PITCHES, REPLY_CONFIG } from './config.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Oldest → newest weights are 1:2:4. Silent drawings cannot supply a melody.
export function choosePhrase(phrases, random = Math.random) {
  const playable = phrases.filter(phrase => phrase.notes.length && phrase.path.length);
  const total = playable.reduce((sum, _, i) => sum + 2 ** i, 0);
  let choice = random() * total;
  return playable.find((_, i) => (choice -= 2 ** i) < 0) ?? playable.at(-1) ?? null;
}

// Every pitch comes from the source. Randomness only makes small musical choices.
export function generateResponse(source, round = 0, random = Math.random, noteLimit = Infinity) {
  if (!source?.notes.length || !source.path.length) return null;
  const depth = clamp(round, 0, REPLY_CONFIG.maxRounds - 1);
  const original = source.notes;
  const density = [0.8, 0.55, 0.3][depth];
  const count = Math.min(noteLimit, REPLY_CONFIG.maxNotes[depth], Math.max(1, Math.ceil(original.length * density)));
  // Keep a recognizable opening and ending, sampling the interior in order.
  const selected = Array.from({ length: count }, (_, i) => {
    const index = count === 1 ? 0 : Math.round(i * (original.length - 1) / (count - 1));
    return original[index];
  });
  const pitches = selected.map(note => note.pitch);
  // A single interior exchange retains the overall contour and tonal material.
  if (count >= 4 && random() < 0.35) {
    const i = 1 + Math.floor(random() * (count - 3));
    [pitches[i], pitches[i + 1]] = [pitches[i + 1], pitches[i]];
  }
  const stretch = 1.45 + random() * 0.3 + depth * 0.2;
  let onset = 0;
  const notes = selected.map((note, i) => {
    if (i > 0) {
      const interval = selected[i].onset - selected[i - 1].onset;
      const pause = i % 3 === 0 || random() < 0.2 ? 0.35 + random() * 0.45 : 0;
      onset += clamp(interval * stretch, 0.38 + depth * 0.15, 1.8) + pause;
    }
    let pitch = pitches[i];
    if (random() < 0.16) {
      const index = PITCHES.indexOf(pitch);
      const shifted = index + (index >= 5 ? -5 : 5); // Five pentatonic steps = an octave.
      if (PITCHES[shifted]) pitch = PITCHES[shifted];
    }
    return {
      pitch, onset,
      duration: clamp(note.duration * stretch, 0.65, 1.2),
      velocity: clamp((note.velocity ?? 0.45) * 0.75 * 0.7 ** depth, 0.08, 0.4),
      sourceOnset: note.onset,
      pathEnd: 1,
    };
  });

  const pathCount = Math.min(source.path.length, REPLY_CONFIG.maxPathPoints);
  const sampled = Array.from({ length: pathCount }, (_, i) =>
    source.path[Math.round(i * (source.path.length - 1) / Math.max(1, pathCount - 1))]);
  const horizontalShift = (random() - 0.5) * 0.035;
  const verticalShift = (random() < 0.5 ? -1 : 1) * (0.035 + random() * 0.02);
  const path = sampled.map(point => ({
    ...point,
    nx: clamp(0.5 + (point.nx - 0.5) * 0.94 + horizontalShift, 0.015, 0.985),
    ny: clamp(0.5 + (point.ny - 0.5) * 0.94 + verticalShift, 0.015, 0.985),
  }));
  for (let i = 0; i < notes.length - 1; i++) {
    const end = path.findIndex(point => point.time >= selected[i + 1].onset);
    notes[i].pathEnd = end < 0 ? 1 : end / Math.max(1, path.length - 1);
  }
  return {
    sourceId: source.id,
    round: depth,
    notes,
    path,
    duration: notes.at(-1).onset + notes.at(-1).duration,
  };
}

// Each sounding note reveals a segment. The line rests in the musical pauses.
export function revealProgress(notes, elapsed) {
  let progress = 0;
  for (const note of notes) {
    if (elapsed < note.onset) break;
    const fraction = clamp((elapsed - note.onset) / note.duration, 0, 1);
    progress += (note.pathEnd - progress) * fraction;
  }
  return progress;
}

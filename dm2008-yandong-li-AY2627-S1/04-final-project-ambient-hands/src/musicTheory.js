// Musical data and pure pitch conversion. No camera, drawing or audio nodes live here.
// Intervals are semitones above C: Lydian uses F# (6), Ionian uses F (5).
export const SCALES = {
  Ionian:     [0, 2, 4, 5, 7, 9, 11],
  Dorian:     [0, 2, 3, 5, 7, 9, 10],
  Phrygian:   [0, 1, 3, 5, 7, 8, 10],
  Lydian:     [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Aeolian:    [0, 2, 3, 5, 7, 8, 10],
};

export const ZONE_COLUMNS = 12;
export const ZONE_ROWS = 2;
export const ZONE_COUNT = ZONE_COLUMNS * ZONE_ROWS;
export const BASE_MIDI = 36; // C2. Add 12 to transpose the whole grid up one octave.
export const START_DEGREE = 4; // Start on G2, the fifth note of each C-based mode.
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export function scaleDegreeToMidi(degree, scaleName = "Ionian") {
  const intervals = SCALES[scaleName] || SCALES.Ionian;
  const absoluteDegree = START_DEGREE + degree;
  const octave = Math.floor(absoluteDegree / intervals.length);
  // Normalize the remainder so this also works with negative degrees.
  const index = ((absoluteDegree % intervals.length) + intervals.length) % intervals.length;
  return BASE_MIDI + octave * 12 + intervals[index];
}

export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToLabel(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export function notesForScale(scaleName) {
  return Array.from({ length: ZONE_COUNT }, (_, degree) => scaleDegreeToMidi(degree, scaleName));
}

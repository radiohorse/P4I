// Low to high: two octaves of C major pentatonic, with a final C.
export const PITCHES = Object.freeze([
  'C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5',
]);

export const CONFIG = Object.freeze({
  noteIntervalMs: 95,
  pitchHysteresisPx: 5,
  noteVelocity: 0.45,
  fadeDelayMs: 2500,
  fadeDurationMs: 24000,
  maxVisiblePhrases: 48,
  maxVisualPoints: 1800,
  memorySize: 3,
  maxRecordedPoints: 4096,
  maxRecordedNotes: 1024,
});

export const REPLY_CONFIG = Object.freeze({
  initialWaitMs: 2000,
  laterWaitMs: [8000, 16000],
  maxRounds: 3,
  maxIdleMs: 90000,
  maxNotes: [10, 6, 3],
  maxPathPoints: 600,
  maxLateSeconds: 0.15,
});

export const MODES = Object.freeze({
  IDLE: 'IDLE',
  USER_PLAYING: 'USER_PLAYING',
  WAITING_TO_REPLY: 'WAITING_TO_REPLY',
  SYSTEM_REPLYING: 'SYSTEM_REPLYING',
});

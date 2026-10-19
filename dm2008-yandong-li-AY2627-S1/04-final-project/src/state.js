// Musical recordings belong to the recorder; short-lived display state lives here.
export function createState() {
  return {
    mode: MODES.IDLE,
    drawing: null,
    visiblePhrases: [],
    cursor: { x: 0, y: 0, visible: false, pressed: false, pitch: null },
    lastNoteAt: -Infinity,
    hasDrawn: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}
import { MODES } from './config.js';


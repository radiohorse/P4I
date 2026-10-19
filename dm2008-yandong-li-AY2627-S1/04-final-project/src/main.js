import { AudioEngine } from './audio-engine.js';
import { PhraseRecorder } from './phrase-recorder.js';
import { createState } from './state.js';
import { Interaction } from './interaction.js';
import { Renderer } from './renderer.js';
import { Conversation } from './conversation.js';
import { bindControls } from './controls.js';

function showStatus(message, ready = false) {
  document.getElementById('status-text').textContent = message;
  document.body.classList.toggle('audio-ready', ready);
}

function displayDensity() {
  const pixels = window.innerWidth * window.innerHeight;
  return Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8000000 / pixels)));
}

function boot() {
  if (!window.p5 || !window.Tone) {
    showStatus('Libraries couldn’t load. Run npm install, then reload.');
    return;
  }
  const state = createState();
  const audio = new AudioEngine();
  const setStatus = (message, ready = false) => showStatus(audio.muted ? 'Sound off' : message, ready && !audio.muted);
  const recorder = new PhraseRecorder();
  const conversation = new Conversation(state, recorder, audio, setStatus);
  let interaction;
  let renderer;

  new window.p5(p => {
    p.setup = () => {
      p.pixelDensity(displayDensity());
      const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
      canvas.parent('canvas-container');
      canvas.elt.setAttribute('aria-label', 'Draw to play the instrument');
      canvas.elt.setAttribute('aria-describedby', 'keyboard-instructions');
      canvas.elt.setAttribute('role', 'application');
      canvas.elt.tabIndex = 0;
      canvas.elt.style.cursor = 'none';
      renderer = new Renderer(p, state);
      interaction = new Interaction(canvas.elt, state, recorder, audio, setStatus, conversation);
      bindControls({ state, recorder, audio, conversation, interaction, setStatus });
    };
    p.draw = () => {
      interaction.tick();
      conversation.tick();
      renderer.draw();
    };
    p.windowResized = () => {
      // Keep one coordinate system per recorded gesture during a resize.
      interaction.finish();
      p.pixelDensity(displayDensity());
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      renderer.resize();
    };
  });

  // Read-only snapshots for study and testing. Only three user phrases are kept;
  // replies never feed themselves back into memory. Reloading clears the memory.
  window.quietReply = Object.freeze({
    exportData: () => recorder.exportData(),
    getState: () => ({
      audioState: audio.state,
      audioReady: audio.ready,
      muted: audio.muted,
      masterLevel: audio.master?.gain.value ?? 0,
      drawing: Boolean(state.drawing),
      visiblePhrases: state.visiblePhrases.length,
      phraseCount: recorder.phrases.length,
      visibleUserPhrases: state.visiblePhrases.filter(phrase => phrase.kind === 'user').length,
      visibleReplyPhrases: state.visiblePhrases.filter(phrase => phrase.kind === 'reply').length,
      replyLevel: audio.replyLevel,
      ...conversation.snapshot(),
      activePhrase: recorder.active ? structuredClone(recorder.active) : null,
    }),
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.hasDrawn && !audio.ready) setStatus('Touch to wake the sound');
  });
  // Ignore bfcache navigation so returning to a cached page still works.
  window.addEventListener('pagehide', event => {
    conversation.suspend();
    if (!event.persisted) audio.dispose();
  });
}

// Both pinned library scripts must finish before creating the p5 instance.
if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot, { once: true });

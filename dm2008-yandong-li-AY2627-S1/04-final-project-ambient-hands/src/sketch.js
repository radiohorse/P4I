import { SCALES, notesForScale } from "./musicTheory.js";
import { createHandTracker } from "./handTracker.js";
import { createGestureMapper, handZone, handIntensity } from "./gestureMapper.js";
import { createAudioEngine } from "./audioEngine.js";
import { createGenerativeEngine } from "./generativeEngine.js";
import { createHarmonicEngine } from "./harmonicEngine.js";
import { createVisuals, cameraRect, PAD_COLOR, BELL_COLOR } from "./visuals.js";

// Main settings: change the mode or which hand controls each instrument here.
// Sound parameters live in audioEngine.js; hand thresholds live in gestureMapper.js.
let Current_Scale = "Ionian";
const PAD_HAND = "Left";
const BELL_HAND = "Right";
// Note generator: "random" (original) or "harmony" (shared chord experiment in harmonicEngine.js).
// The URL can override it for A/B listening: index.html?generator=harmony
const GENERATOR = "harmony";

const PLAY_ICON = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="4" y="2.5" width="2.6" height="11" fill="currentColor"/><rect x="9.4" y="2.5" width="2.6" height="11" fill="currentColor"/></svg>`;

let audio;
let tracker;
let gestures;
let generative;
let visuals;
let audioButton;
let scaleLabel;
let padReadout;
let bellReadout;
let statusLabel;
let displayedScale = "";
let zoneNotes = [];

export async function setup() {
  await Promise.all([
    document.fonts.load('10px "Helvetica"'),
    document.fonts.load('10px "Helvetica Light"'),
  ]);
  createCanvas(windowWidth, windowHeight);
  textFont("Helvetica Light");

  // Wire dependencies explicitly. Each module owns its own state and receives what it needs.
  // window is p5's existing global-mode runtime; keeping it preserves helper.js resize behavior.
  audio = createAudioEngine(window);
  gestures = createGestureMapper();
  const generatorName = new URLSearchParams(location.search).get("generator") || GENERATOR;
  const createGenerator = generatorName === "harmony" ? createHarmonicEngine : createGenerativeEngine;
  generative = createGenerator({
    audio,
    random: (...args) => random(...args),
    getScale: () => Current_Scale,
    padHand: PAD_HAND,
    bellHand: BELL_HAND,
  });
  // Console debugging: type quietReply.generative.harmony?.chord.label to see the current chord.
  window.quietReply = { generator: generatorName, generative };
  visuals = createVisuals(window);
  tracker = createHandTracker(window, {
    onResults: gestures.gotHands,
    onStatus: text => statusLabel.html(text),
  });

  createControls();
  visuals.createGrainTiles();
  updateScale();
  tracker.start();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audio.running) pauseAudio();
  });
}

export function draw() {
  const nowMs = millis();
  updateScale();
  const videoWidth = tracker.cameraReady ? tracker.video.width : 640;
  const videoHeight = tracker.cameraReady ? tracker.video.height : 480;
  const view = cameraRect(width, height, videoWidth, videoHeight);
  gestures.updateHands(nowMs, deltaTime, view);

  const { pad, bell } = generative;
  const padHand = gestures.hands[pad.hand];
  const bellHand = gestures.hands[bell.hand];
  const padZone = handZone(padHand, width, height);
  const bellZone = handZone(bellHand, width, height);

  // Camera -> interpreted hands -> visuals and independent musical timers.
  visuals.drawCamera(tracker.video, tracker.cameraReady, view);
  visuals.drawZones(zoneNotes, pad, bell, padZone, bellZone);
  visuals.drawGrain();
  visuals.drawHandMarker(padHand, PAD_COLOR);
  visuals.drawHandMarker(bellHand, BELL_COLOR);
  generative.updateNoteGenerator(pad, padZone, handIntensity(padHand), nowMs);
  generative.updateNoteGenerator(bell, bellZone, handIntensity(bellHand), nowMs);
  updateReadouts(padHand, bellHand);
}

function updateScale() {
  if (!Object.hasOwn(SCALES, Current_Scale)) {
    console.warn(`Unknown mode "${Current_Scale}"; using Ionian.`);
    Current_Scale = "Ionian";
  }
  if (displayedScale === Current_Scale) return;
  displayedScale = Current_Scale;
  zoneNotes = notesForScale(Current_Scale);
  generative.clearGlows();
  audio.releasePad();
  generative.resetTimers(millis());
  scaleLabel.html(`C · ${Current_Scale}`);
}

async function toggleAudio() {
  if (audio.starting) return;
  if (audio.running) {
    pauseAudio();
    return;
  }
  audioButton.attribute("disabled", "");
  try {
    if (!await audio.start()) return;
    generative.resetTimers(millis());
    setAudioIcon(true);
  } catch (error) {
    console.error("Unable to start audio:", error);
    statusLabel.html("Audio could not start");
  } finally {
    audioButton.removeAttribute("disabled");
  }
}

function pauseAudio() {
  audio.pause();
  setAudioIcon(false);
}

function setAudioIcon(playing) {
  audioButton.html(playing ? PAUSE_ICON : PLAY_ICON);
  audioButton.attribute("aria-label", playing ? "Pause sound" : "Start sound");
}

function createControls() {
  // The small existing UI stays with the controller; no extra ui.js module is required.
  const panel = createDiv();
  panel.addClass("controls");
  scaleLabel = createDiv();
  scaleLabel.parent(panel);
  scaleLabel.addClass("scale-label");
  const row = createDiv();
  row.parent(panel);
  row.addClass("controls-row");
  audioButton = createButton("");
  audioButton.parent(row);
  audioButton.addClass("icon-toggle");
  audioButton.mousePressed(toggleAudio);
  setAudioIcon(false);
  padReadout = createSpan("0%");
  padReadout.parent(row);
  padReadout.addClass("readout");
  padReadout.addClass("pad");
  bellReadout = createSpan("0%");
  bellReadout.parent(row);
  bellReadout.addClass("readout");
  bellReadout.addClass("bell");
  statusLabel = createDiv("");
  statusLabel.parent(panel);
  statusLabel.addClass("status-label");
}

function updateReadouts(padHand, bellHand) {
  setReadout(padReadout, padHand);
  setReadout(bellReadout, bellHand);
}

function setReadout(element, hand) {
  const text = `${Math.round(handIntensity(hand) * 100)}%`;
  if (element.elt.textContent !== text) element.html(text);
  element.elt.classList.toggle("absent", !hand.visible);
}

// ES modules keep everything private unless exported. Expose only p5's lifecycle hooks.
// These assignments run before window.load, when p5 creates its normal global instance.
if (typeof window !== "undefined") {
  window.setup = setup;
  window.draw = draw;
}

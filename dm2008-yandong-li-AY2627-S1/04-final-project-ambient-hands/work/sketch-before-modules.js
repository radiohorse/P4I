// Change this name and refresh to switch modes. Each mode is rooted on C.
let Current_Scale = "Dorian";

// Each hand plays one instrument: the left hand plays Pad, the right hand plays Bell.
// If the camera mixes up your hands, change SWAP_HANDS to true.
const PAD_HAND = "Left";
const BELL_HAND = "Right";
const SWAP_HANDS = false;

// Hand openness -> intensity. The ratio is "fingertip distance / palm length".
// A fist is about 1.0 and an open hand about 1.8. Adjust these two numbers to taste.
const FIST_RATIO = 1.05;
const OPEN_RATIO = 1.75;
// Smoothing time in ms: larger values move more calmly but react later.
const HAND_SMOOTH_MS = 90;
// Detection can miss a few frames; wait this long before treating a hand as gone.
const HAND_LOST_MS = 300;

// Camera look: a pale, slightly soft image with fine moving grain.
const CAMERA_FILTER = "grayscale(0.6) contrast(0.82) brightness(1.08) blur(0.6px)";
const CAMERA_WASH = 120; // 0-255: how strongly the pale background covers the camera.
const GRAIN_AMOUNT = 0.16; // 0-1: grain strength.
const GRAIN_TILE_SIZE = 180;
const GRAIN_TILE_COUNT = 4;
const GRAIN_FRAMES_PER_TILE = 3; // Higher numbers make the grain move more slowly.

// Neighboring zones alternate between two tints so the 24 areas stay readable.
const ZONE_TINT_A = [250, 249, 243, 44];
const ZONE_TINT_B = [200, 211, 203, 44];
// Each instrument has its own color for the hand marker, hover tint and played-note glow.
const PAD_COLOR = [116, 150, 138];
const BELL_COLOR = [207, 172, 105];

// Intervals are semitones above C: Lydian uses F# (6), Ionian uses F (5).
const SCALES = {
  Ionian:     [0, 2, 4, 5, 7, 9, 11],
  Dorian:     [0, 2, 3, 5, 7, 9, 10],
  Phrygian:   [0, 1, 3, 5, 7, 8, 10],
  Lydian:     [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Aeolian:    [0, 2, 3, 5, 7, 8, 10],
};

const ZONE_COLUMNS = 12;
const ZONE_ROWS = 2;
const ZONE_COUNT = ZONE_COLUMNS * ZONE_ROWS;
const BASE_MIDI = 36; // C2 anchors the mode; raising this by 12 shifts everything up an octave.
const START_DEGREE = 4; // Start on G2, the fifth note of each C-based mode.
// Flat spellings suit these C-based modes; F# is used by Lydian.
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Random waiting times keep the rhythm from becoming a regular beat.
const MIN_WAIT_MS = 60;
const MAX_WAIT_MS = 320;

// Offsets count scale steps, not semitones.
const NOTE_CHOICES = [
  { offset: 0,  probability: 0.4 },
  { offset: -1, probability: 0.2 },
  { offset: 1,  probability: 0.2 },
  { offset: -2, probability: 0.1 },
  { offset: 2,  probability: 0.1 },
];

// A fast attack and a quiet second sine at twice the frequency give the bell its sparkle.
const VOICE_COUNT = 12;
const BELL_ATTACK = 0.0006;
const BELL_DECAY = 1.9; // A shorter decay makes the bell more percussive.
const BELL_RELEASE = 0.99;
const BELL_VOLUME = 0.15;
const OVERTONE_LEVEL = 0.18;

// Pad timing: one new decision every 0.1-1.1 seconds (Bell: every 60-320 ms).
const PAD_MIN_HOLD_MS = 100;
const PAD_MAX_HOLD_MS = 1100;

// Pad envelope times are seconds. Sustain is a level (0-1), not a duration.
const PAD_ATTACK = 1.6;
const PAD_DECAY = 1.8;
const PAD_SUSTAIN = 0.65;
const PAD_RELEASE = 2.0;
const PAD_VOLUME = 0.16;
const PAD_TRIANGLE_LEVEL = 0.0001;
const PAD_FILTER_CUTOFF = 1300;
const PAD_REVERB_SECONDS = 5;
const PAD_REVERB_WET = 0.65;

// The icon itself is the button. currentColor makes the SVG use the text color from CSS.
const PLAY_ICON = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="4" y="2.5" width="2.6" height="11" fill="currentColor"/><rect x="9.4" y="2.5" width="2.6" height="11" fill="currentColor"/></svg>`;

let audioButton;
let scaleLabel;
let padReadout;
let bellReadout;
let statusLabel;
let audioRunning = false;
let audioStarting = false;
let bellVoices = [];
let bellReverb;
let padVoices = [];
let activePadVoice = null;
let padFilter;
let padReverb;
let displayedScale = "";
let zoneNotes = [];

// Camera and hand tracking
let video;
let handPose;
let cameraReady = false;
let handModelReady = false;
let handTrackingStarted = false;
let grainPatterns = [];
let grainOffset = { x: 0, y: 0 };
const hands = { Left: createHandState(), Right: createHandState() };

// Each instrument keeps its own timer and glow, so Pad and Bell can sound at the same time.
const pad = { hand: PAD_HAND, nextOpportunityAt: 0, glow: new Array(ZONE_COUNT).fill(0) };
const bell = { hand: BELL_HAND, nextOpportunityAt: 0, glow: new Array(ZONE_COUNT).fill(0) };

async function setup() {
  // Load the two local font faces before drawing any canvas text.
  await Promise.all([
    document.fonts.load('10px "Helvetica"'),
    document.fonts.load('10px "Helvetica Light"'),
  ]);
  createCanvas(windowWidth, windowHeight);
  textFont("Helvetica Light");
  createControls();
  createGrainTiles();
  updateScale();
  // The camera and the hand model load in parallel; tracking starts when both are ready.
  startCamera();
  startHandModel();

  // Stop new notes when the page is hidden; existing tails fade naturally.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audioRunning) pauseAudio();
  });

  // js/helper.js already handles resizing a full-window canvas.
}

function draw() {
  const nowMs = millis();
  updateScale();
  updateHands(nowMs);

  // 1. Which zone each hand is in (-1 means "no hand" or "outside the canvas").
  const padHand = hands[pad.hand];
  const bellHand = hands[bell.hand];
  const padZone = handZone(padHand);
  const bellZone = handZone(bellHand);

  // 2. Draw from back to front: camera, zones, grain, hand markers.
  drawCamera();
  drawZones(padZone, bellZone);
  drawGrain();
  drawHandMarker(padHand, PAD_COLOR);
  drawHandMarker(bellHand, BELL_COLOR);

  // 3. Sound: each hand drives its own instrument; openness is the intensity.
  updateNoteGenerator(pad, padZone, handIntensity(padHand), nowMs);
  updateNoteGenerator(bell, bellZone, handIntensity(bellHand), nowMs);
  updateReadouts(padHand, bellHand);
}

// -------------------- Pitch: zone index -> MIDI -> frequency --------------------

function scaleDegreeToMidi(degree, scaleName = Current_Scale) {
  const intervals = SCALES[scaleName] || SCALES.Ionian;
  const absoluteDegree = START_DEGREE + degree;
  const octave = Math.floor(absoluteDegree / intervals.length);
  // Normalize the remainder so this helper also works with negative degrees.
  const index = ((absoluteDegree % intervals.length) + intervals.length) % intervals.length;
  return BASE_MIDI + octave * 12 + intervals[index];
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function midiToLabel(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

function updateScale() {
  if (!Object.hasOwn(SCALES, Current_Scale)) {
    console.warn(`Unknown mode "${Current_Scale}"; using Ionian.`);
    Current_Scale = "Ionian";
  }
  if (displayedScale === Current_Scale) return;

  displayedScale = Current_Scale;
  zoneNotes = Array.from({ length: ZONE_COUNT }, (_, degree) => scaleDegreeToMidi(degree));
  pad.glow.fill(0);
  bell.glow.fill(0);
  // A held Pad should not stay on a pitch from the previous mode.
  releasePad();
  pad.nextOpportunityAt = millis();
  bell.nextOpportunityAt = millis();
  scaleLabel.html(`C · ${Current_Scale}`);
}

function prepareInstruments() {
  // Both instruments can play at once, so both sets of voices are created on Start.
  if (padVoices.length === 0) createPadVoices();
  if (bellVoices.length === 0) createBellVoices();
}

function zoneForPosition(x, y, canvasWidth, canvasHeight) {
  if (![x, y, canvasWidth, canvasHeight].every(Number.isFinite)) return -1;
  if (canvasWidth <= 0 || canvasHeight <= 0) return -1;
  if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) return -1;

  const column = Math.floor((x / canvasWidth) * ZONE_COLUMNS);
  // Canvas y grows downwards. Reverse the rows so the bottom row has the lowest notes.
  const rowFromBottom = ZONE_ROWS - 1 - Math.floor((y / canvasHeight) * ZONE_ROWS);
  return rowFromBottom * ZONE_COLUMNS + column;
}

function handZone(hand) {
  // The hand's palm center plays the role the mouse used to play.
  if (!hand.visible) return -1;
  return zoneForPosition(hand.x, hand.y, width, height);
}

// -------------------- Two random decisions: when to play and which note --------------------

function chooseNearbyDegree(centerDegree) {
  // Keep every note inside the displayed range. Only edge zones need new weights.
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

// `voice` is either the `pad` or the `bell` object. Each keeps its own timer, so both can play together.
function updateNoteGenerator(voice, zone, intensity, nowMs) {
  if (!audioRunning) return;
  const isPad = voice === pad;

  // A held Pad must fade out when its hand leaves or the hand closes into a fist.
  // releasePad() only releases once; calling triggerRelease every frame would restart the fade.
  if (isPad && (zone < 0 || intensity <= 0)) {
    releasePad();
    voice.nextOpportunityAt = nowMs;
    return;
  }
  if (nowMs < voice.nextOpportunityAt) return;

  // Schedule another chance whether this one plays or stays silent, independently of draw FPS.
  // Base it on the current time so a stalled page never catches up with a burst of old notes.
  const wait = isPad
    ? random(PAD_MIN_HOLD_MS, PAD_MAX_HOLD_MS)
    : random(MIN_WAIT_MS, MAX_WAIT_MS);
  voice.nextOpportunityAt = nowMs + wait;
  if (zone < 0 || random() >= intensity) {
    // A missed Pad opportunity creates a rest, rather than sustaining forever.
    if (isPad) releasePad();
    return;
  }

  // Both instruments use exactly the same pitch weights and intensity probability.
  const degree = chooseNearbyDegree(zone);
  const midi = scaleDegreeToMidi(degree);
  const accepted = isPad ? playPad(midi) : playBell(midi);
  if (!accepted) return;

  // A brief glow marks the note that actually played.
  if (degree >= 0 && degree < ZONE_COUNT) voice.glow[degree] = 1;
}

// -------------------- Pad: slow envelope, sustained note and gentle crossfade --------------------

function createPadVoices() {
  padReverb = new p5.Reverb(PAD_REVERB_SECONDS);
  padReverb.wet(PAD_REVERB_WET);
  padFilter = new p5.LowPass(PAD_FILTER_CUTOFF);
  padFilter.disconnect();
  padFilter.connect(padReverb);

  // Two voices allow an old pitch to fade out while a new pitch fades in.
  // Each voice holds one musical note, not a chord.
  for (let i = 0; i < 2; i++) {
    const sine = new p5.SinOsc(220);
    const triangle = new p5.TriOsc(220);
    const envelope = new p5.Envelope(PAD_ATTACK, PAD_DECAY, PAD_SUSTAIN, PAD_RELEASE);

    // Sine adds a smooth body; a quieter triangle adds warmth.
    // Both oscillators use the same pitch. The low-pass filter softens upper harmonics.
    sine.disconnect();
    triangle.disconnect();
    envelope.disconnect();
    sine.connect(envelope);
    triangle.connect(envelope);
    envelope.connect(padFilter);
    sine.amp(PAD_VOLUME, 0);
    triangle.amp(PAD_VOLUME * PAD_TRIANGLE_LEVEL, 0);
    sine.start();
    triangle.start();
    padVoices.push({ sine, triangle, envelope, midi: null, freeAt: 0 });
  }
}

function playPad(midi) {
  // Choosing the same pitch extends its hold without restarting the attack.
  if (activePadVoice && activePadVoice.midi === midi) return true;

  const now = getAudioContext().currentTime;
  const voice = padVoices.find((candidate) => candidate.freeAt <= now);
  // Never retune a voice whose previous note is still fading out.
  if (!voice) return false;

  releasePad();
  const frequency = midiToFrequency(midi);
  const velocity = random(0.8, 1);
  voice.sine.freq(frequency);
  voice.triangle.freq(frequency);
  voice.sine.amp(PAD_VOLUME * velocity, 0);
  voice.triangle.amp(PAD_VOLUME * PAD_TRIANGLE_LEVEL * velocity, 0);
  voice.envelope.triggerAttack();
  voice.midi = midi;
  voice.freeAt = Infinity; // Sustain continues until releasePad() is called.
  activePadVoice = voice;
  return true;
}

function releasePad() {
  if (!activePadVoice) return;
  activePadVoice.envelope.triggerRelease();
  activePadVoice.freeAt = getAudioContext().currentTime + PAD_RELEASE + 0.15;
  activePadVoice = null;
}

// -------------------- Sine bell: synthesized entirely with p5.sound --------------------

function createBellVoices() {
  bellReverb = new p5.Reverb(6);
  bellReverb.wet(0.64);

  for (let i = 0; i < VOICE_COUNT; i++) {
    const fundamental = new p5.SinOsc(440);
    const overtone = new p5.SinOsc(880);
    const envelope = new p5.Envelope(BELL_ATTACK, BELL_DECAY, 0, BELL_RELEASE);

    // This p5.sound version places the envelope in the audio path, unlike older env.play(osc) examples.
    // Remove direct output connections so the envelope controls every sound.
    fundamental.disconnect();
    overtone.disconnect();
    envelope.disconnect();
    fundamental.connect(envelope);
    overtone.connect(envelope);
    envelope.connect(bellReverb);

    fundamental.amp(BELL_VOLUME, 0);
    overtone.amp(BELL_VOLUME * OVERTONE_LEVEL, 0);
    fundamental.start();
    overtone.start();
    bellVoices.push({ fundamental, overtone, envelope, freeAt: 0 });
  }
}

function playBell(midi) {
  const now = getAudioContext().currentTime;
  const voice = bellVoices.find((candidate) => candidate.freeAt <= now);
  // Reuse a fixed pool of voices. Skip a note if all voices are busy rather than cutting a tail.
  if (!voice) return false;

  const frequency = midiToFrequency(midi);
  const velocity = random(0.7, 1);
  voice.fundamental.freq(frequency);
  voice.overtone.freq(frequency * 2);
  voice.fundamental.amp(BELL_VOLUME * velocity, 0);
  voice.overtone.amp(BELL_VOLUME * OVERTONE_LEVEL * velocity, 0);
  voice.envelope.triggerAttack();

  // Sustain is zero, so each bell decays to silence without holding a continuous tone.
  voice.freeAt = now + BELL_ATTACK + BELL_DECAY + 0.06;
  return true;
}

function releaseBellVoices() {
  if (bellVoices.length === 0) return;
  const now = getAudioContext().currentTime;
  for (const voice of bellVoices) {
    voice.envelope.triggerRelease();
    voice.freeAt = now + BELL_RELEASE + 0.06;
  }
}

async function toggleAudio() {
  if (audioStarting) return;
  if (audioRunning) {
    pauseAudio();
    return;
  }

  audioStarting = true;
  audioButton.attribute("disabled", "");
  try {
    // Browsers require a user click before audio can start.
    const context = getAudioContext();
    await context.resume();
    userStartAudio();
    prepareInstruments();
    audioRunning = true;
    pad.nextOpportunityAt = millis();
    bell.nextOpportunityAt = millis();
    setAudioIcon(true);
  } catch (error) {
    console.error("Unable to start audio:", error);
    statusLabel.html("Audio could not start");
  } finally {
    audioStarting = false;
    audioButton.removeAttribute("disabled");
  }
}

function pauseAudio() {
  audioRunning = false;
  releasePad();
  releaseBellVoices();
  setAudioIcon(false);
}

function setAudioIcon(playing) {
  // While playing, show the pause icon (the action a click will perform), and the reverse.
  audioButton.html(playing ? PAUSE_ICON : PLAY_ICON);
  audioButton.attribute("aria-label", playing ? "Pause sound" : "Start sound");
}

// -------------------- Two rows of notes and minimal controls --------------------

function drawZones(padZone, bellZone) {
  const zoneWidth = width / ZONE_COLUMNS;
  const zoneHeight = height / ZONE_ROWS;
  // Keep canvas labels at the same size as the HTML controls, including after resizing.
  textSize(parseFloat(getComputedStyle(document.body).fontSize));
  // Glow fades the same speed at any frame rate.
  const fade = Math.exp(-deltaTime / 450);

  for (let i = 0; i < ZONE_COUNT; i++) {
    const column = i % ZONE_COLUMNS;
    const row = ZONE_ROWS - 1 - Math.floor(i / ZONE_COLUMNS);
    const x = column * zoneWidth;
    const y = row * zoneHeight;

    // Semi-transparent tints: the camera stays visible, neighbors differ slightly (checkerboard).
    noStroke();
    fill(...((column + row) % 2 === 0 ? ZONE_TINT_A : ZONE_TINT_B));
    rect(x, y, zoneWidth, zoneHeight);

    // Soft tint for the zone each hand is in.
    if (i === padZone) {
      fill(...PAD_COLOR, 55);
      rect(x, y, zoneWidth, zoneHeight);
    }
    if (i === bellZone) {
      fill(...BELL_COLOR, 55);
      rect(x, y, zoneWidth, zoneHeight);
    }

    // Stronger glow for the note that actually played, then it fades.
    fill(...PAD_COLOR, pad.glow[i] * 120);
    rect(x, y, zoneWidth, zoneHeight);
    fill(...BELL_COLOR, bell.glow[i] * 120);
    rect(x, y, zoneWidth, zoneHeight);
    pad.glow[i] *= fade;
    bell.glow[i] *= fade;

    stroke(75, 90, 81, 25);
    line(x, y, x, y + zoneHeight);
    noStroke();
    textAlign(CENTER, CENTER);
    fill(95, 111, 99);
    text(midiToLabel(zoneNotes[i]), x + zoneWidth / 2, y + zoneHeight - 45);
  }

  // Make the horizontal split visible without changing either row's note order.
  stroke(75, 90, 81, 40);
  line(0, zoneHeight, width, zoneHeight);
}

function createControls() {
  const panel = createDiv();
  panel.addClass("controls");
  scaleLabel = createDiv();
  scaleLabel.parent(panel);
  scaleLabel.addClass("scale-label");

  const row = createDiv();
  row.parent(panel);
  row.addClass("controls-row");
  // A real <button> (keyboard and screen readers still work), but CSS removes its box.
  audioButton = createButton("");
  audioButton.parent(row);
  audioButton.addClass("icon-toggle");
  audioButton.mousePressed(toggleAudio);
  setAudioIcon(false);

  // Only percentages are shown. The color tells you which instrument each one belongs to.
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
  // Only touch the page when the number changes, not 60 times a second.
  if (element.elt.textContent !== text) element.html(text);
  element.elt.classList.toggle("absent", !hand.visible);
}

// -------------------- Camera: start the webcam --------------------

function startCamera() {
  statusLabel.html("Starting camera…");
  try {
    // The callback runs once the camera has its real size (for example 640 × 480).
    video = createCapture(VIDEO, () => {
      cameraReady = true;
      startHandTracking();
    });
    video.hide(); // We draw the video ourselves inside draw().
    // If permission is refused, p5 only logs an error, so check again after a while.
    setTimeout(() => {
      if (!cameraReady) statusLabel.html("Camera unavailable");
    }, 10000);
  } catch (error) {
    // Browsers only allow cameras on localhost or https.
    console.error("Unable to start camera:", error);
    statusLabel.html("Camera unavailable");
  }
}

// -------------------- Hand tracking with ml5.handPose --------------------

function createHandState() {
  return {
    visible: false, // Is this hand on screen right now?
    lastSeen: -Infinity, // When ml5 last found it (ms)
    targetX: 0, targetY: 0, targetOpen: 0, // Latest raw values from ml5 (camera pixels)
    videoX: 0, videoY: 0, open: 0, // Smoothed values
    x: 0, y: 0, // Smoothed position converted to canvas pixels
  };
}

async function startHandModel() {
  if (typeof ml5 === "undefined") {
    statusLabel.html("Hand tracking unavailable");
    return;
  }
  try {
    // With p5 2.x, ml5.handPose() returns a Promise ("the model will arrive later"),
    // not the model itself. `await` waits for the real model object.
    // flipped: true mirrors the keypoints, matching the mirrored camera image we draw.
    handPose = await ml5.handPose({ maxHands: 2, flipped: true });
    // With older p5 versions the model object returns at once; make sure it has finished loading.
    if (handPose.ready) await handPose.ready;
  } catch (error) {
    console.error("Unable to load the hand model:", error);
    statusLabel.html("Hand tracking unavailable");
    return;
  }
  handModelReady = true;
  startHandTracking();
}

function startHandTracking() {
  // Both the camera and the model load at their own speed. Start only when both are ready.
  if (!cameraReady || !handModelReady || handTrackingStarted) return;
  handTrackingStarted = true;
  statusLabel.html("");
  // From now on ml5 calls gotHands() with fresh results, again and again.
  handPose.detectStart(video, gotHands);
}

function gotHands(results) {
  const now = millis();
  // If two hands get the same label, keep the more confident one.
  const best = {};
  for (const result of results) {
    let label = result.handedness;
    if (SWAP_HANDS) label = label === "Left" ? "Right" : "Left";
    if (!hands[label]) continue;
    if (!best[label] || result.confidence > best[label].confidence) best[label] = result;
  }

  for (const label in best) {
    const result = best[label];
    const hand = hands[label];
    const center = palmCenter(result);
    hand.targetX = center.x;
    hand.targetY = center.y;
    hand.targetOpen = constrain(map(opennessRatio(result), FIST_RATIO, OPEN_RATIO, 0, 1), 0, 1);
    // A hand that has just appeared jumps straight to its spot instead of sliding in.
    if (now - hand.lastSeen > HAND_LOST_MS) {
      hand.videoX = hand.targetX;
      hand.videoY = hand.targetY;
    }
    hand.lastSeen = now;
  }
}

function palmCenter(result) {
  // Average of the wrist and the four knuckles: steadier than any single fingertip.
  const points = [result.wrist, result.index_finger_mcp, result.middle_finger_mcp,
    result.ring_finger_mcp, result.pinky_finger_mcp];
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function opennessRatio(result) {
  // Palm length (wrist -> middle knuckle) is the ruler, so being near or far from the camera
  // does not change the result.
  const wrist = result.wrist;
  const palmLength = dist(wrist.x, wrist.y, result.middle_finger_mcp.x, result.middle_finger_mcp.y);
  if (palmLength < 1) return FIST_RATIO;
  const tips = [result.index_finger_tip, result.middle_finger_tip,
    result.ring_finger_tip, result.pinky_finger_tip];
  let total = 0;
  for (const tip of tips) total += dist(wrist.x, wrist.y, tip.x, tip.y);
  return total / tips.length / palmLength;
}

function updateHands(nowMs) {
  // Smoothing: move a fraction of the way toward the target each frame (frame-rate independent).
  const amount = 1 - Math.exp(-deltaTime / HAND_SMOOTH_MS);
  const view = cameraRect();
  for (const label in hands) {
    const hand = hands[label];
    hand.visible = nowMs - hand.lastSeen < HAND_LOST_MS;
    const targetOpen = hand.visible ? hand.targetOpen : 0;
    hand.open += (targetOpen - hand.open) * amount;
    hand.videoX += (hand.targetX - hand.videoX) * amount;
    hand.videoY += (hand.targetY - hand.videoY) * amount;
    // Camera pixels -> canvas pixels, using the same scale and offset as drawCamera().
    hand.x = view.x + hand.videoX * view.zoom;
    hand.y = view.y + hand.videoY * view.zoom;
  }
}

function handIntensity(hand) {
  // 0 = fist or no hand, 1 = fully open hand.
  return hand.visible ? hand.open : 0;
}

// -------------------- Camera picture: mirrored, pale, with grain --------------------

function cameraRect() {
  // "Cover" fit: fill the whole canvas without stretching; the extra edges are cropped.
  const videoWidth = video && cameraReady ? video.width : 640;
  const videoHeight = video && cameraReady ? video.height : 480;
  const zoom = Math.max(width / videoWidth, height / videoHeight);
  return {
    x: (width - videoWidth * zoom) / 2,
    y: (height - videoHeight * zoom) / 2,
    w: videoWidth * zoom,
    h: videoHeight * zoom,
    zoom,
  };
}

function drawCamera() {
  // The pale base color is visible before the camera starts and through the wash afterwards.
  background(239, 239, 232);
  if (!cameraReady) return;

  const view = cameraRect();
  push();
  // Mirror the picture so it behaves like a mirror: raise your right hand, the right side moves.
  translate(width, 0);
  scale(-1, 1);
  // A CSS-style filter on the canvas: less color, less contrast, slightly brighter and softer.
  drawingContext.filter = CAMERA_FILTER;
  image(video, width - view.x - view.w, view.y, view.w, view.h);
  drawingContext.filter = "none";
  pop();

  // A pale wash on top keeps the image quiet and keeps the text readable.
  noStroke();
  fill(239, 239, 232, CAMERA_WASH);
  rect(0, 0, width, height);
}

function createGrainTiles() {
  // Make a few small noise images once. Drawing them is much cheaper than new noise per pixel.
  for (let t = 0; t < GRAIN_TILE_COUNT; t++) {
    const tile = document.createElement("canvas");
    tile.width = GRAIN_TILE_SIZE;
    tile.height = GRAIN_TILE_SIZE;
    const context = tile.getContext("2d");
    const pixels = context.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = 110 + Math.random() * 145; // Mostly light grains, so the picture stays bright.
      pixels.data[i] = value;
      pixels.data[i + 1] = value;
      pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    grainPatterns.push(drawingContext.createPattern(tile, "repeat"));
  }
}

function drawGrain() {
  // Change tile and position every few frames, so the grain shimmers gently.
  const tileIndex = Math.floor(frameCount / GRAIN_FRAMES_PER_TILE) % GRAIN_TILE_COUNT;
  if (frameCount % GRAIN_FRAMES_PER_TILE === 0) {
    grainOffset.x = Math.floor(Math.random() * GRAIN_TILE_SIZE);
    grainOffset.y = Math.floor(Math.random() * GRAIN_TILE_SIZE);
  }
  const context = drawingContext;
  context.save();
  context.globalAlpha = GRAIN_AMOUNT;
  context.translate(-grainOffset.x, -grainOffset.y);
  context.fillStyle = grainPatterns[tileIndex];
  context.fillRect(0, 0, width + GRAIN_TILE_SIZE, height + GRAIN_TILE_SIZE);
  context.restore();
}

function drawHandMarker(hand, color) {
  // A thin ring at the palm. It grows as the hand opens; it fades when the hand leaves.
  if (hand.open < 0.01 && !hand.visible) return;
  const alpha = hand.visible ? 200 : 200 * hand.open;
  noFill();
  stroke(...color, alpha);
  strokeWeight(1.5);
  circle(hand.x, hand.y, 18 + hand.open * 34);
  noStroke();
  fill(...color, alpha);
  circle(hand.x, hand.y, 4);
}

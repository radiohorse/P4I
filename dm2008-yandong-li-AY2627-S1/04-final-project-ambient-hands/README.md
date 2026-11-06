# Ambient Hands

## Hand distance and volume

Moving a hand toward the camera reduces its instrument's reverb; moving away makes it more diffuse. Left controls Pad, right controls Bell, in both generators. The outer hand halo grows as the hand approaches; the inner ring still shows openness. Hover the openness readout for the proximity percentage.

| Hand / instrument | Near reverb wet | Far reverb wet | Fist / fully open volume |
| --- | --- | --- | --- |
| Left / Pad | 0.20 (20%) | 1.00 (100%) | 0 / current Pad level |
| Right / Bell | 0.34 (34%) | 1.00 (100%) | 0 / current Bell level |

Wet values use a 0-1 scale: `1` means 100%. Opening a hand continuously raises that instrument's output volume; closing it lowers the volume to zero. Volume follows filtered openness (90 ms landmark smoothing) through an exponential audio curve (`HAND_VOLUME_SMOOTH_SECONDS = 0.18`, about 540 ms for 95% of a change). Rapid reversals continue from the current gain instead of resetting it. Fully open preserves the current oscillator levels and random note velocities. After the existing 300 ms tracking grace period, missing hands use a slower fade (`HAND_LOST_FADE_SECONDS = 0.75`, about 2.25 s to fade by 95%), including sustained Pad chords and Bell/reverb tails. Returning hands cancel the pending silence endpoint and fade back in. The existing Bell pace and Pad note-selection rules still use openness too.

Distance is an approximate visual cue from wrist-to-middle-knuckle length divided by source video height, not a measurement in centimetres. Finger spread is excluded, although tilting the palm can still affect the estimate. `PALM_FAR_RATIO = 0.09` and `PALM_NEAR_RATIO = 0.30` in `gestureMapper.js` tune the comfortable range. Depth is smoothed over 220 ms and wet changes use 80 ms audio ramps. Missing hands retain their last reverb setting for stable tails. Reverb duration remains fixed.

The current entry is **`src/depthSketch.js`**, loaded by `index.html`. It preserves the previous controller and adds depth wiring. `src/sketch.js` was not writable in this workspace and is retained as the previous entry; edit `depthSketch.js` for current settings. Earlier walkthrough references to `sketch.js` describe the same controller structure.

Run `node work/depth-check.mjs` for distance and volume checks. The modular browser fixture includes independent hand, openness and Near/Far controls and reports each instrument's current wet value and output volume.

Open `/work/volume-smoothing-check.html` on the local server for native Web Audio sample checks. It renders 40 rapid reversals, hand loss, return during a fade and endpoint settling offline at 48 kHz, without a camera or audible playback.

A gesture-controlled ambient instrument built with p5.js, p5.sound and ml5.js. The left hand controls Pad, the right hand controls Bell, and both share a 24-zone scale grid.

A detailed Chinese walkthrough of every module, constant and decision lives in [README.zh-CN.md](README.zh-CN.md).

## Run

Serve this directory with VS Code Live Server or a local HTTP server:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`, allow the camera and click the play icon to enable audio. ES modules and camera access require a local server or HTTPS; do not open `index.html` directly with `file://`. The hand model itself is downloaded from a CDN on first use, so that first load needs network access.

## How a frame flows

`src/sketch.js` wires seven modules around one p5 draw loop:

1. `handTracker.js` starts the camera and the ml5 model, then forwards every detection to `gotHands()`.
2. `gestureMapper.js` keeps one state per hand: averaging the wrist and four knuckles for the palm, dividing fingertip distance by palm length for the 0–1 openness (so moving closer to the camera does not change it), then smoothing both with a frame-rate-independent exponential filter.
3. `draw()` maps the smoothed video position through the cover-fit rectangle to screen pixels, turns that into a zone (12 columns × 2 rows), and calls the active generator once each for Pad and Bell.
4. The generator timers decide *when* to play and which scale degree; `audioEngine.js` renders Pad/Bell from fixed voice pools; `visuals.js` draws camera, zones, grain and hand markers.

A hand is considered gone after `HAND_LOST_MS = 300`; a returning hand jumps to its new position instead of sliding through the grid. `SWAP_HANDS` in `gestureMapper.js` fixes reversed left/right labels.

## Source layout

```text
index.html               # loads the single ES module entry; creates no canvas itself
src/
├── sketch.js            # p5 lifecycle, main settings, UI and module coordination
├── handTracker.js       # Camera and ml5 model lifecycle; raw detection callbacks
├── gestureMapper.js     # Hand identity, openness, smoothing and zone mapping
├── musicTheory.js       # Scales, grid pitch order, MIDI, frequency and note labels
├── audioEngine.js       # Pad/Bell synthesis, envelopes, voices and effects
├── generativeEngine.js  # Independent timers, probability and neighboring-note selection
├── harmonicEngine.js    # Experiment: shared chord context, Pad chords, Bell phrases
└── visuals.js           # Mirrored camera, cover fit, zones, grain and hand markers
```

`index.html` loads `src/sketch.js` as the single ES module entry. The entry imports the other seven modules and retains p5 global mode for compatibility with the existing libraries and resize helper. Styles and local fonts remain in `css/` and `assets/fonts/`; the pinned libraries in `js/` are p5.js 2.3.4, p5.sound (the Tone.js-based build, using Tone.js 15.0.2) and ml5.js 1.4.0.

Change `Current_Scale` and the hand-to-instrument assignment in `src/sketch.js`. Sound settings are in `audioEngine.js`, timing/probability settings in `generativeEngine.js`, gesture thresholds in `gestureMapper.js`, and visual settings in `visuals.js`. Harmonic settings (chord bank, phrase rules) are in `harmonicEngine.js`.

The current default is `GENERATOR = "harmony"`. Use `?generator=random` or `?generator=harmony` to compare the two generators without editing the code (any value other than `harmony` selects the random generator). In the browser console, `window.quietReply` exposes the active generator for debugging; with harmony, `window.quietReply.generative.harmony.chord.label` is the current chord.

## Grid and pitch

The grid is 12 columns × 2 rows of scale degrees, not semitones: each column is the next scale degree, so a C appears every 7 columns. `BASE_MIDI = 36` (C2) and `START_DEGREE = 4` (G) place the default Ionian grid from G2 (bottom-left, zone 0) to B5 (top-right, zone 23). Six modes are available: Ionian, Dorian, Phrygian, Lydian, Mixolydian and Aeolian.

## Bell speed

Both generators share the settings at the top of `src/generativeEngine.js`:

- `BELL_OPEN_MIN_GAP_MS = 30` and `BELL_OPEN_MAX_GAP_MS = 190`: the open-hand note-gap range in milliseconds. `random` draws uniformly from this range; `harmony` picks one of three weighted tiers (30 / 110 / 190 ms) and then applies jitter.
- `BELL_GAP_CLOSED_SCALE = 5`: gaps lengthen toward 5x as the right hand closes (`bellGapScale()`: 1x open, 3x at half open, up to 5x near closed).
- `BELL_FIST_THRESHOLD = 0.05`: stop new notes at 5% openness or below.

Pending waits adapt to the current openness without rerolling their randomness each frame: the deadline is always recomputed from the wait's original start time, so a half-closed hand stretches the wait instead of restarting it. In harmony mode, Bell continues whenever the hand is open: phrase boundaries use the same gap as other notes, with no extra phrase rest or random phrase-start rejection. At high rates the fixed Bell pool briefly fades and reuses its oldest tail, instead of waiting for all tails to finish. Fists, lost hands and Pause cancel deferred notes.

Two quirks are documented rather than hidden: the `harmony` jitter constant `BELL_GAP_JITTER = 0.96` multiplies by 0.04–1.96 (about ±96%, not the ±12% an earlier comment claimed) and is then clamped to 30–190 ms, which measures as a ~97 ms mean gap with ~40% of notes at the two extremes; and the Pad's triangle oscillator level (`PAD_TRIANGLE_LEVEL = 0.0001`) is effectively inaudible. The Bell-pacing work left the Pad path and pitch-selection code textually unchanged (asserted in `bell-timing-check.mjs`).

## Local verification

All four Node checks exit 0 with the current settings; none of them needs a camera, a browser or a sound card.

```sh
node work/bell-timing-check.mjs        # Bell pacing, wait stretching, fists, pause/resume
node work/continuous-bell-check.mjs    # continuous phrases, fixed voice pool, deferred notes
node work/harmony-check.mjs            # chord bank, voicings, melody rules, chord voice pool
node work/module-check.mjs             # split modules vs. the saved single-file sketch
```

`module-check.mjs` compares the split modules against `work/sketch-before-modules.js`, the pre-split implementation. Five settings were deliberately retuned after that snapshot (Bell decay 1.9→3.9 s, Pad level 0.16→0.36, Pad hold 1100→1000 ms, grain tile change 3→9 frames, Bell reverb wet 0.64→0.84); the check syncs those five values, with comments, so it still proves the split itself changed nothing else.

`work/modular-browser-check.html` runs the production modules with a simulated camera and hand model for browser/audio checks, without requiring camera permission. Serve the folder and open `http://127.0.0.1:8000/work/modular-browser-check.html`; three buttons switch between fist, hidden and open hands, and the page reports canvas count, readouts, attack counts, reverb peaks and font status as JSON.

Neither fixture is loaded by the application. Earlier files in `work/` are historical development artifacts (for example `pad-check.cjs` still targets the removed root `sketch.js` and no longer runs).

import { midiToFrequency } from "./musicTheory.js";

// Sound design lives here. These values preserve the latest working sketch.
export const VOICE_COUNT = 12;
export const BELL_ATTACK = 0.0006;
export const BELL_DECAY = 3.9;
export const BELL_RELEASE = 0.99;
export const BELL_VOLUME = 0.15;
export const OVERTONE_LEVEL = 0.18;
export const BELL_REVERB_SECONDS = 6;
export const BELL_REVERB_WET = 0.34;
export const BELL_STEAL_FADE_MS = 15; // Retire an old tail gently when all Bell voices are busy.

// Times are seconds. Sustain is a level (0-1), not a duration.
export const PAD_ATTACK = 1.6;
export const PAD_DECAY = 1.8;
export const PAD_SUSTAIN = 0.65;
export const PAD_RELEASE = 2.0;
export const PAD_VOLUME = 0.36;
export const PAD_TRIANGLE_LEVEL = 0.0001;
export const PAD_FILTER_CUTOFF = 1300;
export const PAD_REVERB_SECONDS = 5;
export const PAD_REVERB_WET = 0.2;
// Near = direct/clear; far = diffuse. Reverb duration stays fixed.
// Wet uses 0-1, so 100% reverb is 1, not 100.
export const PAD_DEPTH_WET = { near: PAD_REVERB_WET, far: 1 };
export const BELL_DEPTH_WET = { near: BELL_REVERB_WET, far: 1 };
export const DEPTH_RAMP_SECONDS = 0.08;
// Exponential time constants: ~95% of a change takes 3x these values.
export const HAND_VOLUME_SMOOTH_SECONDS = 0.18;
export const HAND_LOST_FADE_SECONDS = 0.75;
const VOLUME_ENDPOINT_EPSILON = 0.001;
// Harmonic experiment only: a separate pool of the same Pad voice for chords.
// It is created on the first chord, so the default random generator builds exactly the same nodes as before.
export const PAD_CHORD_VOICES = 8;      // Up to 4 chord tones + 4 still fading out.
export const PAD_CHORD_NOTE_LEVEL = 0.5; // Per note, so a 3-4 note chord is not much louder than one Pad note.

// p supplies the p5 audio context and random(); soundLibrary supplies p5.sound classes.
export function createAudioEngine(p, soundLibrary = globalThis.p5) {
  let audioRunning = false;
  let audioStarting = false;
  const bellVoices = [];
  const padVoices = [];
  const padChordVoices = [];
  let bellReverb;
  let padReverb;
  let padFilter;
  let activePadVoice = null;
  const lastDepthWet = { pad: null, bell: null };
  const lastHandVolume = {
    pad: { level: 1, visible: true },
    bell: { level: 1, visible: true },
  };

  function setHandVolume(instrument, openness, visible = true) {
    if (!audioRunning || !Number.isFinite(openness)) return;
    const effect = instrument === "pad" ? padReverb : instrument === "bell" ? bellReverb : null;
    if (!effect) return;
    const open = visible ? Math.min(1, Math.max(0, openness)) : 0;
    // Smoothed landmarks approach the endpoints asymptotically; settle tiny residues.
    const level = open < VOLUME_ENDPOINT_EPSILON ? 0
      : open > 1 - VOLUME_ENDPOINT_EPSILON ? 1 : open;
    const previous = lastHandVolume[instrument];
    if (level === previous.level && visible === previous.visible) return;
    // p5.sound's existing output GainNode is after the dry/wet mix. Scaling it
    // also controls sustained notes and reverb tails without changing note velocities.
    const gain = effect.output.gain;
    const now = p.getAudioContext().currentTime;
    const timeConstant = visible ? HAND_VOLUME_SMOOTH_SECONDS : HAND_LOST_FADE_SECONDS;
    // Keep the running curve's instantaneous value: never reset gain at a frame
    // boundary. Replacing its target gives audio-rate smoothing even during fast
    // reversals or a stalled draw loop. Cancel only any future endpoint snap.
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(level, now, timeConstant);
    if (level === 0 || level === 1) {
      // Reach exact silence/full level once the residual is below -104 dB.
      gain.setValueAtTime(level, now + timeConstant * 12);
    }
    previous.level = level;
    previous.visible = visible;
  }

  function setHandProximity(instrument, proximity) {
    if (!audioRunning || !Number.isFinite(proximity)) return;
    const effect = instrument === "pad" ? padReverb : instrument === "bell" ? bellReverb : null;
    if (!effect) return;
    const range = instrument === "pad" ? PAD_DEPTH_WET : BELL_DEPTH_WET;
    const near = Math.min(1, Math.max(0, proximity));
    const wet = range.far + (range.near - range.far) * near;
    if (lastDepthWet[instrument] !== null && Math.abs(wet - lastDepthWet[instrument]) < 0.002) return;
    // The bundled p5.sound uses a Tone wet signal; ramp it to avoid abrupt changes.
    if (effect.node?.wet?.rampTo) effect.node.wet.rampTo(wet, DEPTH_RAMP_SECONDS);
    else effect.wet(wet);
    lastDepthWet[instrument] = wet;
  }

  function createPadVoices() {
    padReverb = new soundLibrary.Reverb(PAD_REVERB_SECONDS);
    padReverb.wet(PAD_REVERB_WET);
    padFilter = new soundLibrary.LowPass(PAD_FILTER_CUTOFF);
    padFilter.disconnect();
    padFilter.connect(padReverb);

    // Two voices let the old pitch fade out while the new pitch fades in.
    for (let i = 0; i < 2; i++) padVoices.push(createPadVoice());
  }

  // One Pad voice: sine + very quiet triangle -> envelope -> shared low-pass -> reverb.
  function createPadVoice() {
    const sine = new soundLibrary.SinOsc(220);
    const triangle = new soundLibrary.TriOsc(220);
    const envelope = new soundLibrary.Envelope(PAD_ATTACK, PAD_DECAY, PAD_SUSTAIN, PAD_RELEASE);
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
    return { sine, triangle, envelope, midi: null, freeAt: 0 };
  }

  // Chord version of playPad. Notes shared with the previous chord keep sustaining
  // (common tones), so a chord change only fades the notes that actually move.
  function playPadChord(midis) {
    if (!padFilter) return false;
    if (padChordVoices.length === 0) {
      for (let i = 0; i < PAD_CHORD_VOICES; i++) padChordVoices.push(createPadVoice());
    }
    const now = p.getAudioContext().currentTime;
    const wanted = [...new Set(midis)];
    const keep = padChordVoices.filter(voice => voice.freeAt === Infinity && wanted.includes(voice.midi));
    const newNotes = wanted.filter(midi => !keep.some(voice => voice.midi === midi));
    const free = padChordVoices.filter(voice => voice.freeAt <= now);
    if (free.length < newNotes.length) return false; // Never retune a voice that is still fading out.

    releasePadMono();
    for (const voice of padChordVoices) {
      if (voice.freeAt === Infinity && !keep.includes(voice)) releasePadVoice(voice);
    }
    newNotes.forEach((midi, i) => {
      const voice = free[i];
      const frequency = midiToFrequency(midi);
      const level = PAD_VOLUME * PAD_CHORD_NOTE_LEVEL * p.random(0.8, 1);
      voice.sine.freq(frequency);
      voice.triangle.freq(frequency);
      voice.sine.amp(level, 0);
      voice.triangle.amp(level * PAD_TRIANGLE_LEVEL, 0);
      voice.envelope.triggerAttack();
      voice.midi = midi;
      voice.freeAt = Infinity;
    });
    return true;
  }

  function releasePadVoice(voice) {
    voice.envelope.triggerRelease();
    voice.freeAt = p.getAudioContext().currentTime + PAD_RELEASE + 0.15;
  }

  function playPad(midi) {
    // Selecting the same pitch keeps its sustain instead of restarting the envelope.
    if (activePadVoice && activePadVoice.midi === midi) return true;
    const now = p.getAudioContext().currentTime;
    const voice = padVoices.find(candidate => candidate.freeAt <= now);
    if (!voice) return false; // Never retune a voice that is still fading out.

    releasePad();
    const frequency = midiToFrequency(midi);
    const velocity = p.random(0.8, 1);
    voice.sine.freq(frequency);
    voice.triangle.freq(frequency);
    voice.sine.amp(PAD_VOLUME * velocity, 0);
    voice.triangle.amp(PAD_VOLUME * PAD_TRIANGLE_LEVEL * velocity, 0);
    voice.envelope.triggerAttack();
    voice.midi = midi;
    voice.freeAt = Infinity;
    activePadVoice = voice;
    return true;
  }

  // Releases everything the Pad is holding: the single note and any chord tones.
  function releasePad() {
    releasePadMono();
    for (const voice of padChordVoices) {
      if (voice.freeAt === Infinity) releasePadVoice(voice);
    }
  }

  function releasePadMono() {
    if (!activePadVoice) return;
    activePadVoice.envelope.triggerRelease();
    activePadVoice.freeAt = p.getAudioContext().currentTime + PAD_RELEASE + 0.15;
    activePadVoice = null;
  }

  function createBellVoices() {
    bellReverb = new soundLibrary.Reverb(BELL_REVERB_SECONDS);
    bellReverb.wet(BELL_REVERB_WET);
    for (let i = 0; i < VOICE_COUNT; i++) {
      const fundamental = new soundLibrary.SinOsc(440);
      const overtone = new soundLibrary.SinOsc(880);
      const envelope = new soundLibrary.Envelope(BELL_ATTACK, BELL_DECAY, 0, BELL_RELEASE);
      // This p5.sound version puts the envelope in the audio path.
      // Remove default direct outputs so sound cannot bypass the envelope.
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
      bellVoices.push({ fundamental, overtone, envelope, freeAt: 0, pendingTimer: null, pendingRequest: null });
    }
  }

  function playBell(midi) {
    if (!audioRunning) return false;
    const now = p.getAudioContext().currentTime;
    const voice = bellVoices.find(candidate => candidate.pendingTimer === null && candidate.freeAt <= now);
    if (voice) {
      startBellVoice(voice, midi);
      return true;
    }

    // Fast gestures can fill the entire pool before the 3.9-second tails have ended.
    // Fade the oldest tail briefly, then reuse it instead of waiting for a whole group to finish.
    const available = bellVoices.filter(candidate => candidate.pendingTimer === null);
    const oldest = available.reduce((best, candidate) =>
      !best || candidate.freeAt < best.freeAt ? candidate : best, null);
    if (!oldest) return false;
    oldest.envelope.releaseTime(BELL_STEAL_FADE_MS / 1000);
    oldest.envelope.triggerRelease();
    oldest.freeAt = Infinity;
    const request = { midi, readyAt: now + BELL_STEAL_FADE_MS / 1000 };
    oldest.pendingRequest = request;
    const finishRetire = () => {
      if (oldest.pendingRequest !== request) return;
      if (!audioRunning) {
        cancelPendingBellNotes();
        return;
      }
      // A wall-clock timer can run while audio is suspended; wait for the audio clock too.
      const remaining = request.readyAt - p.getAudioContext().currentTime;
      if (remaining > 0) {
        oldest.pendingTimer = setTimeout(finishRetire, Math.max(4, remaining * 1000));
        return;
      }
      oldest.pendingTimer = null;
      oldest.pendingRequest = null;
      oldest.envelope.releaseTime(BELL_RELEASE);
      startBellVoice(oldest, request.midi);
    };
    oldest.pendingTimer = setTimeout(finishRetire, BELL_STEAL_FADE_MS);
    return true;
  }

  function startBellVoice(voice, midi) {
    const now = p.getAudioContext().currentTime;
    const frequency = midiToFrequency(midi);
    const velocity = p.random(0.7, 1);
    voice.fundamental.freq(frequency);
    voice.overtone.freq(frequency * 2);
    voice.fundamental.amp(BELL_VOLUME * velocity, 0);
    voice.overtone.amp(BELL_VOLUME * OVERTONE_LEVEL * velocity, 0);
    voice.envelope.triggerAttack();
    voice.freeAt = now + BELL_ATTACK + BELL_DECAY + 0.06;
  }

  function cancelPendingBellNotes() {
    const pending = bellVoices.filter(voice => voice.pendingTimer !== null);
    if (pending.length === 0) return;
    const now = p.getAudioContext().currentTime;
    for (const voice of pending) {
      clearTimeout(voice.pendingTimer);
      voice.pendingTimer = null;
      voice.pendingRequest = null;
      voice.envelope.releaseTime(BELL_RELEASE);
      voice.freeAt = now + BELL_STEAL_FADE_MS / 1000 + 0.15;
    }
  }

  function releaseBellVoices() {
    cancelPendingBellNotes();
    if (bellVoices.length === 0) return;
    const now = p.getAudioContext().currentTime;
    for (const voice of bellVoices) {
      voice.envelope.triggerRelease();
      voice.freeAt = now + BELL_RELEASE + 0.06;
    }
  }

  async function start() {
    if (audioStarting) return false;
    if (audioRunning) return true;
    audioStarting = true;
    try {
      const context = p.getAudioContext();
      await context.resume();
      p.userStartAudio();
      // Both instruments can play together, so both pools are created on Start.
      if (padVoices.length === 0) createPadVoices();
      if (bellVoices.length === 0) createBellVoices();
      audioRunning = true;
      return true;
    } finally {
      audioStarting = false;
    }
  }

  function pause() {
    audioRunning = false;
    releasePad();
    releaseBellVoices();
  }

  return {
    start, pause, playPad, playPadChord, playBell, releasePad, cancelPendingBellNotes,
    setHandProximity, setHandVolume,
    get running() { return audioRunning; },
    get starting() { return audioStarting; },
  };
}

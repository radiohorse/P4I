// Duration is the note's gate, in seconds. Its release and reverb continue afterward.
const NOTE_DURATION = 0.45;
const MAX_VOICES = 32;

export class AudioEngine {
  constructor() {
    this.tone = null;
    this.synth = null;
    this.filter = null;
    this.reverb = null;
    this.limiter = null;
    this.reverbError = null;
    this.replySynth = null;
    this.replyFilter = null;
    this.replyReverb = null;
    this.replyGain = null;
    this.replyDucked = true;
    this._state = 'locked';
    this._lastNoteTime = -Infinity;
    this._lastReplyTime = -Infinity;
    this.muted = false;
    this.master = null;
    this.silenceUntil = 0;
    this.retiringVoices = [];
    this.retirementTimer = null;
  }

  get clockTime() { return this.tone?.immediate() ?? 0; }
  get scheduleTime() { return this.tone?.now() ?? 0; }
  get replyLevel() { return this.replyGain?.gain.value ?? 0; }

  get state() {
    if (this._state === 'ready' && this.tone.getContext().state !== 'running') {
      return 'suspended';
    }
    return this._state;
  }

  get ready() {
    return this.state === 'ready';
  }

  // Call directly from pointerdown: browsers require the resume request in a gesture.
  async unlock() {
    if (this._state === 'disposed') return false;
    const Tone = window.Tone;
    if (!Tone) throw new Error('Tone.js did not load. Please reload the page.');

    this._state = 'starting';
    this.tone = Tone;
    try {
      const started = Tone.start(); // Keep this before any await.
      if (!this.synth) this._buildGraph(Tone);
      await started;
      if (this._state === 'disposed') return false;
      this._state = 'ready';
      return this.ready;
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  _buildGraph(Tone) {
    // A short scheduling cushion keeps gestures responsive without scheduling in the past.
    Tone.getContext().lookAhead = 0.03;
    this.master = new Tone.Gain(this.muted ? 0 : 0.85).toDestination();
    this.limiter = new Tone.Limiter(-6).connect(this.master);
    this.reverb = new Tone.Reverb({ decay: 3.6, preDelay: 0.025, wet: 0 });
    this.filter = new Tone.Filter({ frequency: 2200, type: 'lowpass', rolloff: -24, Q: 0.5 });
    this.synth = this._createVoice(false);
    this.synth.chain(this.filter, this.reverb, this.limiter);

    // Replies have their own quiet sine voice and wet bus. Ducking this bus
    // lowers even its reverb tail while leaving the user's sound untouched.
    this.replyGain = new Tone.Gain(this.replyDucked ? 0.12 : 0.85);
    this.replyReverb = new Tone.Reverb({ decay: 5.8, preDelay: 0.045, wet: 0 });
    this.replyFilter = new Tone.Filter({ frequency: 1600, type: 'lowpass', rolloff: -24, Q: 0.5 });
    this.replySynth = this._createVoice(true);
    this.replySynth.chain(this.replyFilter, this.replyReverb, this.replyGain, this.limiter);
    this.replyReverb.ready.then(() => {
      if (this._state !== 'disposed') this.replyReverb.wet.rampTo(0.5, 0.8, Math.max(this.scheduleTime, this.roomReadyAt ?? 0));
    }).catch(error => { this.reverbError = error; });

    // The dry signal is immediately playable while Tone builds its reverb impulse.
    // Fade the spacious tail in when ready; a failed impulse leaves the instrument usable.
    this.reverb.ready.then(() => {
      if (this._state !== 'disposed') this.reverb.wet.rampTo(0.28, 0.8, Math.max(this.scheduleTime, this.roomReadyAt ?? 0));
    }).catch((error) => {
      this.reverbError = error;
    });
  }

  play(pitch, velocity = 0.45) {
    if (!this.ready || !this.synth) return null;
    if (!this.muted && this.synth.activeVoices >= MAX_VOICES) return null;

    const level = Number.isFinite(velocity) ? Math.min(0.7, Math.max(0.05, velocity)) : 0.45;
    // Strictly increasing timestamps also handle several events in one browser frame.
    const time = Math.max(this.tone.now(), this.silenceUntil, this._lastNoteTime + 0.001);
    // Muted gestures still record their musical intentions without adding voices.
    if (!this.muted) this.synth.triggerAttackRelease(pitch, NOTE_DURATION, time, level);
    this._lastNoteTime = time;
    return { duration: NOTE_DURATION, velocity: level };
  }

  _createVoice(reply) {
    const Tone = this.tone;
    const synth = new Tone.PolySynth(Tone.Synth, reply ? {
      volume: -24, oscillator: { type: 'sine' },
      envelope: { attack: 0.18, decay: 1.6, sustain: 0.08, release: 4.4 },
    } : {
      volume: -19, oscillator: { type: 'custom', partials: [1, 0.22, 0.07, 0.025] },
      envelope: { attack: 0.02, decay: 0.9, sustain: 0.06, release: 2.6 },
    });
    synth.maxPolyphony = reply ? 12 : MAX_VOICES;
    return synth;
  }

  duckReply(ducked) {
    this.replyDucked = ducked;
    // rampTo holds the current gain before starting a new ramp (no jumps).
    this.replyGain?.gain.rampTo(ducked ? 0.12 : 0.85, ducked ? 0.18 : 0.7);
  }

  playReply(note, when = this.scheduleTime) {
    if (!this.ready || this.muted || this.replyDucked || this.replySynth.activeVoices >= 12) return null;
    const time = Math.max(this.scheduleTime, when, this._lastReplyTime + 0.001);
    this.replySynth.triggerAttackRelease(note.pitch, note.duration, time, note.velocity);
    this._lastReplyTime = time;
    return { time };
  }

  setMuted(muted) {
    this.muted = muted;
    this.master?.gain.rampTo(muted ? 0 : 0.85, 0.2);
  }

  clearTails() {
    if (!this.synth) return;
    const now = this.scheduleTime;
    this.silenceUntil = now + 0.18;
    this.roomReadyAt = now + 8;
    // A PolySynth's queued releases are pitch-based. Retire its voices on reset
    // so an old release cannot cut off a new note of the same pitch. Reuse the
    // context and effect graph; keep at most one fading pair of retired pools.
    if (this.retirementTimer !== null) this.tone.getContext().clearTimeout(this.retirementTimer);
    this.retiringVoices.forEach(synth => synth.dispose());
    this.retiringVoices = [this.synth, this.replySynth];
    this.retiringVoices.forEach(synth => synth.volume.rampTo(-80, 0.12, now));
    this.synth = this._createVoice(false).connect(this.filter);
    this.replySynth = this._createVoice(true).connect(this.replyFilter);
    this.retirementTimer = this.tone.getContext().setTimeout(() => {
      this.retiringVoices.forEach(synth => synth.dispose());
      this.retiringVoices = [];
      this.retirementTimer = null;
    }, 0.3);
    this.master.gain.rampTo(0, 0.12, now);
    this.master.gain.rampTo(this.muted ? 0 : 0.85, 0.2, this.silenceUntil);
    // Old room energy drains inaudibly; new notes remain playable through the
    // dry path, and the room returns gently after its previous tail has decayed.
    for (const [reverb, wet] of [[this.reverb, 0.28], [this.replyReverb, 0.5]]) {
      reverb.wet.rampTo(0, 0.12, now);
      reverb.wet.rampTo(wet, 0.9, this.roomReadyAt);
    }
  }

  dispose() {
    this._state = 'disposed';
    if (this.retirementTimer !== null) this.tone.getContext().clearTimeout(this.retirementTimer);
    this.retiringVoices.forEach(synth => synth.dispose());
    this.retiringVoices = [];
    for (const node of [this.synth, this.filter, this.reverb, this.replySynth, this.replyFilter, this.replyReverb, this.replyGain, this.limiter, this.master]) {
      node?.dispose();
    }
    this.synth = this.filter = this.reverb = this.limiter = null;
    this.replySynth = this.replyFilter = this.replyReverb = this.replyGain = null;
    this.master = null;
  }
}

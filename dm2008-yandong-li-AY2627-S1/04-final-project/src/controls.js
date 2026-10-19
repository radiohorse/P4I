export function bindControls({ state, recorder, audio, conversation, interaction, setStatus }) {
  const sound = document.getElementById('sound-toggle');
  const reset = document.getElementById('reset');
  let revision = 0;

  const reflectSound = () => {
    sound.textContent = audio.muted ? 'Sound off' : 'Sound on';
    sound.setAttribute('aria-pressed', String(!audio.muted));
    sound.setAttribute('aria-label', audio.muted ? 'Turn sound on' : 'Turn sound off');
    document.body.classList.toggle('sound-muted', audio.muted);
  };

  sound.addEventListener('click', async () => {
    const current = ++revision;
    interaction.finish(true);
    audio.setMuted(!audio.muted);
    reflectSound();
    if (audio.muted) {
      setStatus('Sound off');
      return;
    }
    try {
      // The resume call stays inside this button's user gesture.
      const ready = await audio.unlock();
      if (current !== revision) return;
      if (ready) conversation.refreshStatus();
    } catch {
      setStatus('Touch again to wake the sound');
    }
  });

  reset.addEventListener('click', () => {
    revision++;
    interaction.finish(true);
    conversation.reset();
    recorder.clear();
    audio.clearTails();
    state.visiblePhrases = [];
    state.hasDrawn = false;
    state.lastNoteAt = -Infinity;
    Object.assign(state.cursor, { visible: false, pressed: false, pitch: null });
    document.body.classList.remove('has-drawn');
    setStatus(audio.ready ? 'A fresh beginning' : 'Sound begins with your touch', audio.ready);
  });
  reflectSound();
}

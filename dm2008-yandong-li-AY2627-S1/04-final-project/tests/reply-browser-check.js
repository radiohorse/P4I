import assert from 'node:assert/strict';

export async function checkReplies(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const state = () => page.evaluate(() => window.quietReply.getState());
  const memory = () => page.evaluate(() => window.quietReply.exportData().phrases);
  const mode = value => page.waitForFunction(expected => window.quietReply.getState().conversationState === expected, value);
  async function melody(offset = 0) {
    await page.mouse.move(230, 610 + offset);
    await page.mouse.down();
    await page.waitForFunction(() => window.quietReply.getState().audioReady);
    const heights = [540, 430, 340, 420, 330, 260, 350];
    for (let i = 0; i < heights.length; i++) {
      await page.waitForTimeout(150);
      await page.mouse.move(330 + i * 115, heights[i] + offset, { steps: 6 });
    }
    await page.waitForTimeout(100);
    await page.mouse.up();
  }

  try {
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.quietReply));
    assert.equal((await state()).conversationState, 'IDLE');
    for (let i = 0; i < 4; i++) await melody(i * 15);
    const remembered = await memory();
    assert.deepEqual(remembered.map(p => p.id), [2, 3, 4]);
    assert.ok(remembered.every(p => p.notes.length >= 5 && p.path.length > 15));
    await page.waitForTimeout(1400);
    assert.equal((await state()).conversationState, 'WAITING_TO_REPLY');
    assert.equal((await state()).replyCount, 0);
    await mode('SYSTEM_REPLYING');
    const first = (await state()).activeReply;
    const source = remembered.find(p => p.id === first.sourceId);
    assert.ok(source);
    assert.ok(first.notes.every(n => source.notes.some(s => s.pitch[0] === n.pitch[0])));
    assert.ok(first.notes.every(n => n.duration > 0.45 && n.velocity < 0.45));
    assert.ok(first.notes.length <= source.notes.length);
    await page.waitForFunction(() => window.quietReply.getState().activeReply?.progress >= 0.3);
    const progress = (await state()).activeReply.progress;
    assert.ok(progress < 1);
    assert.equal((await state()).visibleReplyPhrases, 1);
    await page.screenshot({ path: `${output}/reply.png` });
    console.log('PASS: three-phrase memory, two-second listening pause, source-related variation, growing reply line.');

    await page.mouse.move(240, 690);
    await page.mouse.down();
    const interruptedCount = (await state()).replyNotesPlayed;
    assert.equal((await state()).conversationState, 'USER_PLAYING');
    assert.equal((await state()).activeReply, null);
    await page.waitForTimeout(260);
    assert.ok((await state()).replyLevel <= 0.13, 'The reply bus and reverb should duck smoothly.');
    assert.ok((await state()).activePhrase.notes.length > 0, 'User audio must still play while replies duck.');
    await page.waitForTimeout(2200);
    assert.equal((await state()).replyNotesPlayed, interruptedCount);
    assert.equal((await state()).conversationState, 'USER_PLAYING');
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(450 + i * 150, 600 - i * 110, { steps: 8 });
      await page.waitForTimeout(180);
    }
    await page.mouse.up();
    await page.waitForTimeout(1400);
    assert.equal((await state()).replyNotesPlayed, interruptedCount);
    console.log('PASS: playing interrupts the reply queue, ducks its tails, and retains user priority.');

    await page.evaluate(() => {
      window.__replyHistory = [];
      window.__replyPoll = setInterval(() => {
        const state = window.quietReply.getState();
        if (state.activeReply && !window.__replyHistory.some(entry => entry.id === state.replyCount)) {
          window.__replyHistory.push({ id: state.replyCount, round: state.replyRound, notes: state.activeReply.notes });
        }
      }, 30);
      window.__replyMeter = new Tone.Meter();
      Tone.Destination.connect(window.__replyMeter);
    });
    console.log('Checking the complete natural conversation through three quieter rounds…');
    await page.waitForFunction(() => {
      const state = window.quietReply.getState();
      return state.conversationState === 'IDLE' && state.replyRound === 3;
    }, null, { timeout: 85000 });
    const history = await page.evaluate(() => { clearInterval(window.__replyPoll); return window.__replyHistory; });
    assert.equal(history.length, 3);
    for (let i = 1; i < history.length; i++) {
      assert.ok(history[i].notes.length <= history[i - 1].notes.length);
      assert.ok(history[i].notes[0].velocity < history[i - 1].notes[0].velocity);
    }
    assert.deepEqual((await memory()).map(p => p.id), [3, 4, 5], 'Replies must not become new memories.');
    const quietCount = (await state()).replyNotesPlayed;
    await page.waitForTimeout(12000); // Let the more distant voice and room tail settle naturally.
    assert.equal((await state()).replyNotesPlayed, quietCount);
    const level = await page.evaluate(() => window.__replyMeter.getValue());
    assert.ok(level < -65, `Expected near silence after the final tail, got ${level} dB.`);
    console.log('PASS: replies grow sparser and softer, then stop; audio tails settle to near silence.');

    await melody();
    await mode('SYSTEM_REPLYING');
    await page.evaluate(() => Tone.getContext().rawContext.suspend());
    await mode('IDLE');
    const suspendedCount = (await state()).replyNotesPlayed;
    await page.waitForTimeout(2200);
    assert.equal((await state()).replyNotesPlayed, suspendedCount);
    await page.mouse.click(700, 500);
    await page.waitForFunction(() => window.quietReply.getState().audioReady);
    assert.equal((await memory()).at(-1).notes.length, 1);
    assert.equal((await state()).conversationState, 'WAITING_TO_REPLY');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await mode('IDLE');
    await page.waitForTimeout(2200);
    assert.equal((await state()).replyNotesPlayed, suspendedCount);
    assert.deepEqual(errors, []);
    console.log('PASS: suspended audio resumes only with a gesture; blur cancels future replies; zero browser errors.');
  } finally {
    await context.close();
  }
}

import assert from 'node:assert/strict';

export async function checkExhibition(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.__contextCount = 0;
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(Target, args) { window.__contextCount++; return new Target(...args); },
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const state = () => page.evaluate(() => window.quietReply.getState());
  const reset = () => page.getByRole('button', { name: 'Reset drawing and musical memory' }).click();
  async function curve(base, phase = 0) {
    await page.mouse.move(280, base + Math.sin(phase) * 80);
    await page.mouse.down();
    for (let i = 1; i <= 70; i++) {
      await page.mouse.move(280 + i * 12, base + Math.sin(i / 70 * Math.PI * 2 + phase) * 80);
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
  }
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.quietReply);
    assert.equal((await page.locator('#invitation').innerText()).replace(/\s+/g, ' ').trim(), 'Draw a sound. Leave a moment for its reply.');
    await page.screenshot({ path: `${output}/exhibition-idle.png` });
    await page.getByRole('button', { name: 'Turn sound off' }).click();
    assert.equal((await state()).muted, true);
    await page.mouse.click(700, 450);
    await page.waitForFunction(() => window.quietReply.getState().audioReady);
    const contextCount = await page.evaluate(() => window.__contextCount);
    assert.equal(contextCount, 1);
    await page.evaluate(() => {
      window.__wave = new Tone.Waveform(2048);
      Tone.Destination.connect(window.__wave);
    });
    await page.waitForTimeout(300);
    assert.equal((await state()).masterLevel, 0);
    assert.equal(await page.evaluate(() => Math.max(...window.__wave.getValue().map(Math.abs))), 0);
    assert.equal((await state()).phraseCount, 1, 'Muted drawing still retains its musical intention.');
    await page.getByRole('button', { name: 'Turn sound on' }).click();
    await page.waitForTimeout(2300);
    assert.equal((await state()).replyCount, 0, 'Unmuting does not replay an old conversation.');

    await reset();
    assert.equal((await state()).phraseCount, 0);
    assert.equal((await state()).visiblePhrases, 0);
    assert.equal((await state()).conversationState, 'IDLE');
    // Force a slow startup completion to exercise Reset against an old gesture.
    await page.evaluate(() => {
      const start = Tone.start;
      Tone.start = () => {
        Tone.start = start;
        const started = start();
        return new Promise(resolve => setTimeout(() => resolve(started), 250));
      };
    });
    await page.mouse.click(700, 450);
    await reset();
    await page.waitForTimeout(500);
    assert.equal((await state()).phraseCount, 0);
    assert.equal((await state()).visiblePhrases, 0);
    assert.equal((await state()).replyCount, 0);

    await page.mouse.move(400, 700);
    await page.mouse.down();
    let peak = 0;
    for (let i = 0; i < 38; i++) {
      await page.mouse.move(400 + i * 14, i % 2 ? 740 : 160, { steps: 2 });
      await page.waitForTimeout(100);
      peak = Math.max(peak, await page.evaluate(() => Math.max(...window.__wave.getValue().map(Math.abs))));
    }
    await page.mouse.up();
    assert.ok(peak > 0.0001 && peak < 0.55, `Output must be nonzero with generous headroom: peak ${peak}.`);
    await page.waitForFunction(() => window.quietReply.getState().conversationState === 'SYSTEM_REPLYING');
    await reset();
    await page.waitForTimeout(900);
    assert.ok(await page.evaluate(() => Math.max(...window.__wave.getValue().map(Math.abs))) < 0.0002, 'Reset must silence old voices and room tails.');
    assert.equal((await state()).phraseCount, 0);
    assert.equal((await state()).replyCount, 0);
    for (let i = 0; i < 4; i++) {
      await page.mouse.click(700, 450);
      await reset();
    }
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__contextCount), contextCount, 'Controls must reuse the AudioContext.');
    assert.equal(await page.locator('canvas').count(), 1);
    console.log(`PASS: sound controls, reset during replies/startup, repeated reset, and peak headroom (${peak.toFixed(3)}).`);

    await curve(400, 0.2);
    await curve(530, 0.9);
    await page.waitForFunction(() => window.quietReply.getState().activeReply?.progress > 0.5);
    await page.mouse.move(1300, 720);
    await page.screenshot({ path: `${output}/exhibition-playing.png` });
    const frames = await page.evaluate(() => new Promise(resolve => {
      const intervals = [];
      let previous;
      function sample(now) {
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
        if (intervals.length === 120) resolve(intervals.sort((a, b) => a - b));
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }));
    assert.ok(frames[60] < 40 && frames[114] < 85, 'Active animation should stay responsive.');
    console.log(`PASS: active rendering median ${frames[60].toFixed(1)} ms; 95th percentile ${frames[114].toFixed(1)} ms.`);
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.waitForFunction(() => document.querySelector('canvas').clientWidth === 3840);
    assert.ok(await page.locator('canvas').evaluate(canvas => canvas.width * canvas.height <= 8400000));
    await page.setViewportSize({ width: 320, height: 568 });
    await reset();
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${output}/exhibition-mobile.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const id of ['sound-toggle', 'reset']) {
      const box = await page.locator(`#${id}`).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height >= 44);
    }
    // Native keyboard button activation must not create a drawing gesture.
    await page.locator('#sound-toggle').focus();
    await page.keyboard.press('Space');
    assert.equal((await state()).muted, true);
    assert.equal((await state()).drawing, false);
    assert.equal((await state()).phraseCount, 0);
    assert.deepEqual(errors, []);
    console.log('PASS: 4K canvas budget, narrow-screen controls, keyboard activation, and zero console errors.');
  } finally {
    await context.close();
  }
}

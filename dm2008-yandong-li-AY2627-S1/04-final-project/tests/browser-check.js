import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { checkReplies } from './reply-browser-check.js';
import { checkExhibition } from './exhibition-browser-check.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
const port = process.env.PORT || '4173';
const url = `http://127.0.0.1:${port}`;
const allowedPitches = new Set(['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5']);
const errors = [];
let browser;
const server = spawn(process.execPath, ['scripts/serve.js'], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

async function openPage(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.quietReply));
  return page;
}

const state = page => page.evaluate(() => window.quietReply.getState());
const data = page => page.evaluate(() => window.quietReply.exportData());

async function drawCurve(page, y, phase = 0) {
  const point = t => ({ x: 260 + t * 900, y: y + Math.sin(t * Math.PI * 2 + phase) * 48 });
  const start = point(0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 70; i++) {
    const next = point(i / 70);
    await page.mouse.move(next.x, next.y);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
}

try {
  await new Promise((resolve, reject) => {
    let serverOutput = '';
    const timeout = setTimeout(() => reject(new Error('Development server did not start.')), 10000);
    server.once('error', reject);
    server.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Development server exited (${code}): ${serverOutput}`));
    });
    server.stderr.on('data', chunk => { serverOutput += chunk; });
    server.stdout.on('data', chunk => {
      serverOutput += chunk;
      if (serverOutput.includes('A Quiet Reply:')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  const channel = process.env.BROWSER_CHANNEL || 'msedge';
  const launchOptions = { headless: true, args: ['--autoplay-policy=user-gesture-required'] };
  if (process.env.BROWSER_PATH) launchOptions.executablePath = process.env.BROWSER_PATH;
  else if (channel !== 'chromium') launchOptions.channel = channel;
  browser = await chromium.launch(launchOptions);
  await mkdir(output, { recursive: true });

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await openPage(desktop);
  assert.deepEqual(await page.locator('canvas').evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight })), { width: 1440, height: 900 });
  assert.equal((await state(page)).audioReady, false);
  assert.equal((await state(page)).audioState, 'locked');
  await page.screenshot({ path: `${output}/idle.png` });
  console.log('PASS: page loads, full-screen canvas, audio locked before a gesture.');

  // A fresh page tests releasing before the asynchronous audio unlock completes.
  const quick = await openPage(desktop);
  await quick.mouse.click(620, 420);
  await quick.waitForFunction(() => window.quietReply.getState().audioReady && window.quietReply.exportData().phrases[0]?.notes.length === 1);
  const first = (await data(quick)).phrases[0];
  assert.equal(first.notes[0].onset, 0);
  assert.equal((await state(quick)).drawing, false);
  await quick.close();
  await page.bringToFront();
  console.log('PASS: first quick click unlocks audio and records its first note.');

  await page.mouse.move(120, 880);
  await page.mouse.down();
  await page.waitForFunction(() => window.quietReply.getState().audioReady);
  await page.evaluate(() => {
    window.__testMeter = new Tone.Meter();
    Tone.Destination.connect(window.__testMeter);
  });
  await page.waitForTimeout(120);
  const level = await page.evaluate(() => window.__testMeter.getValue());
  assert.ok(Number.isFinite(level) && level > -90, `Expected audible output, measured ${level} dB.`);
  for (let i = 1; i <= 48; i++) {
    await page.mouse.move(120 + i * 22, 880 - i * (860 / 48));
    await page.waitForTimeout(18);
  }
  await page.waitForTimeout(130);
  await page.mouse.up();
  const phrase = (await data(page)).phrases[0];
  assert.ok(phrase.notes.length >= 5, 'Vertical drawing should play a sequence of notes.');
  assert.equal(phrase.notes[0].pitch, 'C3');
  assert.equal(phrase.notes.at(-1).pitch, 'C5');
  assert.ok(phrase.notes.every(note => allowedPitches.has(note.pitch)));
  assert.ok(phrase.notes.every(note => note.duration === 0.45 && note.velocity > 0 && note.velocity <= 1));
  for (let i = 1; i < phrase.notes.length; i++) {
    assert.ok(phrase.notes[i].onset - phrase.notes[i - 1].onset >= 0.094, 'Drag notes must respect the 95 ms throttle.');
  }
  assert.ok(phrase.notes.some((note, i) => i > 0 && note.onset < phrase.notes[i - 1].onset + phrase.notes[i - 1].duration), 'Notes should overlap.');
  assert.ok(Math.abs(phrase.path.at(-1).x - 1176) < 2 && Math.abs(phrase.path.at(-1).y - 20) < 2, 'Recorded path must reach the cursor endpoint.');
  assert.ok(phrase.path.length > 30);
  console.log(`PASS: pentatonic pitch, overlapping audio (${level.toFixed(1)} dB), throttling, and accurate recorded path.`);

  await page.mouse.move(180, 450);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(180 + i * 30, 450);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  assert.equal((await data(page)).phrases.at(-1).notes.length, 1, 'Staying in one pitch region must not retrigger notes.');

  await page.mouse.move(300, 600);
  await page.mouse.down();
  await page.mouse.move(420, 540, { steps: 10 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).drawing, false);
  assert.equal((await state(page)).activePhrase, null);
  await page.mouse.up();
  console.log('PASS: horizontal gestures stay quiet; blur safely finishes a phrase.');

  await page.mouse.move(600, 450);
  await page.mouse.down();
  await page.waitForFunction(() => window.quietReply.getState().activePhrase?.notes.length === 1);
  await page.mouse.move(650, 330);
  await page.waitForTimeout(180); // No further movement: the new region must sound after the cooldown.
  await page.mouse.up();
  const heldCrossing = (await data(page)).phrases.at(-1);
  assert.equal(heldCrossing.notes.length, 2);
  assert.notEqual(heldCrossing.notes[0].pitch, heldCrossing.notes[1].pitch);
  assert.ok(heldCrossing.notes[1].onset - heldCrossing.notes[0].onset >= 0.094);

  await page.mouse.move(1430, 450);
  await page.mouse.down();
  await page.mouse.move(1480, 450);
  await page.mouse.up();
  assert.equal((await state(page)).drawing, false, 'Releasing outside the canvas must finish the gesture.');
  assert.equal((await data(page)).phrases.at(-1).path.at(-1).x, 1440, 'Captured outside movement should clamp to the canvas edge.');
  console.log('PASS: a stopped pitch crossing sounds after cooldown; outside release finishes cleanly.');

  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(864, 540);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForFunction(() => document.querySelector('canvas').clientWidth === 900 && !window.quietReply.getState().drawing);
  await page.mouse.up();
  const resized = (await data(page)).phrases.at(-1);
  assert.deepEqual(resized.viewport, { width: 1440, height: 900 });
  assert.ok(resized.path.every(point => Math.abs(point.nx - point.x / 1440) < 1e-9 && Math.abs(point.ny - point.y / 900) < 1e-9));
  assert.deepEqual(await page.locator('canvas').evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight })), { width: 900, height: 600 });
  await page.mouse.click(450, 300);
  const afterResize = (await data(page)).phrases.at(-1);
  assert.deepEqual(afterResize.viewport, { width: 900, height: 600 });
  assert.equal(afterResize.path[0].nx, 0.5);
  assert.equal(afterResize.path[0].ny, 0.5);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.querySelector('canvas').clientWidth === 1440);

  await page.locator('canvas').focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');
  const keyboardPhrase = (await data(page)).phrases.at(-1);
  assert.equal((await state(page)).drawing, false);
  assert.ok(keyboardPhrase.notes.length >= 3 && keyboardPhrase.notes.every(note => allowedPitches.has(note.pitch)));
  assert.ok(keyboardPhrase.path.at(-1).y < keyboardPhrase.path[0].y && keyboardPhrase.path.at(-1).x > keyboardPhrase.path[0].x);
  console.log('PASS: resize finishes gestures and preserves normalized coordinates; Space/arrows draw and play.');

  const recordedCount = (await data(page)).phrases.length;
  assert.ok((await state(page)).visiblePhrases > 0);
  console.log('Checking the full visual fade (about 27 seconds)…');
  await page.waitForFunction(() => window.quietReply.getState().visibleUserPhrases === 0, null, { timeout: 30000 });
  assert.equal((await data(page)).phrases.length, recordedCount, 'Fading must preserve phrase recordings.');
  console.log('PASS: completed lines fade naturally; recordings remain available.');

  await drawCurve(page, 370, 0.1);
  await drawCurve(page, 460, 0.7);
  await drawCurve(page, 550, 1.2);
  await page.mouse.move(1300, 730);
  await page.screenshot({ path: `${output}/instrument.png` });
  await page.evaluate(() => window.__testMeter.dispose());

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phone = await openPage(mobile);
  const touch = await mobile.newCDPSession(phone);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 45, y: 480 }] });
  await phone.waitForFunction(() => window.quietReply.getState().audioReady);
  for (let i = 1; i <= 40; i++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 45 + i * 7.5, y: 480 - Math.sin(i / 40 * Math.PI * 2) * 65 }] });
    await phone.waitForTimeout(15);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await data(phone)).phrases[0].notes.length > 1, 'Touch drawing should play and record notes.');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile view must not overflow horizontally.');
  await phone.waitForFunction(() => getComputedStyle(document.querySelector('#invitation')).opacity === '0');
  await phone.screenshot({ path: `${output}/mobile.png` });
  assert.deepEqual(errors, [], 'No browser errors should occur.');
  console.log('PASS: touch drawing and mobile layout. Screenshots saved to test-results/.');
  await mobile.close();
  await desktop.close();
  await checkReplies(browser, url, output);
  await checkExhibition(browser, url, output);
} finally {
  try {
    await browser?.close();
  } finally {
    server.kill();
  }
}

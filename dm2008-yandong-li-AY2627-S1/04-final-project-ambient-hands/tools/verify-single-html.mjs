#!/usr/bin/env node
// Verification for the single-file build.
//
//   node tools/verify-single-html.mjs                 # static + real Chrome checks
//   node tools/verify-single-html.mjs --static-only   # no browser needed
//   node tools/verify-single-html.mjs --baseline <file-with "path|size|sha256" lines>
//
// Prints PASS/FAIL lines and exits non-zero if any hard check fails.
//
// Browser checks:
//   1. The deliverable opens from file:// with no server and no network, renders,
//      loads the embedded fonts, and exposes p5 lifecycle hooks.
//   2. The same page over the original HTTP setup produces the same DOM/font/canvas
//      diagnostics (fidelity vs the untouched original).
//   3. The production ES modules inside the single file behave like the original
//      modules under the project's own simulated-camera browser fixture
//      (work/modular-browser-check.html): same readouts, same instruments,
//      same reverb/volume state, same audio attacks.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSingleHtml, DEFAULT_BUILD_NOTE } from "./single-html-bundler.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DELIVERABLE = path.join(ROOT, "ambient-hands.html");
const FIXTURE_HTML = "work/modular-browser-check.html";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

function parseArgs(argv) {
  const options = { staticOnly: false, baseline: null, keepTemp: false, chrome: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--static-only") options.staticOnly = true;
    else if (flag === "--keep-temp") options.keepTemp = true;
    else if (flag === "--chrome") options.chrome = argv[++i];
    else if (flag === "--baseline") options.baseline = argv[++i];
    else if (flag === "--help" || flag === "-h") {
      console.log("Usage: node tools/verify-single-html.mjs [--static-only] [--baseline file] [--chrome path] [--keep-temp]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const failures = [];
const warnings = [];
const tempRoot = mkdtempSync(path.join(tmpdir(), "ambient-hands-verify-"));

function check(name, ok, detail = "") {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!ok) failures.push(name);
  return ok;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ""}`);
  warnings.push(name);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------

async function staticChecks() {
  console.log("\n== Static checks ==");
  if (!existsSync(DELIVERABLE)) {
    check("deliverable exists", false, DELIVERABLE);
    return null;
  }
  const html = await readFile(DELIVERABLE, "utf8");
  const bytes = Buffer.byteLength(html);
  check("deliverable exists", true, `${path.relative(ROOT, DELIVERABLE)} (${(bytes / (1024 * 1024)).toFixed(2)} MB)`);

  // No local references survive outside the inlined <script>/<style> blocks.
  const skeleton = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const externalRef = skeleton.match(/\b(?:src|href)\s*=\s*["'](?!data:|https?:|#|mailto:|javascript:)[^"']+["']/i);
  check("no external local references", !externalRef, externalRef ? externalRef[0] : "all assets inlined");

  const styles = [...html.matchAll(/<style\b[^>]*>/gi)].length;
  const classicScripts = [...html.matchAll(/<script\b(?![^>]*data-source="bundle:)[^>]*>/gi)].length;
  const bundles = [...html.matchAll(/<script\b[^>]*data-source="bundle:([^"]+)"/gi)];
  check("styles inlined", styles === 2, `${styles} <style> blocks`);
  check("app is bundled into one classic script", bundles.length === 1, bundles.map((m) => m[1]).join(", "));

  const fonts = [...html.matchAll(/data:font\/(woff2?|ttf|otf);base64/g)].map((m) => m[1]);
  check("fonts embedded as data URIs", fonts.length === 2, fonts.join(", "));

  const markers = [...html.matchAll(/\/\* ---- (src\/[^*]+) ---- \*\//g)].map((m) => m[1]);
  const expectedModules = [
    "src/musicTheory.js", "src/handTracker.js", "src/gestureMapper.js", "src/audioEngine.js",
    "src/generativeEngine.js", "src/harmonicEngine.js", "src/visuals.js", "src/depthSketch.js",
  ];
  check("all production modules bundled", expectedModules.every((m) => markers.includes(m)), `${markers.length} modules`);

  const bundleMatch = html.match(/<script data-source="bundle:[^"]+">\n([\s\S]*?)\n<\/script>/);
  let bundleCompiles = false;
  if (bundleMatch) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(bundleMatch[1]);
      bundleCompiles = true;
    } catch (error) {
      bundleCompiles = false;
      warnings.push(`bundle syntax: ${error.message}`);
    }
  }
  check("bundled app script compiles", bundleCompiles);
  check("p5 lifecycle hooks assigned by the bundle", /window\.setup\s*=\s*setup/.test(html) && /window\.draw\s*=\s*draw/.test(html));
  check("no module script tag remains", !/<script\b[^>]*type\s*=\s*["']module["']/i.test(html));
  check("page title preserved", /<title>Ambient Hands<\/title>/.test(html));

  // Rebuild from the untouched sources and require byte-identical output.
  const rebuilt = path.join(tempRoot, "repro-ambient-hands.html");
  try {
    await buildSingleHtml({ root: ROOT, entryHtml: "index.html", outFile: rebuilt, note: DEFAULT_BUILD_NOTE });
    const rebuiltHash = sha256(await readFile(rebuilt));
    const deliveredHash = sha256(await readFile(DELIVERABLE));
    check("rebuild from sources is byte-identical", rebuiltHash === deliveredHash, rebuiltHash === deliveredHash ? deliveredHash.slice(0, 16) : "hashes differ");
  } catch (error) {
    check("rebuild from sources is byte-identical", false, error.message);
  }

  if (options.baseline) {
    const lines = (await readFile(options.baseline, "utf8")).split(/\r?\n/).filter(Boolean);
    let mismatches = 0;
    let checked = 0;
    const baselineFiles = [];
    for (const line of lines) {
      const [file, size, hash] = line.split("|");
      if (!file || !hash) continue;
      const absolute = path.isAbsolute(file) ? file : path.resolve(ROOT, file);
      baselineFiles.push(absolute);
      checked += 1;
      try {
        const current = await readFile(absolute);
        if (String(current.length) !== size || sha256(current).toUpperCase() !== hash.toUpperCase()) mismatches += 1;
      } catch {
        mismatches += 1;
      }
    }
    check("original source files unchanged", mismatches === 0, `${checked} files hashed${mismatches ? `, ${mismatches} changed` : ""}`);

    // The build only ever writes the deliverable; originals must be older than it.
    const deliverableMtime = (await stat(DELIVERABLE)).mtimeMs;
    const newerOriginals = [];
    for (const file of [...baselineFiles, path.join(ROOT, "index.html")]) {
      if ((await stat(file)).mtimeMs >= deliverableMtime - 1000) newerOriginals.push(path.relative(ROOT, file));
    }
    check("no original file touched after the build", newerOriginals.length === 0, newerOriginals.join(", ") || "all older than the deliverable");
  } else {
    warn("original-source baseline not provided", "pass --baseline <file> to compare SHA-256 hashes");
  }

  return { html, bytes, bundle: bundleMatch ? bundleMatch[1] : null };
}

// ---------------------------------------------------------------------------
// Static file server for the original project
// ---------------------------------------------------------------------------

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      let absolute = path.resolve(ROOT, `.${pathname}`);
      if (!absolute.startsWith(ROOT)) {
        response.writeHead(403);
        response.end("forbidden");
        return;
      }
      if (pathname.endsWith("/")) absolute = path.join(absolute, "index.html");
      const data = await readFile(absolute);
      response.writeHead(200, { "Content-Type": mimeFor(absolute), "Cache-Control": "no-store" });
      response.end(data);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

// ---------------------------------------------------------------------------
// Minimal Chrome DevTools Protocol client (browser endpoint + flat sessions)
// ---------------------------------------------------------------------------

class CdpClient {
  constructor(websocketUrl) {
    this.websocketUrl = websocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.websocketUrl);
      this.socket.addEventListener("open", () => resolve());
      this.socket.addEventListener("error", () => reject(new Error("DevTools WebSocket failed to open")));
      this.socket.addEventListener("message", (event) => this.onMessage(event.data));
    });
  }

  onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }
    const key = `${message.sessionId || ""}:${message.method}`;
    for (const listener of this.listeners.get(key) || []) listener(message.params);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  on(method, listener, sessionId = "") {
    const key = `${sessionId}:${method}`;
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(listener);
  }

  waitFor(method, sessionId = "", timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      this.on(
        method,
        (params) => {
          clearTimeout(timer);
          resolve(params);
        },
        sessionId,
      );
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
  }
}

function findChrome() {
  const candidates = [
    options.chrome,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function launchChrome(chromePath) {
  const profile = path.join(tempRoot, "chrome-profile");
  await mkdir(profile, { recursive: true });
  const logLines = [];
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-default-apps",
      "--metrics-recording-only",
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--remote-allow-origins=*",
      "--window-size=1280,800",
      "--force-device-scale-factor=1",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stderr.setEncoding("utf8");
  child.stdout.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    logLines.push(chunk);
    for (const line of chunk.split(/\r?\n/)) if (line.includes("DevTools listening")) console.log(`  chrome: ${line.trim()}`);
  });
  child.stdout.on("data", (chunk) => logLines.push(chunk));

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const joined = logLines.join("");
    const match = joined.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) return { child, websocketUrl: match[1], logText: () => logLines.join("") };
    if (child.exitCode !== null) break;
    await sleep(200);
  }
  child.kill();
  throw new Error(`Chrome did not expose a DevTools endpoint.\n${logLines.join("")}`);
}

async function stopChrome(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    killer.on("exit", () => resolve());
    killer.on("error", () => {
      child.kill();
      resolve();
    });
    setTimeout(() => resolve(), 5000);
  });
  await sleep(500); // give Chrome's helper processes time to release the profile files
}

async function cleanupTempDir() {
  if (options.keepTemp) {
    console.log(`Temp directory kept: ${tempRoot}`);
    return;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(tempRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
      return;
    } catch {
      await sleep(400);
    }
  }
  console.log(`Note: could not remove temp directory (locked files): ${tempRoot}`);
}

async function evaluate(cdp, sessionId, expression, { userGesture = false } = {}) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, userGesture },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(`Page evaluation failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description || ""}`);
  }
  return result.result.value;
}

async function openPage(cdp, { url, offlineAfterLoad = true, waitMs = 4000 }) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const consoleMessages = [];
  const exceptions = [];

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);

  cdp.on(
    "Runtime.consoleAPICalled",
    (params) => {
      const text = (params.args || [])
        .map((arg) => arg.value ?? arg.description ?? arg.type ?? "")
        .join(" ");
      consoleMessages.push({ type: params.type, text });
    },
    sessionId,
  );
  cdp.on(
    "Runtime.exceptionThrown",
    (params) => exceptions.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || ""),
    sessionId,
  );
  cdp.on(
    "Log.entryAdded",
    (params) => {
      if (params.entry) consoleMessages.push({ type: `log:${params.entry.level}`, text: params.entry.text });
    },
    sessionId,
  );

  const loaded = cdp.waitFor("Page.loadEventFired", sessionId, 30000);
  await cdp.send("Page.navigate", { url }, sessionId);
  await loaded;

  if (offlineAfterLoad) {
    await cdp.send(
      "Network.emulateNetworkConditions",
      { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" },
      sessionId,
    );
  }

  await sleep(waitMs);

  return { targetId, sessionId, consoleMessages, exceptions };
}

async function screenshot(cdp, sessionId, filePath) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(filePath, Buffer.from(data, "base64"));
  return filePath;
}

const PAGE_DIAGNOSTICS = `(async () => {
  const canvases = [...document.querySelectorAll("canvas")];
  const fonts = [...document.fonts].map((face) => ({
    family: face.family, weight: face.weight, style: face.style, status: face.status,
  }));
  const bodyStyle = getComputedStyle(document.body);
  const htmlStyle = getComputedStyle(document.documentElement);
  const controls = document.querySelector(".controls");
  const readouts = [...document.querySelectorAll(".readout")].map((element) => ({
    text: element.textContent,
    absent: element.classList.contains("absent"),
    color: getComputedStyle(element).color,
  }));
  return {
    title: document.title,
    readyState: document.readyState,
    canvases: canvases.length,
    canvasSizes: canvases.map((canvas) => [
      canvas.width, canvas.height,
      Math.round(canvas.getBoundingClientRect().width), Math.round(canvas.getBoundingClientRect().height),
    ]),
    viewport: [innerWidth, innerHeight],
    fonts,
    bodyFontFamily: bodyStyle.fontFamily,
    bodyMargin: bodyStyle.margin,
    htmlBackground: htmlStyle.backgroundColor,
    controlsText: controls ? controls.innerText.replace(/\\s+/g, " ").trim() : null,
    readouts,
    audioButtonLabel: document.querySelector(".icon-toggle")?.getAttribute("aria-label") || null,
    status: document.querySelector(".status-label")?.textContent || "",
    setupType: typeof window.setup,
    drawType: typeof window.draw,
    p5Type: typeof window.p5,
    hasQuietReply: Boolean(window.quietReply),
    generator: window.quietReply?.generator || null,
    bodyClasses: document.body.className,
  };
})()`;

function normalizeConsole(messages = []) {
  return [...new Set(
    messages.map((message) => String(message.text || "").split("\n")[0]
      .replace(/https?:\/\/127\.0\.0\.1:\d+/g, "<page>")
      .replace(/file:\/\/\/[^\s)]+/g, "<page>")
      .trim()),
  )].filter(Boolean).sort();
}

function compareDiagnostics(label, original, single) {
  const equalFields = ["title", "canvases", "bodyFontFamily", "bodyMargin", "htmlBackground", "controlsText", "audioButtonLabel", "setupType", "drawType", "p5Type", "hasQuietReply", "generator"];
  for (const field of equalFields) {
    check(`${label}: ${field} matches original`, JSON.stringify(original[field]) === JSON.stringify(single[field]),
      `original=${JSON.stringify(original[field])} single=${JSON.stringify(single[field])}`);
  }
  check(`${label}: canvas size matches viewport`, JSON.stringify(single.canvasSizes) === JSON.stringify([[...single.viewport, ...single.viewport]]),
    JSON.stringify(single.canvasSizes));
  check(`${label}: same canvas geometry as original`, JSON.stringify(original.canvasSizes) === JSON.stringify(single.canvasSizes));
  check(`${label}: same readouts as original`, JSON.stringify(original.readouts) === JSON.stringify(single.readouts),
    JSON.stringify(single.readouts.map((r) => r.text)));
  const faceKey = (faces) => JSON.stringify(faces.map((f) => [f.family, f.weight, f.status]).sort());
  check(`${label}: same font faces and status as original`, faceKey(original.fonts) === faceKey(single.fonts), JSON.stringify(single.fonts));
  check(`${label}: fonts loaded`, single.fonts.length >= 2 && single.fonts.every((face) => face.status === "loaded"),
    single.fonts.map((face) => `${face.family}:${face.status}`).join(", "));
  check(`${label}: p5 setup/draw available`, single.setupType === "function" && single.drawType === "function");
  check(`${label}: no uncaught page exceptions`, (single.exceptions || []).length === 0, JSON.stringify((single.exceptions || []).slice(0, 3)));
  console.log(`  ${label}: console errors original=${JSON.stringify(normalizeConsole(original.consoleMessages))}`);
  console.log(`  ${label}: console errors single  =${JSON.stringify(normalizeConsole(single.consoleMessages))}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const staticResult = await staticChecks();
if (!staticResult) {
  console.log("\nRESULT: FAIL");
  process.exit(1);
}

if (options.staticOnly) {
  console.log(`\nRESULT: ${failures.length === 0 ? "PASS" : "FAIL"} (static only)`);
  await cleanupTempDir();
  process.exit(failures.length === 0 ? 0 : 1);
}

console.log("\n== Browser checks ==");
const chromePath = findChrome();
if (!check("headless browser available", Boolean(chromePath), chromePath || "Chrome/Edge not found")) {
  console.log(`\nRESULT: FAIL`);
  rmSync(tempRoot, { recursive: true, force: true });
  process.exit(1);
}

// Build a single-file copy of the project's own simulated-camera fixture.
const fixtureSinglePath = path.join(tempRoot, "fixture-single.html");
await buildSingleHtml({
  root: ROOT,
  entryHtml: FIXTURE_HTML,
  outFile: fixtureSinglePath,
  note: "Verification fixture: the project's simulated-camera check page with all assets inlined.",
  log: () => {},
});
check("fixture single-file build succeeded", existsSync(fixtureSinglePath), path.basename(fixtureSinglePath));

const { server, port } = await startServer();
const origin = `http://127.0.0.1:${port}`;
let chromeChild = null;
let cdp = null;
let exitCode = 1;

try {
  const launched = await launchChrome(chromePath);
  chromeChild = launched.child;
  cdp = new CdpClient(launched.websocketUrl);
  await cdp.connect();
  check("headless browser connected", true);

  const singleUrl = pathToFileURL(DELIVERABLE).href;
  const originalPageUrl = `${origin}/index.html`;
  const originalFixtureUrl = `${origin}/${FIXTURE_HTML}`;
  const singleFixtureUrl = pathToFileURL(fixtureSinglePath).href;
  const shots = {};

  // 1) Original page over HTTP, then offline, no camera.
  const originalPage = await openPage(cdp, { url: originalPageUrl, waitMs: 5000 });
  const originalDiagnostics = {
    ...(await evaluate(cdp, originalPage.sessionId, PAGE_DIAGNOSTICS)),
    consoleMessages: originalPage.consoleMessages,
    exceptions: originalPage.exceptions,
  };
  shots.original = await screenshot(cdp, originalPage.sessionId, path.join(tempRoot, "original-page.png"));

  // 2) Single file from file://, then offline, no camera.
  const singlePage = await openPage(cdp, { url: singleUrl, waitMs: 5000 });
  const singleDiagnostics = {
    ...(await evaluate(cdp, singlePage.sessionId, PAGE_DIAGNOSTICS)),
    consoleMessages: singlePage.consoleMessages,
    exceptions: singlePage.exceptions,
  };
  shots.single = await screenshot(cdp, singlePage.sessionId, path.join(tempRoot, "single-page.png"));

  console.log("\n-- Single file opened directly from file:// --");
  check("single file: page title", singleDiagnostics.title === "Ambient Hands", singleDiagnostics.title);
  check("single file: one p5 canvas created", singleDiagnostics.canvases === 1, `${singleDiagnostics.canvases}`);
  check("single file: a canvas covers the viewport", JSON.stringify(singleDiagnostics.canvasSizes) === JSON.stringify([[...singleDiagnostics.viewport, ...singleDiagnostics.viewport]]), JSON.stringify(singleDiagnostics.canvasSizes));
  check("single file: p5 setup/draw exposed", singleDiagnostics.setupType === "function" && singleDiagnostics.drawType === "function");
  check("single file: fonts loaded from data URIs", singleDiagnostics.fonts.length === 2 && singleDiagnostics.fonts.every((face) => face.status === "loaded"), singleDiagnostics.fonts.map((f) => `${f.family}:${f.status}`).join(", "));
  check("single file: body uses embedded Helvetica Light", /Helvetica Light/.test(singleDiagnostics.bodyFontFamily), singleDiagnostics.bodyFontFamily);
  check("single file: controls rendered", /C · Ionian/.test(singleDiagnostics.controlsText || ""), JSON.stringify(singleDiagnostics.controlsText));
  check("single file: generator active", singleDiagnostics.generator === "harmony", String(singleDiagnostics.generator));
  check("single file: audio button present", singleDiagnostics.audioButtonLabel === "Start sound", String(singleDiagnostics.audioButtonLabel));

  console.log("\n-- Fidelity against the untouched original page --");
  compareDiagnostics("fidelity", originalDiagnostics, singleDiagnostics);

  // 2b) The single file also has to keep working when served over HTTP,
  //     including the documented ?generator=random override.
  console.log("\n-- Single file served over HTTP --");
  const servedPage = await openPage(cdp, { url: `${origin}/ambient-hands.html?generator=random`, waitMs: 4000 });
  const servedDiagnostics = await evaluate(cdp, servedPage.sessionId, PAGE_DIAGNOSTICS);
  check("served single file: p5 canvas created", servedDiagnostics.canvases === 1, `${servedDiagnostics.canvases}`);
  check("served single file: ?generator=random override", servedDiagnostics.generator === "random", String(servedDiagnostics.generator));
  check("served single file: fonts loaded", servedDiagnostics.fonts.every((face) => face.status === "loaded"), servedDiagnostics.fonts.map((f) => `${f.family}:${f.status}`).join(", "));
  check("served single file: no uncaught exceptions", servedPage.exceptions.length === 0, JSON.stringify(servedPage.exceptions.slice(0, 2)));

  // 2c) helper.js resize hook must still work after inlining.
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false }, servedPage.sessionId);
  await sleep(600);
  const resized = await evaluate(cdp, servedPage.sessionId, `(() => {
    const canvas = document.querySelector("canvas");
    return {
      canvas: canvas ? [canvas.width, canvas.height] : null,
      viewport: [innerWidth, innerHeight],
    };
  })()`);
  check("served single file: resize hook resizes the canvas", JSON.stringify(resized.canvas) === JSON.stringify(resized.viewport), JSON.stringify(resized));
  await cdp.send("Emulation.clearDeviceMetricsOverride", {}, servedPage.sessionId);
  await cdp.send("Target.closeTarget", { targetId: servedPage.targetId }).catch(() => {});

  // 3) Fixture parity: original modules over HTTP vs bundled modules in the single file.
  console.log("\n-- Simulated-camera/audio fixture parity --");
  async function runFixture(url, label) {
    const page = await openPage(cdp, { url, waitMs: 2000 });
    const clicked = await evaluate(
      cdp,
      page.sessionId,
      `(() => {
        const element = document.querySelector(".icon-toggle");
        if (!element) return false;
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
        return true;
      })()`,
      { userGesture: true },
    );
    await sleep(4000);
    const raw = await evaluate(cdp, page.sessionId, `document.getElementById("module-check")?.textContent || ""`);
    const shot = await screenshot(cdp, page.sessionId, path.join(tempRoot, `fixture-${label}.png`));
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    return { page, data, raw, clicked, shot };
  }

  const originalFixture = await runFixture(originalFixtureUrl, "original");
  const singleFixture = await runFixture(singleFixtureUrl, "single");

  const a = originalFixture.data;
  const b = singleFixture.data;
  check("fixture: both pages produced diagnostics", Boolean(a && b), `original=${Boolean(a)} single=${Boolean(b)}`);
  if (a && b) {
    check("fixture: simulated camera and hand model used", b.captureCalls > 0 && b.detectionLoops > 0, `captureCalls=${b.captureCalls} detectionLoops=${b.detectionLoops}`);
    check("fixture: one canvas", a.canvases === 1 && b.canvases === 1, `original=${a.canvases} single=${b.canvases}`);
    check("fixture: same viewport/logical size", JSON.stringify(a.logicalSize) === JSON.stringify(b.logicalSize) && JSON.stringify(a.viewport) === JSON.stringify(b.viewport), `${JSON.stringify(b.logicalSize)} vs ${JSON.stringify(b.viewport)}`);
    check("fixture: audio started in both pages", a.audioButton === "Pause sound" && b.audioButton === "Pause sound", `original=${a.audioButton} single=${b.audioButton}`);
    check("fixture: same readouts", JSON.stringify(a.readouts) === JSON.stringify(b.readouts), JSON.stringify(b.readouts));
    check("fixture: both instruments received note attacks", b.attacks.Pad > 0 && b.attacks.Bell > 0, JSON.stringify(b.attacks));
    const wet = (page) => page.audio.map((effect) => Number(effect.wet));
    const wetDiff = wet(b).map((value, index) => Math.abs(value - wet(a)[index]));
    check("fixture: same reverb wet state", wetDiff.every((diff) => diff < 0.08), `original=${JSON.stringify(wet(a))} single=${JSON.stringify(wet(b))}`);
    const volumes = (page) => page.audio.map((effect) => Number(effect.volume));
    check("fixture: same output volume", volumes(b).every((value, index) => Math.abs(value - volumes(a)[index]) < 0.05), `original=${JSON.stringify(volumes(a))} single=${JSON.stringify(volumes(b))}`);
    const fontStatus = (page) => JSON.stringify(page.fonts.map((font) => [font.family, font.status]).sort());
    check("fixture: same fonts loaded", fontStatus(a) === fontStatus(b), JSON.stringify(b.fonts));
    check("fixture: hand readouts show full openness", b.readouts.every((readout) => readout.text === "100%" && readout.absent === false), JSON.stringify(b.readouts));
  } else {
    console.log("  single fixture raw diagnostics:", singleFixture.raw.slice(0, 400));
    console.log("  original fixture raw diagnostics:", originalFixture.raw.slice(0, 400));
  }

  // 4) Camera API path on file:// (fake capture device).
  console.log("\n-- camera API on file:// (fake capture device) --");
  const cameraProbe = `(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 800));
      const result = { started: true, ready: video.readyState >= 2, width: video.videoWidth, height: video.videoHeight };
      stream.getTracks().forEach((track) => track.stop());
      return result;
    } catch (error) {
      return { started: false, ready: false, error: String(error && error.message || error) };
    }
  })()`;
  const singleCamera = await evaluate(cdp, singlePage.sessionId, cameraProbe);
  const originalCamera = await evaluate(cdp, originalPage.sessionId, cameraProbe);
  console.log(`  file:// camera probe:   ${JSON.stringify(singleCamera)}`);
  console.log(`  http:// camera probe:   ${JSON.stringify(originalCamera)}`);
  check("camera path identical on file:// and http://", JSON.stringify(singleCamera) === JSON.stringify(originalCamera),
    `file=${JSON.stringify(singleCamera)} http=${JSON.stringify(originalCamera)}`);
  if (!singleCamera.started) {
    warn("file:// camera unavailable in this headless browser", "the original application documents that camera access needs localhost or HTTPS");
  }

  console.log(`\nScreenshots (temp): ${JSON.stringify(shots)}`);
  console.log(`  fixture original: ${originalFixture.shot}`);
  console.log(`  fixture single:   ${singleFixture.shot}`);
  console.log(`Temp directory: ${tempRoot}`);

  await cdp.send("Target.closeTarget", { targetId: originalPage.targetId }).catch(() => {});
  await cdp.send("Target.closeTarget", { targetId: singlePage.targetId }).catch(() => {});
  await cdp.send("Target.closeTarget", { targetId: originalFixture.page.targetId }).catch(() => {});
  await cdp.send("Target.closeTarget", { targetId: singleFixture.page.targetId }).catch(() => {});

  exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  console.error(`\nBROWSER CHECK ERROR: ${error.stack || error.message}`);
  console.error(`Temp directory kept for inspection: ${tempRoot}`);
  exitCode = 1;
} finally {
  if (cdp) cdp.close();
  await stopChrome(chromeChild);
  await new Promise((resolve) => server.close(resolve));
  await cleanupTempDir();
}

const success = exitCode === 0 && failures.length === 0;
console.log(`\nRESULT: ${success ? "PASS" : `FAIL (${failures.length} failed check(s))`}`);
if (warnings.length > 0) console.log(`Warnings: ${warnings.join("; ")}`);
process.exit(success ? 0 : 1);

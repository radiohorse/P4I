import { ZONE_COLUMNS, ZONE_ROWS, ZONE_COUNT, midiToLabel } from "./musicTheory.js";

// Appearance controls. Drawing never starts a note or changes a hand landmark.
export const CAMERA_FILTER = "grayscale(0.6) contrast(0.82) brightness(1.08) blur(0.6px)";
export const CAMERA_WASH = 120;
export const GRAIN_AMOUNT = 0.16;
export const GRAIN_TILE_SIZE = 180;
export const GRAIN_TILE_COUNT = 4;
export const GRAIN_FRAMES_PER_TILE = 9;
export const ZONE_TINT_A = [250, 249, 243, 44];
export const ZONE_TINT_B = [200, 211, 203, 44];
export const PAD_COLOR = [116, 150, 138];
export const BELL_COLOR = [207, 172, 105];

export function cameraRect(canvasWidth, canvasHeight, videoWidth = 640, videoHeight = 480) {
  // Cover fit: fill the canvas without stretching; crop the extra edges.
  const zoom = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
  return {
    x: (canvasWidth - videoWidth * zoom) / 2,
    y: (canvasHeight - videoHeight * zoom) / 2,
    w: videoWidth * zoom,
    h: videoHeight * zoom,
    zoom,
  };
}

export function createVisuals(p) {
  const grainPatterns = [];
  const grainOffset = { x: 0, y: 0 };

  function drawCamera(video, cameraReady, view) {
    p.background(239, 239, 232);
    if (!cameraReady) return;
    p.push();
    p.translate(p.width, 0);
    p.scale(-1, 1);
    p.drawingContext.filter = CAMERA_FILTER;
    p.image(video, p.width - view.x - view.w, view.y, view.w, view.h);
    p.drawingContext.filter = "none";
    p.pop();
    p.noStroke();
    p.fill(239, 239, 232, CAMERA_WASH);
    p.rect(0, 0, p.width, p.height);
  }

  function drawZones(zoneNotes, pad, bell, padZone, bellZone) {
    const zoneWidth = p.width / ZONE_COLUMNS;
    const zoneHeight = p.height / ZONE_ROWS;
    p.textSize(parseFloat(getComputedStyle(document.body).fontSize));
    const fade = Math.exp(-p.deltaTime / 450);

    for (let i = 0; i < ZONE_COUNT; i++) {
      const column = i % ZONE_COLUMNS;
      const row = ZONE_ROWS - 1 - Math.floor(i / ZONE_COLUMNS);
      const x = column * zoneWidth;
      const y = row * zoneHeight;
      p.noStroke();
      p.fill(...((column + row) % 2 === 0 ? ZONE_TINT_A : ZONE_TINT_B));
      p.rect(x, y, zoneWidth, zoneHeight);
      if (i === padZone) {
        p.fill(...PAD_COLOR, 55);
        p.rect(x, y, zoneWidth, zoneHeight);
      }
      if (i === bellZone) {
        p.fill(...BELL_COLOR, 55);
        p.rect(x, y, zoneWidth, zoneHeight);
      }
      p.fill(...PAD_COLOR, pad.glow[i] * 120);
      p.rect(x, y, zoneWidth, zoneHeight);
      p.fill(...BELL_COLOR, bell.glow[i] * 120);
      p.rect(x, y, zoneWidth, zoneHeight);
      pad.glow[i] *= fade;
      bell.glow[i] *= fade;
      p.stroke(75, 90, 81, 25);
      p.line(x, y, x, y + zoneHeight);
      p.noStroke();
      p.textAlign(p.CENTER, p.CENTER);
      p.fill(95, 111, 99);
      p.text(midiToLabel(zoneNotes[i]), x + zoneWidth / 2, y + zoneHeight - 45);
    }
    p.stroke(75, 90, 81, 40);
    p.line(0, zoneHeight, p.width, zoneHeight);
  }

  function createGrainTiles() {
    // Small reusable patterns avoid calculating full-screen noise every frame.
    for (let t = 0; t < GRAIN_TILE_COUNT; t++) {
      const tile = document.createElement("canvas");
      tile.width = GRAIN_TILE_SIZE;
      tile.height = GRAIN_TILE_SIZE;
      const context = tile.getContext("2d");
      const pixels = context.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = 110 + Math.random() * 145;
        pixels.data[i] = value;
        pixels.data[i + 1] = value;
        pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      grainPatterns.push(p.drawingContext.createPattern(tile, "repeat"));
    }
  }

  function drawGrain() {
    const tileIndex = Math.floor(p.frameCount / GRAIN_FRAMES_PER_TILE) % GRAIN_TILE_COUNT;
    if (p.frameCount % GRAIN_FRAMES_PER_TILE === 0) {
      grainOffset.x = Math.floor(Math.random() * GRAIN_TILE_SIZE);
      grainOffset.y = Math.floor(Math.random() * GRAIN_TILE_SIZE);
    }
    const context = p.drawingContext;
    context.save();
    context.globalAlpha = GRAIN_AMOUNT;
    context.translate(-grainOffset.x, -grainOffset.y);
    context.fillStyle = grainPatterns[tileIndex];
    context.fillRect(0, 0, p.width + GRAIN_TILE_SIZE, p.height + GRAIN_TILE_SIZE);
    context.restore();
  }

  function drawHandMarker(hand, color) {
    if (hand.open < 0.01 && !hand.visible) return;
    const alpha = hand.visible ? 200 : 200 * hand.open;
    p.noFill();
    p.stroke(...color, alpha);
    p.strokeWeight(1.5);
    p.circle(hand.x, hand.y, 18 + hand.open * 34);
    // A separate outer halo grows with proximity; the inner ring still shows openness.
    p.stroke(...color, alpha * 0.45);
    p.strokeWeight(1 + hand.proximity * 1.5);
    p.circle(hand.x, hand.y, 64 + hand.proximity * 36);
    p.noStroke();
    p.fill(...color, alpha);
    p.circle(hand.x, hand.y, 4);
  }

  return { createGrainTiles, drawCamera, drawZones, drawGrain, drawHandMarker };
}

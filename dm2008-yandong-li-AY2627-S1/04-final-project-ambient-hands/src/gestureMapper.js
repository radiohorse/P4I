import { ZONE_COLUMNS, ZONE_ROWS } from "./musicTheory.js";

// This module interprets landmarks. It never starts a camera or plays a sound.
export const SWAP_HANDS = false; // Set true if the camera's Left/Right labels are reversed.
export const FIST_RATIO = 1.05;
export const OPEN_RATIO = 1.75;
export const HAND_SMOOTH_MS = 90;
export const HAND_LOST_MS = 300;
// Palm length / source video height: independent of canvas crop and finger spread.
export const PALM_FAR_RATIO = 0.09;
export const PALM_NEAR_RATIO = 0.30;
export const PROXIMITY_SMOOTH_MS = 220;

export function createHandState() {
  return {
    visible: false,
    lastSeen: -Infinity,
    targetX: 0, targetY: 0, targetOpen: 0,
    videoX: 0, videoY: 0, open: 0,
    x: 0, y: 0,
    targetProximity: 0.5, proximity: 0.5,
  };
}

export function palmCenter(result) {
  // Average the wrist and four knuckles: steadier than a fingertip.
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

export function opennessRatio(result) {
  // Use palm length as a ruler, so camera distance does not change the ratio.
  const wrist = result.wrist;
  const palmLength = Math.hypot(
    wrist.x - result.middle_finger_mcp.x, wrist.y - result.middle_finger_mcp.y,
  );
  if (palmLength < 1) return FIST_RATIO;
  const tips = [result.index_finger_tip, result.middle_finger_tip,
    result.ring_finger_tip, result.pinky_finger_tip];
  let total = 0;
  for (const tip of tips) total += Math.hypot(wrist.x - tip.x, wrist.y - tip.y);
  return total / tips.length / palmLength;
}

export function handProximity(result, videoHeight = 480) {
  if (!Number.isFinite(videoHeight) || videoHeight <= 0) return 0.5;
  const palmLength = Math.hypot(
    result.wrist.x - result.middle_finger_mcp.x,
    result.wrist.y - result.middle_finger_mcp.y,
  );
  if (!Number.isFinite(palmLength)) return 0.5;
  const ratio = palmLength / videoHeight;
  return Math.min(1, Math.max(0, (ratio - PALM_FAR_RATIO) / (PALM_NEAR_RATIO - PALM_FAR_RATIO)));
}

export function zoneForPosition(x, y, canvasWidth, canvasHeight) {
  if (![x, y, canvasWidth, canvasHeight].every(Number.isFinite)) return -1;
  if (canvasWidth <= 0 || canvasHeight <= 0) return -1;
  if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) return -1;
  const column = Math.floor((x / canvasWidth) * ZONE_COLUMNS);
  // Canvas y grows downwards, but the bottom row contains the lowest notes.
  const rowFromBottom = ZONE_ROWS - 1 - Math.floor((y / canvasHeight) * ZONE_ROWS);
  return rowFromBottom * ZONE_COLUMNS + column;
}

export function handZone(hand, canvasWidth, canvasHeight) {
  if (!hand.visible) return -1;
  return zoneForPosition(hand.x, hand.y, canvasWidth, canvasHeight);
}

export function handIntensity(hand) {
  return hand.visible ? hand.open : 0;
}

export function createGestureMapper() {
  const hands = { Left: createHandState(), Right: createHandState() };

  function gotHands(results, nowMs, videoHeight = 480) {
    // Detection callbacks update targets; draw() later smooths them.
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
      const open = (opennessRatio(result) - FIST_RATIO) / (OPEN_RATIO - FIST_RATIO);
      hand.targetOpen = Math.min(1, Math.max(0, open));
      hand.targetProximity = handProximity(result, videoHeight);
      // Reappearing hands jump to their location instead of sliding from stale coordinates.
      if (nowMs - hand.lastSeen > HAND_LOST_MS) {
        hand.videoX = hand.targetX;
        hand.videoY = hand.targetY;
        hand.proximity = hand.targetProximity;
      }
      hand.lastSeen = nowMs;
    }
  }

  function updateHands(nowMs, deltaTimeMs, view) {
    const amount = 1 - Math.exp(-deltaTimeMs / HAND_SMOOTH_MS);
    const depthAmount = 1 - Math.exp(-deltaTimeMs / PROXIMITY_SMOOTH_MS);
    for (const label in hands) {
      const hand = hands[label];
      hand.visible = nowMs - hand.lastSeen < HAND_LOST_MS;
      const targetOpen = hand.visible ? hand.targetOpen : 0;
      hand.open += (targetOpen - hand.open) * amount;
      hand.videoX += (hand.targetX - hand.videoX) * amount;
      hand.videoY += (hand.targetY - hand.videoY) * amount;
      // Hold the last depth while absent, so existing reverb tails stay stable.
      if (hand.visible) hand.proximity += (hand.targetProximity - hand.proximity) * depthAmount;
      // The same cover-fit geometry is supplied to the renderer and the mapper.
      hand.x = view.x + hand.videoX * view.zoom;
      hand.y = view.y + hand.videoY * view.zoom;
    }
  }

  return { hands, gotHands, updateHands };
}

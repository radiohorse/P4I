import test from 'node:test';
import assert from 'node:assert/strict';
import { PITCHES } from '../src/config.js';
import { pitchIndexAt, stablePitchIndex } from '../src/scale.js';

test('vertical drawing covers two octaves of C major pentatonic from bottom to top', () => {
  const expected = ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5'];
  const positions = [1050, 950, 850, 750, 650, 550, 450, 350, 250, 150, 50];
  assert.deepEqual(positions.map((y) => PITCHES[pitchIndexAt(y, 1100)]), expected);

  // Check the entire drawable height, including boundaries between regions.
  const heard = new Set();
  for (let y = 0; y <= 1100; y++) {
    const pitch = PITCHES[pitchIndexAt(y, 1100)];
    assert.ok(expected.includes(pitch));
    heard.add(pitch);
  }
  assert.equal(heard.size, expected.length);
});

test('canvas edges and captured pointer movement outside the canvas clamp to the end notes', () => {
  for (const y of [-10000, -1, 0]) {
    assert.equal(PITCHES[pitchIndexAt(y, 600)], 'C5');
  }
  for (const y of [600, 601, 10000]) {
    assert.equal(PITCHES[pitchIndexAt(y, 600)], 'C3');
  }
  assert.equal(PITCHES[stablePitchIndex(-100, 600, 5)], 'C5');
  assert.equal(PITCHES[stablePitchIndex(700, 600, 5)], 'C3');
});

test('small boundary jitter holds the current pitch until movement clearly crosses the boundary', () => {
  let index = stablePitchIndex(550, 1100);
  assert.equal(PITCHES[index], 'C4');

  for (const y of [501, 499, 502, 498, 500]) {
    index = stablePitchIndex(y, 1100, index);
    assert.equal(PITCHES[index], 'C4');
  }
  index = stablePitchIndex(494, 1100, index);
  assert.equal(PITCHES[index], 'D4');

  for (const y of [499, 501, 498, 502]) {
    index = stablePitchIndex(y, 1100, index);
    assert.equal(PITCHES[index], 'D4');
  }
  index = stablePitchIndex(506, 1100, index);
  assert.equal(PITCHES[index], 'C4');
  assert.equal(PITCHES[stablePitchIndex(606, 1100, index)], 'A3');
});

test('hysteresis shrinks with a short canvas so neighboring notes remain reachable', () => {
  const middle = stablePitchIndex(55, 110);
  assert.equal(PITCHES[middle], 'C4');
  assert.equal(PITCHES[stablePitchIndex(49, 110, middle)], 'C4');
  const above = stablePitchIndex(48, 110, middle);
  assert.equal(PITCHES[above], 'D4');
  assert.equal(PITCHES[stablePitchIndex(51, 110, above)], 'D4');
  assert.equal(PITCHES[stablePitchIndex(52, 110, above)], 'C4');
});

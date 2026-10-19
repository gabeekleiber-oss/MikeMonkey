import test from 'node:test';
import assert from 'node:assert/strict';
import { RollingStats } from '../src/engine/perf-stats.js';

test('empty window reports zero', () => {
  const s = new RollingStats(4);
  assert.equal(s.mean(), 0);
  assert.equal(s.max(), 0);
});

test('mean and max over a partly filled window', () => {
  const s = new RollingStats(4);
  [2, 4, 6].forEach((v) => s.push(v));
  assert.equal(s.mean(), 4);
  assert.equal(s.max(), 6);
});

test('old samples are overwritten once the window is full', () => {
  const s = new RollingStats(3);
  [100, 1, 2, 3].forEach((v) => s.push(v)); // 100 falls out
  assert.equal(s.max(), 3);
  assert.equal(s.mean(), 2);
});

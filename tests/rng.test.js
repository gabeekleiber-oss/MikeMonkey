import test from 'node:test';
import assert from 'node:assert/strict';
import { hash2, rng, createNoise } from '../src/engine/rng.js';

const samples = (fn, n = 4000) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(i));
  return out;
};
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('hash2 is deterministic, in [0,1), seed-sensitive and roughly uniform', () => {
  assert.equal(hash2(3, -7, 5), hash2(3, -7, 5));
  assert.notEqual(hash2(3, -7, 5), hash2(3, -7, 6));
  const v = samples((i) => hash2((i % 64) - 32, Math.floor(i / 64) - 32, 1));
  assert.ok(v.every((x) => x >= 0 && x < 1));
  assert.ok(Math.abs(mean(v) - 0.5) < 0.03);
});

test('rng reproduces the same sequence per seed and differs across seeds', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const sa = samples(() => a(), 20), sb = samples(() => b(), 20), sc = samples(() => c(), 20);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('rng helpers stay in bounds', () => {
  const r = rng(7);
  for (let i = 0; i < 2000; i++) {
    const x = r.range(-3, 5), n = r.int(2, 4);
    assert.ok(x >= -3 && x < 5);
    assert.ok(Number.isInteger(n) && n >= 2 && n <= 4);
  }
  const seen = new Set(samples(() => r.int(1, 3), 500));
  assert.deepEqual([...seen].sort(), [1, 2, 3]); // inclusive ends are reachable
  assert.ok(['a', 'b', 'c'].includes(r.pick(['a', 'b', 'c'])));
  assert.equal(samples(() => r.chance(0), 200).some(Boolean), false);
  assert.equal(samples(() => r.chance(1), 200).every(Boolean), true);
});

test('gauss has mean near 0 and std near 1', () => {
  const r = rng(11);
  const g = samples(() => r.gauss(), 20000);
  const m = mean(g);
  const sd = Math.sqrt(mean(g.map((x) => (x - m) ** 2)));
  assert.ok(Math.abs(m) < 0.05, `mean ${m}`);
  assert.ok(Math.abs(sd - 1) < 0.05, `sd ${sd}`);
});

test('noise is deterministic per seed and differs across seeds', () => {
  const a = createNoise(5), b = createNoise(5), c = createNoise(6);
  assert.equal(a.noise2(1.3, 2.7), b.noise2(1.3, 2.7));
  assert.equal(a.noise3(1.3, 2.7, -4.1), b.noise3(1.3, 2.7, -4.1));
  assert.notEqual(a.noise2(1.3, 2.7), c.noise2(1.3, 2.7));
});

test('noise ranges: noise2/noise3/fbm in -1..1, ridged in 0..1', () => {
  const n = createNoise(9);
  for (let i = 0; i < 3000; i++) {
    const x = (i * 0.137) % 50 - 25, z = (i * 0.291) % 50 - 25, y = (i * 0.071) % 20;
    const v2 = n.noise2(x, z), v3 = n.noise3(x, y, z), f = n.fbm(x, z, 5), r = n.ridged(x, z, 4);
    assert.ok(v2 >= -1 && v2 <= 1 && v3 >= -1 && v3 <= 1 && f >= -1 && f <= 1);
    assert.ok(r >= 0 && r <= 1);
  }
});

test('noise is zero at integer lattice points and varies in between', () => {
  const n = createNoise(3);
  assert.ok(Math.abs(n.noise2(4, -9)) < 1e-9);
  const vals = samples((i) => n.noise2(i * 0.37, i * 0.21), 500);
  assert.ok(Math.max(...vals) > 0.4 && Math.min(...vals) < -0.4, 'noise should use much of its range');
  assert.ok(Math.abs(mean(vals)) < 0.15);
});

test('noise is continuous (tiny step gives tiny change)', () => {
  const n = createNoise(2);
  for (let i = 0; i < 500; i++) {
    const x = i * 0.173, z = i * 0.311;
    assert.ok(Math.abs(n.noise2(x, z) - n.noise2(x + 1e-4, z)) < 5e-3);
    assert.ok(Math.abs(n.noise3(x, 1.5, z) - n.noise3(x + 1e-4, 1.5, z)) < 5e-3);
  }
});

test('noise works for negative and large coordinates', () => {
  const n = createNoise(1);
  for (const [x, z] of [[-1234.5, -987.25], [1e5 + 0.5, -1e5 + 0.25], [-0.0001, 0.0001]]) {
    const v = n.noise2(x, z);
    assert.ok(Number.isFinite(v) && v >= -1 && v <= 1);
  }
});

test('cell noise: f1 <= f2, bounded, id in 0..1, point near the sample', () => {
  const n = createNoise(4);
  for (let i = 0; i < 1000; i++) {
    const x = i * 0.413 - 200, z = i * 0.227 + 50;
    const c = n.cell(x, z);
    assert.ok(c.f1 <= c.f2);
    assert.ok(c.f1 >= 0 && c.f1 < 1.5, `f1 ${c.f1}`);
    assert.ok(c.id >= 0 && c.id < 1);
    assert.ok(Math.abs(Math.hypot(c.px - x, c.pz - z) - c.f1) < 1e-9);
  }
  assert.deepEqual(n.cell(3.3, 4.4), createNoise(4).cell(3.3, 4.4));
});

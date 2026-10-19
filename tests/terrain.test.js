import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeightField, SPAWN_HEIGHT, WORLD_SEED } from '../src/engine/terrain-height.js';
import { Terrain, CHUNK_SIZE, CHUNK_CELLS } from '../src/engine/terrain.js';
import { Player, DEFAULT_TUNE } from '../src/engine/player.js';

const NV = CHUNK_CELLS + 1;
const STEP = CHUNK_SIZE / CHUNK_CELLS;
const DT = 1 / 120;
const none = { forward: false, back: false, left: false, right: false, jump: false };

// --- height field -----------------------------------------------------------

test('height field is deterministic per seed and differs between seeds', () => {
  const a = createHeightField(7), b = createHeightField(7), c = createHeightField(8);
  let differs = false;
  for (let i = 0; i < 200; i++) {
    const x = i * 37.3 - 3000, z = i * -91.7 + 1200;
    assert.equal(a.height(x, z), b.height(x, z));
    if (a.height(x, z) !== c.height(x, z)) differs = true;
  }
  assert.ok(differs);
});

test('heights are finite and bounded over a large area', () => {
  const f = createHeightField(WORLD_SEED);
  for (let i = -40; i <= 40; i++) {
    for (let j = -40; j <= 40; j++) {
      const h = f.height(i * 120, j * 120);
      assert.ok(Number.isFinite(h) && h > -60 && h < 160, `h=${h} at ${i * 120},${j * 120}`);
    }
  }
});

test('spawn area is flat and at SPAWN_HEIGHT', () => {
  const f = createHeightField(WORLD_SEED);
  assert.equal(f.height(0, 0), SPAWN_HEIGHT);
  for (let a = 0; a < 16; a++) {
    const x = Math.cos(a) * 15, z = Math.sin(a) * 15;
    assert.equal(f.height(x, z), SPAWN_HEIGHT);
    assert.ok(f.slope(x, z) < 1e-9);
  }
});

test('terrain is mostly walkable: >= 90% of sampled ground is under the slope limit', () => {
  const f = createHeightField(WORLD_SEED);
  let ok = 0, n = 0;
  for (let i = -100; i <= 100; i++) {
    for (let j = -100; j <= 100; j++) {
      n++;
      if (f.slope(i * 23, j * 23) <= DEFAULT_TUNE.maxSlope) ok++;
    }
  }
  assert.ok(ok / n >= 0.9, `walkable ${(ok / n).toFixed(3)}`);
});

test('normal is unit length and consistent with slope', () => {
  const f = createHeightField(WORLD_SEED);
  for (let i = 0; i < 100; i++) {
    const x = i * 53.1 - 2500, z = i * 29.9 - 1000;
    const [nx, ny, nz] = f.normal(x, z);
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-9);
    assert.ok(ny > 0);
    assert.ok(Math.abs(ny - 1 / Math.sqrt(1 + f.slope(x, z) ** 2)) < 1e-9);
  }
});

// --- chunk streaming --------------------------------------------------------

const makeTerrain = (viewRadius = 2, extra = {}) =>
  new Terrain(createHeightField(WORLD_SEED), { viewRadius, ...extra });

test('loads a full square of chunks around the player', () => {
  const t = makeTerrain(2);
  t.update(10, 10, Infinity);
  assert.equal(t.stats().live, 25);
  assert.equal(t.stats().queued, 0);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) assert.ok(t.getChunk(dx, dz));
});

test('chunk vertices match the height function', () => {
  const f = createHeightField(WORLD_SEED);
  const t = new Terrain(f, { viewRadius: 1 });
  t.update(0, 0, Infinity);
  const ch = t.getChunk(-1, 0);
  const pos = ch.mesh.geometry.attributes.position.array;
  for (const [i, j] of [[0, 0], [5, 9], [NV - 1, NV - 1], [16, 3], [NV - 1, 0]]) {
    const v = (j * NV + i) * 3;
    const wx = -CHUNK_SIZE + i * STEP, wz = j * STEP;
    assert.ok(Math.abs(pos[v + 1] - f.height(wx, wz)) < 1e-3);
  }
});

test('no seams: shared chunk edges have identical heights and normals', () => {
  const t = makeTerrain(1);
  t.update(0, 0, Infinity);
  const check = (A, B, idxA, idxB) => {
    const a = A.mesh.geometry.attributes, b = B.mesh.geometry.attributes;
    for (let k = 0; k < NV; k++) {
      const va = idxA(k) * 3, vb = idxB(k) * 3;
      assert.ok(Math.abs(a.position.array[va + 1] - b.position.array[vb + 1]) < 1e-4, 'height');
      for (let c = 0; c < 3; c++) {
        assert.ok(Math.abs(a.normal.array[va + c] - b.normal.array[vb + c]) < 1e-4, 'normal');
      }
    }
  };
  // east edge of (0,0) == west edge of (1,0)
  check(t.getChunk(0, 0), t.getChunk(1, 0), (k) => k * NV + (NV - 1), (k) => k * NV);
  // south edge of (0,0) == north edge of (0,1)
  check(t.getChunk(0, 0), t.getChunk(0, 1), (k) => (NV - 1) * NV + k, (k) => k);
});

test('mesh normals face up and the triangle winding faces up', () => {
  const t = makeTerrain(1);
  t.update(0, 0, Infinity);
  const g = t.getChunk(0, 0).mesh.geometry;
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, idx = g.index.array;
  for (let v = 0; v < NV * NV; v++) assert.ok(nor[v * 3 + 1] > 0);
  for (let tri = 0; tri < idx.length; tri += 3 * 37) {
    const [a, b, c] = [idx[tri], idx[tri + 1], idx[tri + 2]].map((i) => i * 3);
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2]; // Y component of e1 x e2
    assert.ok(ny > 0, 'triangle faces down');
  }
});

test('walking a long way keeps coverage complete and reuses the pool (flat memory)', () => {
  const R = 3;
  const t = makeTerrain(R);
  t.update(0, 0, Infinity);
  const max = (2 * R + 1) ** 2;
  assert.equal(t.stats().created, max);
  let x = 0, z = 0;
  for (let i = 0; i < 400; i++) {
    x += 11; z -= 7; // diagonal walk through ~100 chunks
    t.update(x, z, Infinity);
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    assert.equal(t.stats().live, max);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) assert.ok(t.getChunk(cx + dx, cz + dz), `hole at ${cx + dx},${cz + dz}`);
  }
  assert.equal(t.stats().created, max, 'pool grew while walking');
  assert.equal(t.group.children.filter((m) => m.visible).length, max);
});

test('building is time-budgeted: at least one chunk per update, nearest first', () => {
  const t = makeTerrain(3);
  assert.equal(t.update(0, 0, 0), 1); // budget 0 still makes progress
  assert.ok(t.getChunk(0, 0), 'the chunk under the player is built first');
  let calls = 1;
  while (t.stats().queued > 0 && calls < 100) { t.update(0, 0, 0); calls++; }
  assert.equal(t.stats().live, 49);
  assert.equal(calls, 49);
});

test('a chunk builds well within the frame budget', () => {
  const times = [];
  const t = makeTerrain(2, { onBuild: (ms) => times.push(ms) });
  t.update(0, 0, Infinity);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  // Budget is 5 ms (src/engine/budgets.js); allow 2x here so slow CI runners do not flake.
  assert.ok(mean < 10, `mean chunk build ${mean.toFixed(2)} ms`);
});

// --- ground collision: height function + slope limit ------------------------

test('walks across real terrain and stays glued to the ground', () => {
  const f = createHeightField(WORLD_SEED);
  const world = { height: f.height, slope: f.slope };
  const p = new Player(0, 4, f.height(0, 4));
  p.yaw = 0.7;
  for (let i = 0; i < 120 * 30; i++) {
    p.step(DT, { ...none, forward: true, jump: i % 400 === 0 }, world);
    assert.ok(Number.isFinite(p.pos.x + p.pos.y + p.pos.z));
    assert.ok(p.pos.y >= f.height(p.pos.x, p.pos.z) - 1e-9, 'sank below ground');
  }
  assert.ok(Math.hypot(p.pos.x, p.pos.z) > 50, 'did not get anywhere');
});

test('slope limit: a 1.5 grade cannot be walked up, a 0.8 grade can', () => {
  const walk = (grade, withSlope) => {
    const world = { height: (x) => grade * Math.max(0, x) };
    if (withSlope) world.slope = () => grade;
    const p = new Player(0, 0, 0);
    p.yaw = -Math.PI / 2; // face +X
    for (let i = 0; i < 120 * 3; i++) p.step(DT, { ...none, forward: true }, world);
    return p.pos.x;
  };
  assert.ok(walk(1.5, true) < 1, 'climbed a too-steep slope');
  assert.ok(walk(0.8, true) > 8, 'blocked on a walkable slope');
  assert.ok(walk(1.5, false) > 8, 'without slope(), only the step rule applies');
});

// Chunked, streamed terrain renderer (three.js). The height numbers come from
// terrain-height.js; this file only turns them into meshes and keeps the right
// set of 48 m chunks alive around the player.
//
// Design notes:
// - Chunks are pooled. When the player moves, chunks that fall out of range are
//   recycled for new positions by rewriting their buffers in place. Nothing is
//   created or disposed while walking, so memory stays flat.
// - Every chunk samples a 1-vertex border beyond its edges, so normals across
//   chunk seams use the same neighbouring heights and match exactly (no seams).
// - Building is time-budgeted per frame; the nearest missing chunks go first.
import * as THREE from 'three';
import { hash2 } from './rng.js';

export const CHUNK_SIZE = 48; // metres
export const CHUNK_CELLS = 32; // quads per side -> 1.5 m resolution
const STEP = CHUNK_SIZE / CHUNK_CELLS;
const NV = CHUNK_CELLS + 1; // vertices per side
const NG = CHUNK_CELLS + 3; // height samples per side, including a 1-sample border

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
// Smooth 0..1 ramp. Works in either direction (a > b gives a falling ramp).
const ramp = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Palette authored in display colours, converted to linear when used.
const PAL = {
  grass: [0.27, 0.43, 0.18],
  dry: [0.45, 0.49, 0.25],
  rock: [0.45, 0.43, 0.4],
  dirt: [0.38, 0.3, 0.21],
  sand: [0.72, 0.66, 0.46],
  snow: [0.93, 0.95, 0.98],
};

// Writes a vertex colour into out[o..o+2] from height, surface normal Y, and
// a 0..1 per-vertex jitter that breaks up flat bands.
function shade(out, o, h, ny, jitter) {
  const hh = h + (jitter - 0.5) * 3; // jitter the thresholds, not the colour only
  let r, g, b;
  // lowland grass -> dry upland grass
  const dryT = ramp(14, 38, hh);
  r = PAL.grass[0] + (PAL.dry[0] - PAL.grass[0]) * dryT;
  g = PAL.grass[1] + (PAL.dry[1] - PAL.grass[1]) * dryT;
  b = PAL.grass[2] + (PAL.dry[2] - PAL.grass[2]) * dryT;
  // low ground: sand
  const sandT = ramp(1.2, -0.8, hh);
  r += (PAL.sand[0] - r) * sandT; g += (PAL.sand[1] - g) * sandT; b += (PAL.sand[2] - b) * sandT;
  // steep: dirt on moderate slopes, rock on steep ones
  const dirtT = ramp(0.93, 0.84, ny) * 0.6;
  r += (PAL.dirt[0] - r) * dirtT; g += (PAL.dirt[1] - g) * dirtT; b += (PAL.dirt[2] - b) * dirtT;
  const rockT = ramp(0.84, 0.66, ny);
  r += (PAL.rock[0] - r) * rockT; g += (PAL.rock[1] - g) * rockT; b += (PAL.rock[2] - b) * rockT;
  // high and not too steep: snow
  const snowT = ramp(44, 56, hh) * ramp(0.62, 0.8, ny);
  r += (PAL.snow[0] - r) * snowT; g += (PAL.snow[1] - g) * snowT; b += (PAL.snow[2] - b) * snowT;
  // brightness variation, then display -> linear (gamma 2 approximation)
  const v = 0.92 + jitter * 0.16;
  out[o] = r * r * v;
  out[o + 1] = g * g * v;
  out[o + 2] = b * b * v;
}

export class Terrain {
  /**
   * @param field   object from createHeightField(): { height(x,z) }
   * @param opts    viewRadius (chunks, default 5), buildBudgetMs (per update, default 3),
   *                onBuild(ms) called after each chunk is built, seed (colour jitter)
   */
  constructor(field, opts = {}) {
    this.field = field;
    this.viewRadius = opts.viewRadius ?? 5;
    this.buildBudgetMs = opts.buildBudgetMs ?? 3;
    this.onBuild = opts.onBuild ?? null;
    this.seed = opts.seed ?? field.seed ?? 0;

    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });

    // One index buffer shared by every chunk (same topology everywhere).
    const idx = new Uint16Array(CHUNK_CELLS * CHUNK_CELLS * 6);
    let k = 0;
    for (let j = 0; j < CHUNK_CELLS; j++) {
      for (let i = 0; i < CHUNK_CELLS; i++) {
        const a = j * NV + i, b = (j + 1) * NV + i, c = a + 1, d = b + 1;
        // counter-clockwise seen from above (+Y)
        idx[k++] = a; idx[k++] = b; idx[k++] = c;
        idx[k++] = c; idx[k++] = b; idx[k++] = d;
      }
    }
    this._index = new THREE.BufferAttribute(idx, 1);

    this._grid = new Float32Array(NG * NG); // scratch height samples
    this.chunks = new Map(); // "cx,cz" -> chunk
    this._free = [];
    this._created = 0;
    this._queue = [];
    this._cx = NaN;
    this._cz = NaN;
  }

  get maxChunks() {
    const n = 2 * this.viewRadius + 1;
    return n * n;
  }

  /** Distance (m) within which terrain is guaranteed to exist in every direction. */
  maxViewDistance() {
    return this.viewRadius * CHUNK_SIZE;
  }

  stats() {
    return { live: this.chunks.size, free: this._free.length, created: this._created, queued: this._queue.length };
  }

  getChunk(cx, cz) {
    return this.chunks.get(`${cx},${cz}`) || null;
  }

  /**
   * Keep the chunks around (px, pz) loaded. Builds the nearest missing chunks
   * until budgetMs is spent (always at least one if any are missing).
   * Returns the number of chunks built.
   */
  update(px, pz, budgetMs = this.buildBudgetMs) {
    const cx = Math.floor(px / CHUNK_SIZE);
    const cz = Math.floor(pz / CHUNK_SIZE);
    if (cx !== this._cx || cz !== this._cz) {
      this._cx = cx;
      this._cz = cz;
      this._retarget(cx, cz);
    }
    let built = 0;
    const t0 = performance.now();
    while (this._queue.length) {
      if (built > 0 && performance.now() - t0 >= budgetMs) break;
      const q = this._queue.shift();
      this._build(q.cx, q.cz);
      built++;
    }
    return built;
  }

  _retarget(cx, cz) {
    const R = this.viewRadius;
    // release chunks that left the square
    for (const [key, ch] of this.chunks) {
      if (Math.abs(ch.cx - cx) > R || Math.abs(ch.cz - cz) > R) {
        ch.mesh.visible = false;
        this._free.push(ch);
        this.chunks.delete(key);
      }
    }
    // queue the missing ones, nearest first
    this._queue.length = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (!this.chunks.has(`${cx + dx},${cz + dz}`)) {
          this._queue.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
        }
      }
    }
    this._queue.sort((a, b) => a.d - b.d);
  }

  _acquire() {
    const ch = this._free.pop();
    if (ch) return ch;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV * NV * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(NV * NV * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NV * NV * 3), 3));
    geo.setIndex(this._index);
    geo.boundingSphere = new THREE.Sphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this._created++;
    return { cx: 0, cz: 0, mesh };
  }

  _build(cx, cz) {
    const t0 = performance.now();
    const ch = this._acquire();
    ch.cx = cx;
    ch.cz = cz;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const { height } = this.field;
    const g = this._grid;

    for (let j = 0; j < NG; j++) {
      const z = oz + (j - 1) * STEP;
      for (let i = 0; i < NG; i++) g[j * NG + i] = height(ox + (i - 1) * STEP, z);
    }

    const geo = ch.mesh.geometry;
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const col = geo.attributes.color.array;
    const inv2s = 1 / (2 * STEP);
    let minY = Infinity, maxY = -Infinity;
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NV; i++) {
        const gi = (j + 1) * NG + (i + 1);
        const h = g[gi];
        const dx = (g[gi + 1] - g[gi - 1]) * inv2s;
        const dz = (g[gi + NG] - g[gi - NG]) * inv2s;
        const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
        const v = (j * NV + i) * 3;
        pos[v] = i * STEP; pos[v + 1] = h; pos[v + 2] = j * STEP;
        nor[v] = -dx * inv; nor[v + 1] = inv; nor[v + 2] = -dz * inv;
        shade(col, v, h, inv, hash2(cx * CHUNK_CELLS + i, cz * CHUNK_CELLS + j, this.seed));
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    const half = CHUNK_SIZE / 2, hy = (maxY - minY) / 2;
    geo.boundingSphere.center.set(half, (minY + maxY) / 2, half);
    geo.boundingSphere.radius = Math.sqrt(half * half * 2 + hy * hy);

    ch.mesh.position.set(ox, 0, oz);
    ch.mesh.updateMatrix();
    ch.mesh.visible = true;
    this.chunks.set(`${cx},${cz}`, ch);
    if (this.onBuild) this.onBuild(performance.now() - t0);
  }

  dispose() {
    for (const m of this.group.children) m.geometry.dispose();
    this.material.dispose();
    this.chunks.clear();
    this._free.length = 0;
    this._queue.length = 0;
  }
}

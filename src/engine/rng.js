// Deterministic randomness and noise. Pure functions, no globals, no Math.random:
// the same seed always gives the same world on every machine.

// 32-bit integer hash of three ints + seed. Returns an unsigned 32-bit int.
function hashInt(a, b, c, seed) {
  let h = Math.imul((a | 0) ^ (seed | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (c | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return h >>> 0;
}

const INV_2_32 = 1 / 4294967296;

/** Hash of a 2D integer cell to 0..1. */
export function hash2(ix, iz, seed = 0) {
  return hashInt(ix, iz, 0x9e3779b9, seed) * INV_2_32;
}

/** Seeded generator (mulberry32) with helpers. r() -> [0,1). */
export function rng(seed = 1) {
  let s = (seed | 0) ^ 0x6d2b79f5;
  const r = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) * INV_2_32;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1)); // inclusive
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.gauss = () => {
    // Box-Muller; 1 - r() keeps the log argument in (0, 1].
    return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  };
  return r;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

// 12 edge-midpoint gradients for 3D (classic Perlin set).
const G3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

/** Build a noise toolkit for a seed. */
export function createNoise(seed = 1) {
  // 2D gradient noise, output clamped to -1..1.
  function noise2(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = x - x0, fz = z - z0;
    const g = (ix, iz, dx, dz) => {
      const a = hashInt(ix, iz, 1, seed) * INV_2_32 * Math.PI * 2;
      return Math.cos(a) * dx + Math.sin(a) * dz;
    };
    const u = fade(fx), v = fade(fz);
    const n =
      lerp(
        lerp(g(x0, z0, fx, fz), g(x0 + 1, z0, fx - 1, fz), u),
        lerp(g(x0, z0 + 1, fx, fz - 1), g(x0 + 1, z0 + 1, fx - 1, fz - 1), u),
        v,
      ) * 1.4142; // Perlin 2D peaks at ~0.707
    return n > 1 ? 1 : n < -1 ? -1 : n;
  }

  // 3D gradient noise, output clamped to -1..1.
  function noise3(x, y, z) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = x - x0, fy = y - y0, fz = z - z0;
    const g = (ix, iy, iz, dx, dy, dz) => {
      const gr = G3[hashInt(ix, iy, iz, seed) % 12];
      return gr[0] * dx + gr[1] * dy + gr[2] * dz;
    };
    const u = fade(fx), v = fade(fy), w = fade(fz);
    const x1 = fx - 1, y1 = fy - 1, z1 = fz - 1;
    const n =
      lerp(
        lerp(
          lerp(g(x0, y0, z0, fx, fy, fz), g(x0 + 1, y0, z0, x1, fy, fz), u),
          lerp(g(x0, y0 + 1, z0, fx, y1, fz), g(x0 + 1, y0 + 1, z0, x1, y1, fz), u),
          v,
        ),
        lerp(
          lerp(g(x0, y0, z0 + 1, fx, fy, z1), g(x0 + 1, y0, z0 + 1, x1, fy, z1), u),
          lerp(g(x0, y0 + 1, z0 + 1, fx, y1, z1), g(x0 + 1, y0 + 1, z0 + 1, x1, y1, z1), u),
          v,
        ),
        w,
      ); // raw peak measured at 0.9985 over 4.5M samples; the clamp below is only a safety net
    return n > 1 ? 1 : n < -1 ? -1 : n;
  }

  // Fractal Brownian motion, normalised by total amplitude: ~ -1..1.
  function fbm(x, z, oct = 4, lac = 2, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < oct; i++) {
      sum += noise2(x * f + i * 17.3, z * f - i * 9.1) * amp;
      norm += amp;
      amp *= gain;
      f *= lac;
    }
    return sum / norm;
  }

  // Ridged multifractal: sharp crests, 0..1.
  function ridged(x, z, oct = 4) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(noise2(x * f + i * 31.7, z * f + i * 13.9));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  // Cellular (Worley) noise on a unit grid: nearest and second-nearest feature
  // point distances, the nearest cell's id (0..1) and its point position.
  function cell(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    let f1 = Infinity, f2 = Infinity, id = 0, px = 0, pz = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const ix = cx + i, iz = cz + j;
        const fx = ix + hashInt(ix, iz, 2, seed) * INV_2_32;
        const fz = iz + hashInt(ix, iz, 3, seed) * INV_2_32;
        const d = Math.hypot(fx - x, fz - z);
        if (d < f1) {
          f2 = f1; f1 = d;
          id = hashInt(ix, iz, 4, seed) * INV_2_32;
          px = fx; pz = fz;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return { f1, f2, id, px, pz };
  }

  return { noise2, noise3, fbm, ridged, cell };
}

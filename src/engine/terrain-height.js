// Terrain height field. Pure functions (no three.js, no DOM): the renderer, the
// player physics and the tests all read the same numbers, so what you see is
// what you stand on. Deterministic from a seed (see rng.js).
//
// Y is up, 1 unit = 1 metre.
import { createNoise } from './rng.js';

export const WORLD_SEED = 1337;
export const SPAWN_HEIGHT = 3;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const TERRAIN_DEFAULTS = Object.freeze({
  continentalAmp: 14, // broad lowlands / basins
  hillAmp: 9, // rolling hills on top
  mountainAmp: 80, // ridged ranges, only where the mountain mask is on
  spawnFlatRadius: 18, // fully flat disc around the origin...
  spawnBlendRadius: 70, // ...blending back to natural terrain by here
});

/**
 * Build a height field for a seed.
 * Returns { height(x,z), slope(x,z), normal(x,z) }.
 * slope is the gradient magnitude (rise over run; 1 = 45 degrees).
 */
export function createHeightField(seed = WORLD_SEED, opts = {}) {
  const c = { ...TERRAIN_DEFAULTS, ...opts };
  const noise = createNoise(seed);
  const maskNoise = createNoise(seed ^ 0x5bd1e995);

  function natural(x, z) {
    const continental = noise.fbm(x * 0.0012, z * 0.0012, 3);
    const hills = noise.fbm(x * 0.006 + 40, z * 0.006 - 40, 5);
    let h = continental * c.continentalAmp + hills * c.hillAmp;
    // Where mountains exist at all: a slow field, switched on smoothly. The
    // expensive ridged noise only runs where the mask is on (most of the map).
    const mask = smooth(0.0, 0.4, maskNoise.fbm(x * 0.0007, z * 0.0007, 2));
    if (mask > 0) {
      // ridged() is 0..1 with a mean near 0.5; centre it so valleys stay low.
      const ridge = Math.max(0, noise.ridged(x * 0.0028 + 500, z * 0.0028 - 500, 5) - 0.42) / 0.58;
      h += mask * Math.pow(ridge, 1.4) * c.mountainAmp;
    }
    return h;
  }

  function height(x, z) {
    const r = Math.hypot(x, z);
    const k = smooth(c.spawnFlatRadius, c.spawnBlendRadius, r); // 0 at spawn, 1 far away
    if (k <= 0) return SPAWN_HEIGHT;
    return SPAWN_HEIGHT + (natural(x, z) - SPAWN_HEIGHT) * k;
  }

  const E = 0.75; // finite-difference offset in metres
  function slope(x, z) {
    const dx = (height(x + E, z) - height(x - E, z)) / (2 * E);
    const dz = (height(x, z + E) - height(x, z - E)) / (2 * E);
    return Math.hypot(dx, dz);
  }

  // Unit surface normal as [x, y, z].
  function normal(x, z) {
    const dx = (height(x + E, z) - height(x - E, z)) / (2 * E);
    const dz = (height(x, z + E) - height(x, z - E)) / (2 * E);
    const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    return [-dx * inv, inv, -dz * inv];
  }

  return { height, slope, normal, seed };
}

// Performance budgets (see docs/PERFORMANCE.md). Single source of truth for the
// overlay colouring and the headless smoke test.
export const BUDGETS = Object.freeze({
  fps: 60,
  frameMs: 16.7,
  drawCalls: 300,
  triangles: 1_500_000,
  chunkBuildMs: 5,
});

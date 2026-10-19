# Performance budgets

Measured continuously, not discovered at the end. Values live in
`src/engine/budgets.js`.

| Metric | Budget |
|---|---|
| Frame rate | 60 fps (16.7 ms) on a mid-range GPU |
| Draw calls | <= 300 |
| Triangles in view | <= 1.5 M |
| Chunk build | <= 5 ms each |

## Overlay

Press **F3** in the game. It shows fps, frame time (mean and worst of the last
120 frames), draw calls, triangles, and any metric systems report. A trailing
`!` means a budget is exceeded.

Systems report with `perf.record('chunkBuildMs', ms)` for timed work and
`perf.setCounter('creatures', n)` for counts.

## In CI

`npm run smoke` loads the build headlessly and logs the stats snapshot. Draw
calls and triangles are enforced (hardware independent). Frame time is only
logged, because software rendering is not representative.

import { BUDGETS } from './budgets.js';
import { RollingStats } from './perf-stats.js';

// Stats overlay. Toggle with the backtick key (`). Other systems report through:
//   perf.record('chunkBuildMs', ms)   timed work (rolling mean/max)
//   perf.setCounter('creatures', n)   plain counters
// Backtick, not a function key: many laptops use F-keys for brightness/volume.
const TOGGLE_CODE = 'Backquote';

export class Perf {
  constructor(renderer) {
    this.renderer = renderer;
    this.frames = new RollingStats(120);
    this.metrics = new Map();
    this.counters = new Map();
    this.last = 0;
    this.lastDraw = 0;
    this.info = { drawCalls: 0, triangles: 0 };

    this.el = document.createElement('pre');
    Object.assign(this.el.style, {
      position: 'fixed', top: '8px', left: '8px', margin: '0', padding: '6px 8px',
      font: '12px/1.35 monospace', color: '#cfe8cf', background: 'rgba(0,0,0,0.6)',
      borderRadius: '4px', pointerEvents: 'none', display: 'none', zIndex: '10',
      whiteSpace: 'pre',
    });
    document.body.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === TOGGLE_CODE) {
        e.preventDefault();
        this.el.style.display = this.el.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  // Call once per frame, before rendering.
  tick(now = performance.now()) {
    if (this.last) this.frames.push(now - this.last);
    this.last = now;
  }

  // Call right after rendering, while renderer.info still holds this frame.
  sampleRenderer() {
    const r = this.renderer.info.render;
    this.info.drawCalls = r.calls;
    this.info.triangles = r.triangles;
    const now = performance.now();
    if (now - this.lastDraw > 250 && this.el.style.display !== 'none') {
      this.lastDraw = now;
      this.draw();
    }
  }

  record(name, ms) {
    let s = this.metrics.get(name);
    if (!s) this.metrics.set(name, (s = new RollingStats(60)));
    s.push(ms);
  }

  setCounter(name, value) {
    this.counters.set(name, value);
  }

  snapshot() {
    const frameMs = this.frames.mean();
    const out = {
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMsMean: frameMs,
      frameMsMax: this.frames.max(),
      drawCalls: this.info.drawCalls,
      triangles: this.info.triangles,
      metrics: {},
      counters: Object.fromEntries(this.counters),
    };
    for (const [k, s] of this.metrics) out.metrics[k] = { mean: s.mean(), max: s.max() };
    return out;
  }

  draw() {
    const s = this.snapshot();
    const flag = (bad) => (bad ? ' !' : '');
    const lines = [
      `fps ${s.fps.toFixed(0)}${flag(s.fps < BUDGETS.fps * 0.9)}`,
      `frame ${s.frameMsMean.toFixed(1)} ms (max ${s.frameMsMax.toFixed(1)})${flag(s.frameMsMean > BUDGETS.frameMs)}`,
      `draws ${s.drawCalls}/${BUDGETS.drawCalls}${flag(s.drawCalls > BUDGETS.drawCalls)}`,
      `tris  ${s.triangles.toLocaleString()}/${BUDGETS.triangles.toLocaleString()}${flag(s.triangles > BUDGETS.triangles)}`,
    ];
    for (const [k, m] of Object.entries(s.metrics)) {
      const budget = BUDGETS[k];
      lines.push(`${k} ${m.mean.toFixed(2)} (max ${m.max.toFixed(2)})${budget ? ' /' + budget : ''}${flag(budget && m.mean > budget)}`);
    }
    for (const [k, v] of Object.entries(s.counters)) lines.push(`${k} ${v}`);
    this.el.textContent = lines.join('\n');
  }
}

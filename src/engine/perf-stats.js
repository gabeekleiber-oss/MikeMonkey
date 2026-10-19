// Fixed-size rolling window of samples. Pure logic (no DOM), unit tested.
export class RollingStats {
  constructor(size = 120) {
    this.size = size;
    this.buf = new Float64Array(size);
    this.n = 0; // samples stored (<= size)
    this.i = 0; // next write index
  }
  push(v) {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.size;
    if (this.n < this.size) this.n++;
  }
  mean() {
    if (this.n === 0) return 0;
    let s = 0;
    for (let k = 0; k < this.n; k++) s += this.buf[k];
    return s / this.n;
  }
  max() {
    if (this.n === 0) return 0;
    let m = -Infinity;
    for (let k = 0; k < this.n; k++) if (this.buf[k] > m) m = this.buf[k];
    return m;
  }
}

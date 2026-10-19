// Keyboard, mouse look and pointer lock. Movement keys only count while the
// pointer is locked, so typing elsewhere never moves the player.
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

export class Input {
  constructor(canvas, { sensitivity = 0.0022 } = {}) {
    this.canvas = canvas;
    this.sensitivity = sensitivity;
    this.keys = new Set();
    this.locked = false;
    this.dx = 0;
    this.dy = 0;
    this.onLockChange = () => {};

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
      this.onLockChange(this.locked);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.locked || !MOVE_KEYS.has(e.code)) return;
      e.preventDefault(); // stop Space from scrolling the page
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Some browsers emit one huge bogus delta when the lock engages: ignore it.
      if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {}); // user cancelled / browser cooldown
    } catch {
      /* ignored: the overlay stays up so the player can click again */
    }
  }

  /** Mouse movement since the last call, in pixels. */
  consumeLook() {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  get state() {
    const k = this.keys;
    return {
      forward: k.has('KeyW'),
      back: k.has('KeyS'),
      left: k.has('KeyA'),
      right: k.has('KeyD'),
      jump: k.has('Space'),
    };
  }
}

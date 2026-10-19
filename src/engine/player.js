// Player movement physics. Pure logic (no DOM, no three.js) so it is unit tested.
// Y is up, 1 unit = 1 metre. yaw 0 faces -Z; positive yaw turns left.

export const PLAYER = Object.freeze({ radius: 0.4, height: 1.8, eye: 1.65, stepUp: 0.75 });

export const DEFAULT_TUNE = Object.freeze({
  moveSpeed: 8,
  jumpSpeed: 9.5, // apex ~1.88 m with gravity 24
  gravity: 24,
  groundAccel: 60,
  groundDecel: 50,
  airAccel: 18,
  maxSlope: 1.2, // grade (rise/run, 1 = 45 deg) above which you cannot walk uphill
});

export class Player {
  constructor(x = 0, z = 0, y = 0) {
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.tune = { ...DEFAULT_TUNE };
  }

  get eyeY() {
    return this.pos.y + PLAYER.eye;
  }

  // Tallest ground under the feet footprint (centre + 4 points on the radius).
  // Used to decide whether a move runs into a wall.
  footprintHeight(world, x, z) {
    const r = PLAYER.radius;
    return Math.max(
      world.height(x, z),
      world.height(x + r, z),
      world.height(x - r, z),
      world.height(x, z + r),
      world.height(x, z - r),
    );
  }

  /**
   * Advance by dt seconds.
   * input: { forward, back, left, right, jump } booleans
   * world: { height(x, z), slope?(x, z) } ground height (and optional grade) functions
   */
  step(dt, input, world) {
    const t = this.tune;
    const { pos, vel } = this;

    // --- desired horizontal velocity from keys, relative to yaw
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const len = Math.hypot(ix, iz);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let tx = 0, tz = 0;
    if (len > 0) {
      const nx = ix / len, nz = iz / len; // diagonals are not faster
      tx = (-s * nz + c * nx) * t.moveSpeed;
      tz = (-c * nz - s * nx) * t.moveSpeed;
    }

    // --- accelerate toward it
    const accel = this.onGround ? (len > 0 ? t.groundAccel : t.groundDecel) : t.airAccel;
    const dvx = tx - vel.x, dvz = tz - vel.z;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dv <= maxDv) {
      vel.x = tx;
      vel.z = tz;
    } else {
      vel.x += (dvx / dv) * maxDv;
      vel.z += (dvz / dv) * maxDv;
    }

    // --- horizontal move, one axis at a time so you slide along walls.
    // A move is blocked if the ground ahead is more than stepUp above the feet,
    // or if it climbs onto ground steeper than maxSlope (only when the world
    // provides slope(x, z); jumping over such ground is still possible).
    const blocked = (x, z) => {
      const gh = this.footprintHeight(world, x, z);
      if (gh - pos.y > PLAYER.stepUp) return true;
      return !!world.slope && gh > pos.y + 0.01 && world.slope(x, z) > t.maxSlope;
    };
    const nxp = pos.x + vel.x * dt;
    if (!blocked(nxp, pos.z)) pos.x = nxp;
    else vel.x = 0;
    const nzp = pos.z + vel.z * dt;
    if (!blocked(pos.x, nzp)) pos.z = nzp;
    else vel.z = 0;

    // --- vertical
    const wasGround = this.onGround;
    if (input.jump && wasGround) {
      vel.y = t.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) vel.y -= t.gravity * dt;
    pos.y += vel.y * dt;

    const ground = world.height(pos.x, pos.z);
    if (vel.y <= 0 && (pos.y <= ground || (wasGround && pos.y - ground <= PLAYER.stepUp))) {
      // landed, or walked up/down a step: stay glued to the ground
      pos.y = ground;
      vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}

// Runs fixed-size simulation steps from variable frame times.
export class FixedStepper {
  constructor(stepSec = 1 / 120, maxStepsPerFrame = 8) {
    this.step = stepSec;
    this.max = maxStepsPerFrame;
    this.acc = 0;
  }
  advance(frameDt, fn) {
    this.acc += frameDt;
    let n = 0;
    while (this.acc >= this.step && n < this.max) {
      fn(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n === this.max) this.acc = 0; // too far behind: drop time instead of spiralling
    return n;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, FixedStepper, PLAYER, DEFAULT_TUNE } from '../src/engine/player.js';

const DT = 1 / 120;
const flat = { height: () => 0 };
const none = { forward: false, back: false, left: false, right: false, jump: false };
const run = (p, secs, input, world = flat) => {
  for (let i = 0; i < Math.round(secs / DT); i++) p.step(DT, input, world);
};
const speed = (p) => Math.hypot(p.vel.x, p.vel.z);

test('falls and lands on flat ground', () => {
  const p = new Player(0, 0, 5);
  run(p, 2, none);
  assert.equal(p.pos.y, 0);
  assert.equal(p.onGround, true);
});

test('forward moves toward -Z at yaw 0; right moves toward +X', () => {
  const p = new Player();
  run(p, 0.5, none);
  run(p, 0.5, { ...none, forward: true });
  assert.ok(p.pos.z < -2 && Math.abs(p.pos.x) < 1e-9);
  const q = new Player();
  run(q, 0.2, none);
  run(q, 0.5, { ...none, right: true });
  assert.ok(q.pos.x > 2 && Math.abs(q.pos.z) < 1e-9);
});

test('yaw rotates the movement direction (yaw 90deg: forward goes toward -X)', () => {
  const p = new Player();
  p.yaw = Math.PI / 2;
  run(p, 0.2, none);
  run(p, 0.5, { ...none, forward: true });
  assert.ok(p.pos.x < -2 && Math.abs(p.pos.z) < 1e-6);
});

test('top speed is moveSpeed, and diagonals are not faster', () => {
  const a = new Player(); run(a, 0.2, none); run(a, 2, { ...none, forward: true });
  const b = new Player(); run(b, 0.2, none); run(b, 2, { ...none, forward: true, right: true });
  assert.ok(Math.abs(speed(a) - DEFAULT_TUNE.moveSpeed) < 1e-6);
  assert.ok(Math.abs(speed(b) - DEFAULT_TUNE.moveSpeed) < 1e-6);
});

test('stops when keys are released', () => {
  const p = new Player(); run(p, 0.2, none); run(p, 1, { ...none, forward: true });
  run(p, 1, none);
  assert.ok(speed(p) < 1e-9);
});

test('jump apex is about 1.9 m and the player lands again', () => {
  const p = new Player(); run(p, 0.2, none);
  let apex = 0;
  p.step(DT, { ...none, jump: true }, flat);
  for (let i = 0; i < 400; i++) { p.step(DT, none, flat); apex = Math.max(apex, p.pos.y); }
  assert.ok(apex > 1.8 && apex < 1.95, `apex ${apex}`);
  assert.equal(p.onGround, true);
  assert.equal(p.pos.y, 0);
});

test('cannot jump in mid-air', () => {
  const p = new Player(0, 0, 3); // starts airborne
  p.step(DT, { ...none, jump: true }, flat);
  assert.ok(p.vel.y <= 0);
});

test('can walk up a 0.5 m step', () => {
  const world = { height: (x) => (x >= 2 ? 0.5 : 0) };
  const p = new Player(0, 0, 0); p.yaw = -Math.PI / 2; // face +X
  run(p, 0.2, none, world);
  run(p, 1.5, { ...none, forward: true }, world);
  assert.ok(p.pos.x > 2.5);
  assert.equal(p.pos.y, 0.5);
});

test('a 1 m wall blocks walking', () => {
  const world = { height: (x) => (x >= 2 ? 1 : 0) };
  const p = new Player(0, 0, 0); p.yaw = -Math.PI / 2;
  run(p, 0.2, none, world);
  run(p, 2, { ...none, forward: true }, world);
  assert.ok(p.pos.x < 2, `x ${p.pos.x}`);
  assert.equal(p.pos.y, 0);
});

test('a 1.2 m block can be jumped onto', () => {
  const world = { height: (x) => (x >= 2 ? 1.2 : 0) };
  const p = new Player(0, 0, 0); p.yaw = -Math.PI / 2;
  run(p, 0.2, none, world);
  run(p, 0.6, { ...none, forward: true }, world);
  let landedOn = false;
  for (let i = 0; i < 480 && !landedOn; i++) {
    p.step(DT, { ...none, forward: true, jump: p.onGround && p.pos.x > 1.2 && p.pos.y === 0 }, world);
    landedOn = p.onGround && p.pos.y === 1.2;
  }
  assert.ok(landedOn, `never got on top: x=${p.pos.x} y=${p.pos.y}`);
});

test('slides along a wall instead of sticking', () => {
  const world = { height: (x) => (x >= 2 ? 3 : 0) };
  const p = new Player(0, 0, 0); p.yaw = -Math.PI / 4; // forward = +X and -Z
  run(p, 0.2, none, world);
  run(p, 2, { ...none, forward: true }, world);
  assert.ok(p.pos.x < 2);
  assert.ok(p.pos.z < -3, `z ${p.pos.z}`); // kept moving along the wall
});

test('walking off a big drop makes the player fall', () => {
  const world = { height: (x) => (x < 2 ? 3 : 0) };
  const p = new Player(0, 0, 3); p.yaw = -Math.PI / 2;
  run(p, 0.2, none, world);
  let airborne = false;
  for (let i = 0; i < 360; i++) {
    p.step(DT, { ...none, forward: true }, world);
    if (!p.onGround) airborne = true;
  }
  assert.ok(airborne);
  assert.equal(p.pos.y, 0);
});

test('physics is identical however frames are sliced (fixed timestep)', () => {
  const sim = (frames) => {
    const p = new Player(); const st = new FixedStepper(1 / 120);
    for (const f of frames) st.advance(f, (h) => p.step(h, { ...none, forward: true, jump: false }, flat));
    return p.pos.z;
  };
  const a = sim(Array(120).fill(1 / 60));          // 60 fps for 2 s
  const b = sim(Array(240).fill(1 / 120));         // 120 fps for 2 s
  const c = sim(Array(60).fill(1 / 30));           // 30 fps for 2 s
  assert.ok(Math.abs(a - b) < 0.01 && Math.abs(a - c) < 0.01, `${a} ${b} ${c}`);
});

test('FixedStepper drops time after a huge stall instead of spiralling', () => {
  const st = new FixedStepper(1 / 120, 8);
  let calls = 0;
  st.advance(5, () => calls++);
  assert.equal(calls, 8);
  assert.equal(st.advance(0, () => calls++), 0);
});

test('player dimensions match the spec', () => {
  assert.equal(PLAYER.radius, 0.4);
  assert.equal(PLAYER.height, 1.8);
  assert.equal(PLAYER.eye, 1.65);
  assert.equal(PLAYER.stepUp, 0.75);
});

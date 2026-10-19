import * as THREE from 'three';
import { Perf } from './engine/perf.js';
import { Input } from './engine/input.js';
import { Player, FixedStepper, PLAYER } from './engine/player.js';
import { height, buildCourse } from './game/testcourse.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0x87a7c9;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 80, 300);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.rotation.order = 'YXZ'; // yaw first, then pitch: no roll when looking around

// Ground with a checker texture so movement is visible. It follows the player,
// snapped to the texture period so the pattern never appears to slide.
const TILE = 2;
const checker = document.createElement('canvas');
checker.width = checker.height = 64;
const cx = checker.getContext('2d');
cx.fillStyle = '#4b6b3a'; cx.fillRect(0, 0, 64, 64);
cx.fillStyle = '#56784a'; cx.fillRect(0, 0, 32, 32); cx.fillRect(32, 32, 32, 32);
const tex = new THREE.CanvasTexture(checker);
tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
tex.repeat.set(400 / TILE, 400 / TILE);
tex.magFilter = THREE.NearestFilter;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ map: tex }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(buildCourse());

scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3b4a2a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.4);
sun.position.set(30, 60, 20);
scene.add(sun);

// --- player and input
const world = { height };
const player = new Player(0, 4, 0);
const input = new Input(renderer.domElement);
const stepper = new FixedStepper(1 / 120);
const MAX_PITCH = Math.PI / 2 - 0.01;

// --- click-to-enter overlay
const overlay = document.createElement('div');
Object.assign(overlay.style, {
  position: 'fixed', inset: '0', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer',
  background: 'rgba(0,0,0,0.55)', color: '#fff', font: '20px system-ui, sans-serif',
  zIndex: '20', userSelect: 'none',
});
overlay.innerHTML =
  '<div style="font-size:34px;font-weight:600">Click to enter</div>' +
  '<div style="opacity:.8;font-size:15px">WASD move · Space jump · mouse look · Esc to release · ` stats</div>';
document.body.appendChild(overlay);
overlay.addEventListener('click', () => input.requestLock());
input.onLockChange = (locked) => {
  overlay.style.display = locked ? 'none' : 'flex';
};

// Small dot crosshair so aiming is possible from the start.
const dot = document.createElement('div');
Object.assign(dot.style, {
  position: 'fixed', left: '50%', top: '50%', width: '4px', height: '4px',
  margin: '-2px 0 0 -2px', borderRadius: '50%', background: 'rgba(255,255,255,0.85)',
  pointerEvents: 'none', zIndex: '5',
});
document.body.appendChild(dot);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const perf = new Perf(renderer);
// Test/debug hook: the smoke test reads these.
window.__mm = { frames: 0, stats: () => perf.snapshot(), player };

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1); // clamp after tab switches
  last = now;
  perf.tick(now);

  // look
  const { dx, dy } = input.consumeLook();
  player.yaw -= dx * input.sensitivity;
  player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch - dy * input.sensitivity));

  // simulate in fixed steps
  const keys = input.state;
  stepper.advance(dt, (h) => player.step(h, keys, world));

  // camera at eye height
  camera.position.set(player.pos.x, player.pos.y + PLAYER.eye, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  ground.position.set(Math.round(player.pos.x / TILE) * TILE, 0, Math.round(player.pos.z / TILE) * TILE);

  renderer.render(scene, camera);
  perf.sampleRenderer();
  window.__mm.frames++;
});

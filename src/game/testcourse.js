import * as THREE from 'three';

// TEMPORARY test course for the controller (#3). Replaced by real terrain in #4.
// Height function and meshes come from the same box list so they always agree.
const BOXES = [
  { x: [6, 9], z: [-4, 4], h: 0.5, note: 'walkable step' },
  { x: [12, 15], z: [-4, 4], h: 1.2, note: 'too tall to walk up, jump onto it' },
  { x: [18, 21], z: [-4, 4], h: 2.4, note: 'wall: needs the stairs' },
  // stairs going toward -X, each 0.5 m higher
  ...[1, 2, 3, 4, 5].map((i) => ({ x: [-2 * i - 2, -2 * i], z: [-3, 3], h: i * 0.5, note: 'stair' })),
];

export function height(x, z) {
  let h = 0;
  for (const b of BOXES) {
    if (x >= b.x[0] && x <= b.x[1] && z >= b.z[0] && z <= b.z[1] && b.h > h) h = b.h;
  }
  return h;
}

export function buildCourse() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.9 });
  for (const b of BOXES) {
    const sx = b.x[1] - b.x[0], sz = b.z[1] - b.z[0];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, b.h, sz), mat);
    mesh.position.set((b.x[0] + b.x[1]) / 2, b.h / 2, (b.z[0] + b.z[1]) / 2);
    group.add(mesh);
  }
  return group;
}

// Simple voxel-style meshes for the world and the built-in characters.
import * as THREE from 'three';

const matCache = new Map();
export function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }
  return matCache.get(color);
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** Adds a box of size (w,h,d) whose bottom-center is at (x,y,z). */
export function box(parent, w, h, d, x, y, z, color, { shadow = true } = {}) {
  const m = new THREE.Mesh(boxGeo, typeof color === 'number' ? mat(color) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- characters
// Every character faces +Z and stands on y = 0, roughly 0.8 units tall.

function chicken() {
  const g = new THREE.Group();
  box(g, 0.55, 0.5, 0.55, 0, 0.1, 0, 0xffffff);
  box(g, 0.45, 0.35, 0.4, 0, 0.6, 0.05, 0xffffff);
  box(g, 0.12, 0.18, 0.12, 0, 0.95, 0.05, 0xe53935); // comb
  box(g, 0.14, 0.1, 0.14, 0, 0.7, 0.32, 0xffa000); // beak
  box(g, 0.1, 0.12, 0.06, 0, 0.55, 0.28, 0xe53935); // wattle
  box(g, 0.06, 0.06, 0.02, 0.15, 0.78, 0.26, 0x111111);
  box(g, 0.06, 0.06, 0.02, -0.15, 0.78, 0.26, 0x111111);
  box(g, 0.08, 0.3, 0.3, 0.31, 0.25, -0.02, 0xf0f0f0); // wings
  box(g, 0.08, 0.3, 0.3, -0.31, 0.25, -0.02, 0xf0f0f0);
  box(g, 0.25, 0.25, 0.1, 0, 0.35, -0.32, 0xf5f5f5); // tail
  box(g, 0.06, 0.12, 0.06, 0.12, 0, 0.02, 0xffa000);
  box(g, 0.06, 0.12, 0.06, -0.12, 0, 0.02, 0xffa000);
  return g;
}

function frog() {
  const g = new THREE.Group();
  box(g, 0.6, 0.35, 0.6, 0, 0.08, 0, 0x43a047);
  box(g, 0.5, 0.18, 0.2, 0, 0.12, 0.3, 0xc5e1a5); // belly/mouth
  box(g, 0.18, 0.18, 0.18, 0.18, 0.42, 0.18, 0x43a047);
  box(g, 0.18, 0.18, 0.18, -0.18, 0.42, 0.18, 0x43a047);
  box(g, 0.1, 0.1, 0.04, 0.18, 0.46, 0.28, 0xffffff);
  box(g, 0.1, 0.1, 0.04, -0.18, 0.46, 0.28, 0xffffff);
  box(g, 0.05, 0.05, 0.02, 0.18, 0.48, 0.3, 0x111111);
  box(g, 0.05, 0.05, 0.02, -0.18, 0.48, 0.3, 0x111111);
  box(g, 0.2, 0.1, 0.35, 0.33, 0, -0.1, 0x2e7d32);
  box(g, 0.2, 0.1, 0.35, -0.33, 0, -0.1, 0x2e7d32);
  return g;
}

function robot() {
  const g = new THREE.Group();
  box(g, 0.12, 0.25, 0.12, 0.13, 0, 0, 0x607d8b);
  box(g, 0.12, 0.25, 0.12, -0.13, 0, 0, 0x607d8b);
  box(g, 0.5, 0.35, 0.35, 0, 0.25, 0, 0x90a4ae);
  box(g, 0.2, 0.12, 0.02, 0, 0.36, 0.18, 0x00e5ff);
  box(g, 0.1, 0.3, 0.1, 0.3, 0.28, 0, 0x78909c);
  box(g, 0.1, 0.3, 0.1, -0.3, 0.28, 0, 0x78909c);
  box(g, 0.4, 0.28, 0.32, 0, 0.6, 0, 0xb0bec5);
  box(g, 0.3, 0.08, 0.02, 0, 0.72, 0.17, 0xff1744); // visor
  box(g, 0.03, 0.15, 0.03, 0, 0.88, 0, 0x455a64);
  box(g, 0.07, 0.07, 0.07, 0, 1.0, 0, 0xffeb3b);
  return g;
}

function penguin() {
  const g = new THREE.Group();
  box(g, 0.5, 0.7, 0.45, 0, 0.06, 0, 0x263238);
  box(g, 0.36, 0.5, 0.06, 0, 0.1, 0.21, 0xffffff);
  box(g, 0.14, 0.08, 0.14, 0, 0.55, 0.28, 0xffa000);
  box(g, 0.06, 0.06, 0.02, 0.1, 0.65, 0.23, 0xffffff);
  box(g, 0.06, 0.06, 0.02, -0.1, 0.65, 0.23, 0xffffff);
  box(g, 0.06, 0.35, 0.25, 0.28, 0.2, 0, 0x37474f);
  box(g, 0.06, 0.35, 0.25, -0.28, 0.2, 0, 0x37474f);
  box(g, 0.15, 0.06, 0.2, 0.12, 0, 0.05, 0xffa000);
  box(g, 0.15, 0.06, 0.2, -0.12, 0, 0.05, 0xffa000);
  return g;
}

function pig() {
  const g = new THREE.Group();
  box(g, 0.55, 0.42, 0.65, 0, 0.15, 0, 0xf8bbd0);
  box(g, 0.22, 0.14, 0.06, 0, 0.3, 0.34, 0xf48fb1); // snout
  box(g, 0.04, 0.05, 0.02, 0.05, 0.34, 0.37, 0x880e4f);
  box(g, 0.04, 0.05, 0.02, -0.05, 0.34, 0.37, 0x880e4f);
  box(g, 0.06, 0.06, 0.02, 0.15, 0.47, 0.33, 0x111111);
  box(g, 0.06, 0.06, 0.02, -0.15, 0.47, 0.33, 0x111111);
  box(g, 0.12, 0.12, 0.06, 0.18, 0.57, 0.2, 0xf48fb1);
  box(g, 0.12, 0.12, 0.06, -0.18, 0.57, 0.2, 0xf48fb1);
  for (const [x, z] of [[0.18, 0.2], [-0.18, 0.2], [0.18, -0.2], [-0.18, -0.2]]) {
    box(g, 0.12, 0.15, 0.12, x, 0, z, 0xf48fb1);
  }
  return g;
}

function cat() {
  const g = new THREE.Group();
  box(g, 0.4, 0.35, 0.6, 0, 0.15, -0.05, 0xff9800);
  box(g, 0.4, 0.35, 0.35, 0, 0.45, 0.2, 0xffa726);
  box(g, 0.1, 0.14, 0.08, 0.13, 0.8, 0.22, 0xff9800);
  box(g, 0.1, 0.14, 0.08, -0.13, 0.8, 0.22, 0xff9800);
  box(g, 0.07, 0.07, 0.02, 0.1, 0.62, 0.38, 0x2e7d32);
  box(g, 0.07, 0.07, 0.02, -0.1, 0.62, 0.38, 0x2e7d32);
  box(g, 0.06, 0.04, 0.02, 0, 0.53, 0.38, 0xf06292);
  box(g, 0.08, 0.08, 0.45, 0, 0.45, -0.5, 0xff9800); // tail
  for (const [x, z] of [[0.13, 0.15], [-0.13, 0.15], [0.13, -0.25], [-0.13, -0.25]]) {
    box(g, 0.1, 0.15, 0.1, x, 0, z, 0xfff3e0);
  }
  return g;
}

export const BUILTIN_CHARACTERS = [
  { id: 'chicken', name: 'Chicken', build: chicken },
  { id: 'frog', name: 'Frog', build: frog },
  { id: 'pig', name: 'Pig', build: pig },
  { id: 'cat', name: 'Cat', build: cat },
  { id: 'penguin', name: 'Penguin', build: penguin },
  { id: 'robot', name: 'Robot', build: robot },
];

// --------------------------------------------------------------------- world

// Leaves get their own materials so snow can tint them without touching characters.
export const LEAF_COLORS = [0x2e7d32, 0x388e3c, 0x4caf50];
export const leafMats = LEAF_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));

export function tree(height = 1) {
  const g = new THREE.Group();
  box(g, 0.3, 0.35, 0.3, 0, 0, 0, 0x6d4c41);
  const leafColor = leafMats[Math.floor(Math.random() * leafMats.length)];
  const top = new THREE.Group();
  top.position.y = 0.35;
  box(top, 0.8, 0.5 * height, 0.8, 0, 0, 0, leafColor);
  box(top, 0.55, 0.35 * height, 0.55, 0, 0.5 * height, 0, leafColor);
  g.add(top);
  g.userData.top = top;
  return g;
}

export function rock() {
  const g = new THREE.Group();
  box(g, 0.6, 0.35, 0.55, 0, 0, 0, 0x9e9e9e);
  box(g, 0.35, 0.2, 0.3, 0.05, 0.35, 0, 0xbdbdbd);
  return g;
}

const CAR_COLORS = [0xe53935, 0x1e88e5, 0xfdd835, 0x8e24aa, 0x00acc1, 0xfb8c00, 0x43a047];

function wheels(g, len) {
  const off = len / 2 - 0.25;
  for (const x of [off, -off]) {
    for (const z of [0.36, -0.36]) box(g, 0.25, 0.25, 0.1, x, 0, z, 0x212121);
  }
}

/** Vehicles are built along +X; the lane flips them for the other direction. */
export function car() {
  const g = new THREE.Group();
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  box(g, 1.3, 0.35, 0.7, 0, 0.1, 0, color);
  box(g, 0.7, 0.3, 0.62, -0.1, 0.45, 0, 0xeeeeee);
  box(g, 0.05, 0.1, 0.15, 0.66, 0.25, 0.22, 0xfff59d);
  box(g, 0.05, 0.1, 0.15, 0.66, 0.25, -0.22, 0xfff59d);
  wheels(g, 1.3);
  g.userData.len = 1.3;
  return g;
}

export function truck() {
  const g = new THREE.Group();
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  box(g, 0.6, 0.65, 0.72, 0.85, 0.1, 0, color);
  box(g, 0.05, 0.25, 0.6, 1.16, 0.45, 0, 0x90caf9);
  box(g, 1.65, 0.8, 0.78, -0.3, 0.1, 0, 0xeceff1);
  wheels(g, 2.3);
  g.userData.len = 2.3;
  return g;
}

export function log(len) {
  const g = new THREE.Group();
  box(g, len, 0.25, 0.7, 0, -0.08, 0, 0x8d6e63, { shadow: false });
  box(g, len - 0.1, 0.06, 0.55, 0, 0.17, 0, 0x795548, { shadow: false });
  box(g, 0.05, 0.22, 0.6, len / 2, -0.06, 0, 0xd7ccc8, { shadow: false });
  box(g, 0.05, 0.22, 0.6, -len / 2, -0.06, 0, 0xd7ccc8, { shadow: false });
  g.userData.len = len;
  return g;
}

export function lilyPad() {
  const g = new THREE.Group();
  box(g, 0.75, 0.06, 0.75, 0, -0.02, 0, 0x66bb6a, { shadow: false });
  box(g, 0.15, 0.08, 0.15, 0.15, 0.02, 0.1, 0xf06292, { shadow: false });
  return g;
}

export function train(cars = 4) {
  const g = new THREE.Group();
  const carLen = 2.6;
  for (let i = 0; i < cars; i++) {
    const x = -i * (carLen + 0.15);
    const front = i === 0;
    box(g, carLen, 0.95, 0.8, x, 0.1, 0, front ? 0xc62828 : 0x546e7a);
    box(g, carLen - 0.3, 0.2, 0.82, x, 0.55, 0, front ? 0xffcdd2 : 0x90a4ae);
    if (front) box(g, 0.05, 0.2, 0.3, x + carLen / 2, 0.3, 0, 0xfff59d);
  }
  g.userData.len = cars * (carLen + 0.15);
  g.userData.frontOffset = carLen / 2;
  return g;
}

export function eagle() {
  const g = new THREE.Group();
  box(g, 0.6, 0.4, 1.2, 0, 0, 0, 0x5d4037);
  box(g, 3.2, 0.1, 0.7, 0, 0.15, 0, 0x4e342e);
  box(g, 0.45, 0.4, 0.4, 0, 0.1, 0.75, 0xffffff);
  box(g, 0.15, 0.12, 0.2, 0, 0.12, 1.02, 0xffb300);
  box(g, 0.5, 0.08, 0.5, 0, 0.05, -0.8, 0x4e342e);
  return g;
}

// Procedural lanes: grass (trees), roads (cars/trucks), rivers (logs or lily
// pads) and railways (trains). Row r sits at z = -r; column c sits at x = c.
import * as THREE from 'three';
import * as M from './models.js';

export const COL_MIN = -6;
export const COL_MAX = 6;
const STRIP_W = 44; // ground strip width, wide enough to fill the view
const WRAP = 17; // vehicles/logs wrap around at |x| > WRAP

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// Shared ground materials, tinted toward white when snow settles.
const GROUND = {
  grassA: { mat: lambert(0x9ccc65), base: 0x9ccc65, snow: 0xf4f8fb },
  grassB: { mat: lambert(0x8bc34a), base: 0x8bc34a, snow: 0xe9f0f5 },
  grassSideA: { mat: lambert(0x7ca34d), base: 0x7ca34d, snow: 0xc9d3db },
  grassSideB: { mat: lambert(0x6f953f), base: 0x6f953f, snow: 0xbfc9d1 },
  road: { mat: lambert(0x50555c), base: 0x50555c, snow: 0x9aa3ab },
  roadSide: { mat: lambert(0x3c4045), base: 0x3c4045, snow: 0x7c858d },
  rail: { mat: lambert(0x8d7f73), base: 0x8d7f73, snow: 0xd8dde2 },
  railSide: { mat: lambert(0x6e6359), base: 0x6e6359, snow: 0xb4bbc1 },
  water: { mat: lambert(0x4fc3f7), base: 0x4fc3f7, snow: 0x9fd9f3 },
  waterSide: { mat: lambert(0x3a9bc8), base: 0x3a9bc8, snow: 0x80b9d6 },
};
const LEAF_SNOW = 0xf1f5f8;
const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
const steelMat = lambert(0x9e9e9e);
const sleeperMat = lambert(0x5d4037);
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function strip(parent, mat, sideMat, height, y) {
  // Center (playable) section plus darker out-of-bounds sides.
  const playW = COL_MAX - COL_MIN + 1;
  const center = new THREE.Mesh(unitBox, mat);
  center.scale.set(playW, height, 1);
  center.position.y = y - height / 2;
  center.receiveShadow = true;
  parent.add(center);
  const sideW = (STRIP_W - playW) / 2;
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(unitBox, sideMat);
    side.scale.set(sideW, height, 1);
    side.position.set(s * (playW / 2 + sideW / 2), y - height / 2, 0);
    side.receiveShadow = true;
    parent.add(side);
  }
}

class Lane {
  constructor(row, type, opts = {}) {
    this.row = row;
    this.type = type;
    this.group = new THREE.Group();
    this.group.position.z = -row;
    this.items = []; // moving things: {mesh, x, len}
    this.blocked = new Set(); // grass: columns with trees/rocks
    this.trees = [];
    this.speed = 0;
    this.dir = 1;
    this.opts = opts;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.geometry && o.geometry !== unitBox && o.geometry.type !== 'BoxGeometry') o.geometry.dispose();
    });
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.lanes = new Map();
    this.time = 0;
    this.onTrainWarning = () => {};
    this.onHonk = () => {};
  }

  reset() {
    for (const lane of this.lanes.values()) lane.dispose();
    this.lanes.clear();
    this.maxRow = -9;
    this.lastType = null;
    this.runLeft = 0;
    this.lastRiverDir = 1;
    this.mustFree = null; // columns the next lane must keep open
    this.applySnow(0);
    for (let r = -8; r < 0; r++) this._add(this._grass(r, { wall: true }));
    for (let r = 0; r <= 4; r++) this._add(this._grass(r, { start: true }));
    this.lastType = 'grass';
    this.ensure(0);
  }

  lane(row) {
    return this.lanes.get(row) || null;
  }

  /** Generates lanes ahead of and drops lanes far behind `row`. */
  ensure(row) {
    while (this.maxRow < row + 28) this._add(this._next(this.maxRow + 1));
    for (const [r, lane] of this.lanes) {
      if (r < row - 14) {
        lane.dispose();
        this.lanes.delete(r);
      }
    }
  }

  _add(lane) {
    this.lanes.set(lane.row, lane);
    this.root.add(lane.group);
    this.maxRow = Math.max(this.maxRow, lane.row);
  }

  _next(row) {
    if (this.runLeft <= 0) {
      const d = Math.min(1, row / 300);
      const weights = {
        grass: this.lastType === 'grass' ? 0 : 3,
        road: this.lastType === 'road' ? 0 : 3 + d * 2,
        river: this.lastType === 'river' ? 0 : 2 + d,
        rail: this.lastType === 'rail' ? 0 : 1 + d,
      };
      const total = Object.values(weights).reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let type = 'grass';
      for (const [k, w] of Object.entries(weights)) {
        if ((r -= w) <= 0) { type = k; break; }
      }
      const maxRun = { grass: 3, road: 2 + Math.round(d * 3), river: 2 + Math.round(d * 2), rail: 2 }[type];
      this.runLeft = 1 + Math.floor(Math.random() * maxRun);
      this.lastType = type;
      this.runIndex = 0;
    }
    this.runLeft--;
    const idx = this.runIndex++;
    const diff = Math.min(1, row / 250);
    switch (this.lastType) {
      case 'road': return this._road(row, diff, idx > 0);
      case 'river': return this._river(row, diff);
      case 'rail': return this._rail(row);
      default: return this._grass(row, { diff });
    }
  }

  // ------------------------------------------------------------------ grass
  _grass(row, { wall = false, start = false, diff = 0 } = {}) {
    const lane = new Lane(row, 'grass');
    const even = ((row % 2) + 2) % 2 === 0;
    strip(lane.group, (even ? GROUND.grassA : GROUND.grassB).mat, (even ? GROUND.grassSideA : GROUND.grassSideB).mat, 0.3, 0);

    const density = wall ? 1 : start ? 0.12 : 0.16 + diff * 0.14;
    const cols = [];
    for (let c = COL_MIN; c <= COL_MAX; c++) {
      if (start && Math.abs(c) <= 1 && row <= 1) continue;
      if (Math.random() < density) cols.push(c);
    }
    let blocked = new Set(cols);
    if (this.mustFree) for (const c of this.mustFree) blocked.delete(c);
    // Always leave at least three open columns.
    while (COL_MAX - COL_MIN + 1 - blocked.size < 3) blocked.delete([...blocked][Math.floor(Math.random() * blocked.size)]);
    if (wall) blocked = new Set(cols);

    for (const c of blocked) this._decor(lane, c, true);
    // Out-of-bounds scenery.
    for (let c = COL_MAX + 1; c <= 15; c++) {
      if (Math.random() < 0.55) this._decor(lane, c, false);
      if (Math.random() < 0.55) this._decor(lane, -c, false);
    }
    lane.blocked = blocked;
    const free = [];
    for (let c = COL_MIN; c <= COL_MAX; c++) if (!blocked.has(c)) free.push(c);
    lane.free = free;
    this.mustFree = null;
    this.prevFree = free;
    return lane;
  }

  _decor(lane, c, playable) {
    const useRock = playable && Math.random() < 0.18;
    const obj = useRock ? M.rock() : M.tree(0.8 + Math.random() * 0.9);
    obj.position.x = c;
    obj.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
    lane.group.add(obj);
    if (obj.userData.top) lane.trees.push({ top: obj.userData.top, phase: Math.random() * 6 });
  }

  // ------------------------------------------------------------------- road
  _road(row, diff, stripe) {
    const lane = new Lane(row, 'road');
    strip(lane.group, GROUND.road.mat, GROUND.roadSide.mat, 0.3, -0.02);
    if (stripe) {
      for (let x = -20; x <= 20; x += 1.6) {
        const s = new THREE.Mesh(unitBox, stripeMat);
        s.scale.set(0.7, 0.02, 0.07);
        s.position.set(x, -0.01, 0.5);
        lane.group.add(s);
      }
    }
    lane.dir = Math.random() < 0.5 ? 1 : -1;
    const trucks = Math.random() < 0.3;
    lane.speed = (trucks ? 1.4 : 1.8) + Math.random() * 1.6 + diff * 2.2;
    const count = trucks ? 2 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
    const span = WRAP * 2;
    const spacing = span / count;
    const offset = Math.random() * span;
    for (let i = 0; i < count; i++) {
      const v = trucks ? M.truck() : M.car();
      if (lane.dir < 0) v.rotation.y = Math.PI;
      const x = -WRAP + ((offset + i * spacing + Math.random() * spacing * 0.35) % span);
      v.position.x = x;
      lane.group.add(v);
      lane.items.push({ mesh: v, x, len: v.userData.len });
    }
    lane.honkTimer = 2 + Math.random() * 6;
    this.prevFree = null;
    this.mustFree = null;
    return lane;
  }

  // ------------------------------------------------------------------ river
  _river(row, diff) {
    const lane = new Lane(row, 'river');
    strip(lane.group, GROUND.water.mat, GROUND.waterSide.mat, 0.3, -0.18);
    const prevLily = this.lanes.get(row - 1)?.lily;
    const lily = !prevLily && Math.random() < 0.25;
    lane.lily = lily;
    if (lily) {
      const pads = new Set();
      // Make sure at least one pad lines up with an open tile behind it.
      if (this.prevFree && this.prevFree.length) {
        pads.add(this.prevFree[Math.floor(Math.random() * this.prevFree.length)]);
      }
      const want = 3 + Math.floor(Math.random() * 3);
      while (pads.size < want) pads.add(COL_MIN + Math.floor(Math.random() * (COL_MAX - COL_MIN + 1)));
      for (const c of pads) {
        const p = M.lilyPad();
        p.position.x = c;
        lane.group.add(p);
        lane.items.push({ mesh: p, x: c, len: 0.9, pad: true });
      }
      lane.speed = 0;
      this.mustFree = [...pads];
    } else {
      this.lastRiverDir *= -1;
      lane.dir = this.lastRiverDir;
      lane.speed = 0.9 + Math.random() * 1.0 + diff * 0.8;
      const count = 3 + Math.floor(Math.random() * 2);
      const span = WRAP * 2;
      const spacing = span / count;
      const offset = Math.random() * span;
      for (let i = 0; i < count; i++) {
        const len = 2 + Math.floor(Math.random() * (diff > 0.5 ? 2 : 3));
        const l = M.log(len);
        const x = -WRAP + ((offset + i * spacing) % span);
        l.position.x = x;
        lane.group.add(l);
        lane.items.push({ mesh: l, x, len });
      }
      this.mustFree = null;
    }
    this.prevFree = null;
    return lane;
  }

  // ------------------------------------------------------------------- rail
  _rail(row) {
    const lane = new Lane(row, 'rail');
    strip(lane.group, GROUND.rail.mat, GROUND.railSide.mat, 0.3, -0.02);
    for (let x = -20; x <= 20; x += 0.8) {
      const s = new THREE.Mesh(unitBox, sleeperMat);
      s.scale.set(0.25, 0.05, 0.85);
      s.position.set(x, 0, 0);
      s.receiveShadow = true;
      lane.group.add(s);
    }
    for (const z of [-0.28, 0.28]) {
      const r = new THREE.Mesh(unitBox, steelMat);
      r.scale.set(STRIP_W, 0.06, 0.06);
      r.position.set(0, 0.05, z);
      lane.group.add(r);
    }
    // Warning signal
    const pole = new THREE.Group();
    M.box(pole, 0.08, 1.1, 0.08, 0, 0, 0, 0x424242);
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x4a1010 })
    );
    light.position.set(0, 1.05, 0.05);
    pole.add(light);
    pole.position.set(COL_MAX + 0.8, 0, -0.42);
    lane.group.add(pole);
    lane.signal = light.material;

    lane.dir = Math.random() < 0.5 ? 1 : -1;
    const t = M.train(3 + Math.floor(Math.random() * 3));
    if (lane.dir < 0) t.rotation.y = Math.PI;
    t.visible = false;
    lane.group.add(t);
    lane.train = { mesh: t, len: t.userData.len, x: 0, active: false };
    lane.speed = 26;
    lane.trainTimer = 2 + Math.random() * 6;
    this.prevFree = null;
    this.mustFree = null;
    return lane;
  }

  // ----------------------------------------------------------------- update
  update(dt, weather, playerRow) {
    this.time += dt;
    const p = weather.params;
    for (const lane of this.lanes.values()) {
      if (lane.type === 'road' || (lane.type === 'river' && !lane.lily)) {
        const mul = lane.type === 'road' ? p.carMul : p.logMul;
        const v = lane.speed * lane.dir * mul;
        lane.velocity = v;
        for (const it of lane.items) {
          it.x += v * dt;
          const lim = WRAP + it.len / 2;
          if (it.x > lim) it.x -= lim * 2;
          if (it.x < -lim) it.x += lim * 2;
          it.mesh.position.x = it.x;
          if (lane.type === 'river') it.mesh.position.y = Math.sin(this.time * 3 + it.x) * 0.02;
        }
        if (lane.type === 'road' && Math.abs(lane.row - playerRow) <= 2) {
          lane.honkTimer -= dt;
          if (lane.honkTimer <= 0) {
            lane.honkTimer = 4 + Math.random() * 8;
            this.onHonk(weather.current === 'fog');
          }
        }
      } else if (lane.type === 'rail') {
        this._updateRail(lane, dt, playerRow);
      }
      if (lane.trees.length && p.wind > 0.05) {
        for (const t of lane.trees) {
          t.top.rotation.z = Math.sin(this.time * 5 + t.phase) * 0.06 * p.wind;
          t.top.rotation.x = Math.sin(this.time * 4.3 + t.phase) * 0.03 * p.wind;
        }
      }
    }
  }

  _updateRail(lane, dt, playerRow) {
    const tr = lane.train;
    if (!tr.active) {
      lane.trainTimer -= dt;
      const warning = lane.trainTimer < 1.6;
      const blink = warning && Math.floor(this.time * 6) % 2 === 0;
      lane.signal.color.setHex(blink ? 0xff1744 : 0x4a1010);
      if (warning && !lane.warned) {
        lane.warned = true;
        if (Math.abs(lane.row - playerRow) <= 6) this.onTrainWarning();
      }
      if (lane.trainTimer <= 0) {
        tr.active = true;
        tr.x = -lane.dir * (WRAP + 12);
        tr.mesh.visible = true;
      }
    } else {
      tr.x += lane.speed * lane.dir * dt;
      tr.mesh.position.x = tr.x;
      lane.signal.color.setHex(Math.floor(this.time * 6) % 2 ? 0xff1744 : 0x4a1010);
      if (Math.abs(tr.x) > WRAP + tr.len + 14) {
        tr.active = false;
        tr.mesh.visible = false;
        lane.warned = false;
        lane.trainTimer = 4 + Math.random() * 7;
      }
    }
  }

  // ---------------------------------------------------------------- queries
  isBlocked(row, col) {
    if (col < COL_MIN || col > COL_MAX) return true;
    const lane = this.lane(row);
    if (!lane) return true;
    return lane.type === 'grass' && lane.blocked.has(col);
  }

  /** Returns what kills the player at x on this row, or null. */
  hazardAt(row, x) {
    const lane = this.lane(row);
    if (!lane) return null;
    if (lane.type === 'road') {
      for (const it of lane.items) if (Math.abs(it.x - x) < it.len / 2 + 0.25) return 'car';
    } else if (lane.type === 'rail' && lane.train.active) {
      // The train mesh is built with its front at +x; cars trail toward -x.
      const tr = lane.train;
      const front = tr.x + lane.dir * tr.mesh.userData.frontOffset;
      const back = front - lane.dir * tr.len;
      const lo = Math.min(front, back) - 0.3;
      const hi = Math.max(front, back) + 0.3;
      if (x > lo && x < hi) return 'train';
    }
    return null;
  }

  /** River lanes: returns the log/pad under x, or null (= splash). */
  platformAt(row, x) {
    const lane = this.lane(row);
    if (!lane || lane.type !== 'river') return null;
    for (const it of lane.items) {
      const half = it.pad ? 0.45 : it.len / 2 + 0.05;
      if (Math.abs(it.x - x) <= half) return it;
    }
    return null;
  }

  applySnow(cover) {
    if (this.snowApplied !== undefined && Math.abs(this.snowApplied - cover) < 0.005) return;
    this.snowApplied = cover;
    const tmp = new THREE.Color();
    for (const g of Object.values(GROUND)) {
      const k = g === GROUND.road || g === GROUND.roadSide || g === GROUND.water || g === GROUND.waterSide ? cover * 0.55 : cover * 0.9;
      g.mat.color.setHex(g.base).lerp(tmp.setHex(g.snow), k);
    }
    M.leafMats.forEach((m, i) => m.color.setHex(M.LEAF_COLORS[i]).lerp(tmp.setHex(LEAF_SNOW), cover * 0.7));
  }
}

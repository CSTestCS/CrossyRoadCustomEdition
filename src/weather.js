// Dynamic weather: visuals (sky, fog, light, particles) plus gameplay effects
// (vehicle/log speed multipliers, lightning strikes, snow cover).
import * as THREE from 'three';

export const WEATHER = {
  clear: {
    label: 'Clear Skies', icon: '☀️', hint: 'A perfect day for crossing.',
    sky: 0x8fd3ff, light: 0xffffff, lightI: 1.0, fogNear: 15, fogFar: 32,
    rain: 0, snow: 0, wind: 0, lightning: 0, carMul: 1, logMul: 1,
  },
  rain: {
    label: 'Rain', icon: '🌧️', hint: 'Wet roads — traffic is faster!',
    sky: 0x7a8fa6, light: 0xdfe8ff, lightI: 0.7, fogNear: 6, fogFar: 18,
    rain: 1, snow: 0, wind: 0.15, lightning: 0, carMul: 1.2, logMul: 1.1,
  },
  storm: {
    label: 'Thunderstorm', icon: '⛈️', hint: 'Watch for lightning marks!',
    sky: 0x3d4858, light: 0xc8d4ff, lightI: 0.45, fogNear: 3, fogFar: 11,
    rain: 1.7, snow: 0, wind: 0.5, lightning: 1, carMul: 1.2, logMul: 1.3,
  },
  snow: {
    label: 'Snowfall', icon: '❄️', hint: 'Icy roads — traffic slows down.',
    sky: 0xdde7f0, light: 0xf2f6ff, lightI: 0.9, fogNear: 4, fogFar: 14,
    rain: 0, snow: 1, wind: 0.1, lightning: 0, carMul: 0.7, logMul: 0.65,
  },
  fog: {
    label: 'Thick Fog', icon: '🌫️', hint: "You can't see far. Listen for horns.",
    sky: 0xc5cdd3, light: 0xffffff, lightI: 0.75, fogNear: -1.5, fogFar: 4.5,
    rain: 0, snow: 0, wind: 0, lightning: 0, carMul: 0.9, logMul: 1,
  },
  wind: {
    label: 'Gale', icon: '🌬️', hint: 'Strong winds — the river runs fast.',
    sky: 0x9fd0ea, light: 0xffffff, lightI: 0.95, fogNear: 15, fogFar: 32,
    rain: 0, snow: 0, wind: 1.5, lightning: 0, carMul: 1, logMul: 1.7,
  },
  heat: {
    label: 'Heatwave', icon: '🔥', hint: 'Drivers are in a hurry!',
    sky: 0xffc48a, light: 0xffe0b0, lightI: 1.1, fogNear: 9, fogFar: 26,
    rain: 0, snow: 0, wind: 0, lightning: 0, carMul: 1.35, logMul: 0.9,
  },
};

// fogNear/fogFar are measured from the point the camera looks at.
const NUMERIC = ['lightI', 'fogNear', 'fogFar', 'rain', 'snow', 'wind', 'lightning', 'carMul', 'logMul'];
const COLORS = ['sky', 'light'];
const BLEND_TIME = 5;
const FIELD = { x: 34, y: 16, z: 34 };

// Relative chance of each weather being picked next.
const WEIGHTS = { clear: 3, rain: 2, storm: 1.4, snow: 1.6, fog: 1.3, wind: 1.4, heat: 1.1 };

function makeParams(def) {
  const p = {};
  for (const k of NUMERIC) p[k] = def[k];
  for (const k of COLORS) p[k] = new THREE.Color(def[k]);
  return p;
}

function wrap(v, center, size) {
  const half = size / 2;
  let d = (v - center + half) % size;
  if (d < 0) d += size;
  return center - half + d;
}

export class Weather {
  constructor(scene, { onChange, onFlash, onStrike, getStrikeTarget } = {}) {
    this.scene = scene;
    this.onChange = onChange || (() => {});
    this.onFlash = onFlash || (() => {});
    this.onStrike = onStrike || (() => {});
    this.getStrikeTarget = getStrikeTarget || (() => null);
    this.enabled = true;

    this.group = new THREE.Group();
    scene.add(this.group);
    this._initRain();
    this._initSnow();
    this._initWind();

    this.markers = [];
    this.bolts = [];
    this.flash = 0;
    this.snowCover = 0;
    this.reset();
  }

  reset() {
    this.current = 'clear';
    this.from = makeParams(WEATHER.clear);
    this.to = makeParams(WEATHER.clear);
    this.params = makeParams(WEATHER.clear);
    this.blend = 1;
    this.timer = 18; // first change after a calm start
    this.strikeTimer = 3;
    this.snowCover = 0;
    this.flash = 0;
    for (const m of this.markers) this.group.remove(m.mesh);
    for (const b of this.bolts) this.group.remove(b.mesh);
    this.markers = [];
    this.bolts = [];
  }

  get def() {
    return WEATHER[this.current];
  }

  set(name) {
    if (!WEATHER[name]) return;
    this.from = this._snapshot();
    this.to = makeParams(WEATHER[name]);
    this.blend = 0;
    this.current = name;
    this.timer = 20 + Math.random() * 18;
    this.onChange(name, WEATHER[name]);
  }

  _snapshot() {
    const p = {};
    for (const k of NUMERIC) p[k] = this.params[k];
    for (const k of COLORS) p[k] = this.params[k].clone();
    return p;
  }

  _pickNext() {
    const options = Object.entries(WEIGHTS).filter(([k]) => k !== this.current);
    const total = options.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of options) {
      if ((r -= w) <= 0) return k;
    }
    return 'clear';
  }

  // ------------------------------------------------------------- particles
  _initRain() {
    const n = 1800;
    const pos = new Float32Array(n * 6);
    this.rainDrops = [];
    for (let i = 0; i < n; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * FIELD.x,
        y: Math.random() * FIELD.y,
        z: (Math.random() - 0.5) * FIELD.z,
        v: 18 + Math.random() * 8,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xaecbff, transparent: true, opacity: 0.6, depthWrite: false })
    );
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  _initSnow() {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    this.flakes = [];
    for (let i = 0; i < n; i++) {
      this.flakes.push({
        x: (Math.random() - 0.5) * FIELD.x,
        y: Math.random() * FIELD.y,
        z: (Math.random() - 0.5) * FIELD.z,
        v: 1 + Math.random() * 1.2,
        p: Math.random() * Math.PI * 2,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, depthWrite: false })
    );
    this.snow.frustumCulled = false;
    this.group.add(this.snow);
  }

  _initWind() {
    const n = 260;
    const pos = new Float32Array(n * 6);
    this.gusts = [];
    for (let i = 0; i < n; i++) {
      this.gusts.push({
        x: (Math.random() - 0.5) * FIELD.x,
        y: 0.3 + Math.random() * 4,
        z: (Math.random() - 0.5) * FIELD.z,
        v: 12 + Math.random() * 10,
        l: 0.6 + Math.random() * 1.4,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.windLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })
    );
    this.windLines.frustumCulled = false;
    this.group.add(this.windLines);
  }

  _updateParticles(dt, focus) {
    const p = this.params;
    const windX = p.wind * 6;

    // Rain
    const rainCount = Math.floor(this.rainDrops.length * Math.min(1, p.rain));
    this.rain.visible = rainCount > 0;
    if (this.rain.visible) {
      const arr = this.rain.geometry.attributes.position.array;
      const slant = windX * 0.04 + 0.05;
      for (let i = 0; i < rainCount; i++) {
        const d = this.rainDrops[i];
        d.y -= d.v * dt;
        d.x += windX * dt;
        if (d.y < 0) {
          d.y += FIELD.y;
          d.x = focus.x + (Math.random() - 0.5) * FIELD.x;
          d.z = focus.z + (Math.random() - 0.5) * FIELD.z;
        }
        d.x = wrap(d.x, focus.x, FIELD.x);
        d.z = wrap(d.z, focus.z, FIELD.z);
        const o = i * 6;
        arr[o] = d.x; arr[o + 1] = d.y; arr[o + 2] = d.z;
        arr[o + 3] = d.x - slant * 8; arr[o + 4] = d.y + 0.45; arr[o + 5] = d.z;
      }
      this.rain.geometry.setDrawRange(0, rainCount * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.35 + 0.3 * Math.min(1, p.rain);
    }

    // Snow
    const snowCount = Math.floor(this.flakes.length * Math.min(1, p.snow));
    this.snow.visible = snowCount > 0;
    if (this.snow.visible) {
      const arr = this.snow.geometry.attributes.position.array;
      const t = performance.now() / 1000;
      for (let i = 0; i < snowCount; i++) {
        const f = this.flakes[i];
        f.y -= f.v * dt;
        f.x += (Math.sin(t + f.p) * 0.4 + windX * 0.4) * dt;
        if (f.y < 0) f.y += FIELD.y;
        f.x = wrap(f.x, focus.x, FIELD.x);
        f.z = wrap(f.z, focus.z, FIELD.z);
        arr[i * 3] = f.x; arr[i * 3 + 1] = f.y; arr[i * 3 + 2] = f.z;
      }
      this.snow.geometry.setDrawRange(0, snowCount);
      this.snow.geometry.attributes.position.needsUpdate = true;
    }

    // Wind streaks (only for strong wind)
    const gustAmt = Math.max(0, p.wind - 0.3);
    const gustCount = Math.floor(this.gusts.length * Math.min(1, gustAmt));
    this.windLines.visible = gustCount > 0;
    if (this.windLines.visible) {
      const arr = this.windLines.geometry.attributes.position.array;
      for (let i = 0; i < gustCount; i++) {
        const g = this.gusts[i];
        g.x += g.v * dt * Math.min(1.5, p.wind);
        g.x = wrap(g.x, focus.x, FIELD.x);
        g.z = wrap(g.z, focus.z, FIELD.z);
        const o = i * 6;
        arr[o] = g.x; arr[o + 1] = g.y; arr[o + 2] = g.z;
        arr[o + 3] = g.x - g.l; arr[o + 4] = g.y; arr[o + 5] = g.z;
      }
      this.windLines.geometry.setDrawRange(0, gustCount * 2);
      this.windLines.geometry.attributes.position.needsUpdate = true;
      this.windLines.material.opacity = 0.25 + 0.25 * Math.min(1, gustAmt);
    }
  }

  // -------------------------------------------------------------- lightning
  _spawnMarker() {
    const target = this.getStrikeTarget();
    if (!target) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.45, 24),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(target.x, 0.06, target.z);
    this.group.add(ring);
    this.markers.push({ mesh: ring, t: 0, life: 1.4, x: target.x, z: target.z });
  }

  _strike(x, z) {
    const pts = [];
    let px = x, pz = z;
    for (let y = 14; y >= 0; y -= 1.4) {
      pts.push(new THREE.Vector3(px, y, pz));
      px = x + (Math.random() - 0.5) * 0.8;
      pz = z + (Math.random() - 0.5) * 0.8;
    }
    pts.push(new THREE.Vector3(x, 0, z));
    const bolt = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true })
    );
    this.group.add(bolt);
    this.bolts.push({ mesh: bolt, t: 0 });
    this.flash = 1;
    this.onFlash();
    this.onStrike(x, z);
  }

  _updateLightning(dt) {
    const p = this.params;
    if (p.lightning > 0.6 && this.strikesActive) {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = 2.2 + Math.random() * 2.8;
        this._spawnMarker();
      }
      // Distant flashes with no strike, just for atmosphere.
      if (Math.random() < dt * 0.25) {
        this.flash = Math.max(this.flash, 0.5);
        this.onFlash(true);
      }
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t += dt;
      const k = m.t / m.life;
      const pulse = 1 + Math.sin(m.t * 20) * 0.12;
      m.mesh.scale.setScalar(pulse * (1.2 - k * 0.3));
      m.mesh.material.color.setHex(k > 0.6 ? 0xff3d00 : 0xffeb3b);
      if (m.t >= m.life) {
        this.group.remove(m.mesh);
        m.mesh.geometry.dispose();
        this.markers.splice(i, 1);
        this._strike(m.x, m.z);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.mesh.material.opacity = Math.max(0, 1 - b.t / 0.35);
      if (b.t > 0.35) {
        this.group.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.bolts.splice(i, 1);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
  }

  /** Advances weather. `strikesActive` is false in menus so nothing hits the idle player. */
  update(dt, focus, strikesActive) {
    this.strikesActive = strikesActive;
    if (this.enabled && strikesActive) {
      this.timer -= dt;
      if (this.timer <= 0) this.set(this._pickNext());
    }

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / BLEND_TIME);
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const k of NUMERIC) this.params[k] = this.from[k] + (this.to[k] - this.from[k]) * t;
      for (const k of COLORS) this.params[k].copy(this.from[k]).lerp(this.to[k], t);
    }

    const target = this.params.snow > 0.5 ? 1 : 0;
    const rate = target ? 0.06 : 0.04;
    this.snowCover += Math.sign(target - this.snowCover) * Math.min(rate * dt, Math.abs(target - this.snowCover));

    this._updateParticles(dt, focus);
    this._updateLightning(dt);
  }

  /** Seconds until the next weather change (for the HUD forecast). */
  get timeLeft() {
    return Math.max(0, this.timer);
  }
}

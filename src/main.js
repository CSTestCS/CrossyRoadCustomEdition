import * as THREE from 'three';
import { World, COL_MIN, COL_MAX } from './world.js';
import { Weather, WEATHER } from './weather.js';
import * as M from './models.js';
import * as chars from './characters.js';
import * as storage from './storage.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const HOP_TIME = 0.13;
const HOP_HEIGHT = 0.45;
const CAM_OFFSET = new THREE.Vector3(2.2, 14, 8);
const LOOK_AHEAD = new THREE.Vector3(0, 0, -1.5);
const lookAt = new THREE.Vector3();
const EAGLE_DISTANCE = 3.5; // rows the player may fall behind the camera
const IDLE_LIMIT = 12; // seconds standing still before the eagle comes
const DIRS = {
  up: { dr: 1, dc: 0, yaw: Math.PI },
  down: { dr: -1, dc: 0, yaw: 0 },
  left: { dr: 0, dc: -1, yaw: -Math.PI / 2 },
  right: { dr: 0, dc: 1, yaw: Math.PI / 2 },
};
const DEATH_TEXT = {
  car: 'Splat! Hit by traffic',
  train: 'Flattened by a train!',
  splash: 'Sploosh! Fell in the river',
  swept: 'Swept away downstream!',
  eagle: 'Snatched by an eagle!',
  lightning: 'Zapped by lightning!',
};

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(WEATHER.clear.sky);
scene.fog = new THREE.Fog(WEATHER.clear.sky, 30, 60);

const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 120);
const CAM_DIST = CAM_OFFSET.length();

const hemi = new THREE.HemisphereLight(0xffffff, 0x7d8f69, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  const halfW = Math.max(5.2 * aspect, 5.8);
  const halfH = halfW / aspect;
  Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// --------------------------------------------------------------------- state
const world = new World(scene);
const focus = new THREE.Vector3();
let state = 'menu'; // menu | playing | paused | dead
let selectedId = storage.getSelected();
let selectedName = 'Chicken';
let weatherMode = localStorage.getItem('crossy.weatherMode') || 'dynamic';

const player = {
  inst: null,
  holder: new THREE.Group(), // position + facing; the character's root squashes inside it
  x: 0, z: 0, y: 0,
  row: 0,
  hop: null,
  queued: null,
  yaw: Math.PI,
  platform: null,
  score: 0,
  moved: false,
  bestBefore: 0,
  announcedBest: false,
};
scene.add(player.holder);

const effects = []; // short-lived particle boxes
let death = null;
let eagleMesh = null;

const weather = new Weather(scene, {
  onChange: (name, def) => {
    updateWeatherBadge();
    if (state === 'playing') {
      showToast(`${def.icon} ${def.label}`, def.hint);
      sfx.weather();
    }
  },
  onFlash: (far) => sfx.thunder(far),
  getStrikeTarget: () => {
    if (state !== 'playing') return null;
    // Half the strikes aim at the player's tile so standing still is risky.
    if (Math.random() < 0.5) return { x: Math.round(player.x), z: -player.row };
    return {
      x: THREE.MathUtils.clamp(Math.round(player.x) + Math.floor(Math.random() * 5) - 2, COL_MIN, COL_MAX),
      z: -(player.row + Math.floor(Math.random() * 4)),
    };
  },
  onStrike: (x, z) => {
    puff(x, 0.2, z, 0xffee58, 10, 3);
    puff(x, 0.2, z, 0x424242, 8, 1.5);
    if (state !== 'playing') return;
    if (Math.abs(player.x - x) < 0.55 && Math.abs(player.z - z) < 0.55) die('lightning');
  },
});

world.onTrainWarning = () => sfx.ding();
world.onHonk = (fog) => sfx.honk(fog);

// ----------------------------------------------------------------- characters
async function setCharacter(id) {
  let inst;
  try {
    inst = await chars.loadCharacter(id);
  } catch (err) {
    console.warn(err);
    showToast('Could not load that character', err.message, true);
    id = 'chicken';
    inst = await chars.loadCharacter(id);
  }
  if (player.inst && player.inst !== inst) player.inst.root.removeFromParent();
  player.inst = inst;
  inst.root.position.set(0, 0, 0);
  inst.root.rotation.set(0, 0, 0);
  inst.root.scale.set(1, 1, 1);
  inst.root.visible = true;
  player.holder.add(inst.root);
  selectedId = id;
  storage.setSelected(id);
}

async function renderCharacterGrid() {
  const list = await chars.listCharacters();
  const grid = $('char-grid');
  grid.innerHTML = '';
  if (!list.some((c) => c.id === selectedId)) selectedId = 'chicken';
  for (const c of list) {
    const rec = storage.getRecord(c.id);
    const card = document.createElement('div');
    card.className = 'card' + (c.id === selectedId ? ' selected' : '');
    card.title = c.name;
    if (c.id === selectedId) selectedName = c.name;
    const img = document.createElement('img');
    img.alt = c.name;
    if (c.thumb) img.src = c.thumb;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = c.name;
    const stat = document.createElement('div');
    stat.className = 'stat';
    stat.innerHTML = `Best <b>${rec.best}</b> · ${rec.runs} run${rec.runs === 1 ? '' : 's'}`;
    card.append(img, name, stat);
    if (c.kind !== 'builtin') {
      const kind = document.createElement('span');
      kind.className = `kind ${c.kind}`;
      kind.textContent = c.kind.toUpperCase();
      const tools = document.createElement('div');
      tools.className = 'tools';
      const rot = document.createElement('button');
      rot.className = 'rot';
      rot.title = 'Turn model 90°';
      rot.textContent = '⟳';
      rot.onclick = async (e) => {
        e.stopPropagation();
        await chars.rotateCharacter(c.id);
        if (c.id === selectedId) await setCharacter(c.id);
        renderCharacterGrid();
      };
      const del = document.createElement('button');
      del.title = 'Delete character';
      del.textContent = '✕';
      del.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${c.name}" and its records?`)) return;
        const wasSelected = c.id === selectedId;
        if (wasSelected) player.inst = null;
        await chars.removeCharacter(c.id);
        if (wasSelected) await setCharacter('chicken');
        renderCharacterGrid();
      };
      tools.append(rot, del);
      card.append(kind, tools);
    }
    card.onclick = async () => {
      selectedName = c.name;
      await withLoading(`Loading ${c.name}…`, () => setCharacter(c.id));
      renderCharacterGrid();
    };
    grid.appendChild(card);
  }
}

async function importFiles(files) {
  let lastId = null;
  for (const file of files) {
    try {
      lastId = await withLoading(`Importing ${file.name}…`, () => chars.importFile(file));
      showToast(`Added ${file.name}`, 'Your character is ready to play!');
    } catch (err) {
      console.error(err);
      showToast(`Couldn't import ${file.name}`, err.message || String(err), true);
    }
  }
  if (lastId) await setCharacter(lastId);
  await renderCharacterGrid();
}

async function withLoading(text, fn) {
  $('loading-text').textContent = text;
  $('loading').classList.remove('hidden');
  // Let the overlay paint before heavy parsing blocks the thread.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    return await fn();
  } finally {
    $('loading').classList.add('hidden');
  }
}

// ----------------------------------------------------------------------- runs
function resetRun() {
  world.reset();
  weather.reset();
  for (const e of effects) e.mesh.removeFromParent();
  effects.length = 0;
  if (eagleMesh) eagleMesh.visible = false;
  death = null;
  Object.assign(player, { x: 0, z: 0, y: 0, row: 0, hop: null, queued: null, yaw: Math.PI, platform: null, score: 0, moved: false, announcedBest: false, idle: 0 });
  player.holder.position.set(0, 0, 0);
  player.holder.rotation.set(0, Math.PI, 0);
  if (player.inst) {
    player.inst.root.scale.set(1, 1, 1);
    player.inst.root.position.set(0, 0, 0);
    player.inst.root.rotation.set(0, 0, 0);
    player.inst.root.visible = true;
    player.holder.add(player.inst.root);
  }
  focus.set(0, 0, 0);
  player.bestBefore = storage.getRecord(selectedId).best;
  if (weatherMode !== 'dynamic') {
    weather.enabled = false;
    weather.set(weatherMode);
    weather.blend = 1;
    weather.params = weather.to;
  } else {
    weather.enabled = true;
  }
  updateHud();
  updateWeatherBadge();
}

function startGame() {
  sfx.unlock();
  resetRun();
  state = 'playing';
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('paused').classList.add('hidden');
  $('hud').classList.remove('hidden');
}

async function showMenu() {
  state = 'menu';
  $('gameover').classList.add('hidden');
  $('paused').classList.add('hidden');
  $('hud').classList.add('hidden');
  resetRun();
  $('menu').classList.remove('hidden');
  await renderCharacterGrid();
}

function setPaused(p) {
  if (p && state === 'playing') {
    state = 'paused';
    $('paused').classList.remove('hidden');
  } else if (!p && state === 'paused') {
    state = 'playing';
    $('paused').classList.add('hidden');
  }
}

function die(type) {
  if (state !== 'playing') return;
  state = 'dead';
  const lane = world.lane(player.row);
  death = { type, t: 0, vx: lane && lane.type === 'rail' ? lane.dir * 18 : 0, shown: false };
  player.hop = null;
  const root = player.inst.root;
  switch (type) {
    case 'car':
      sfx.squash();
      root.scale.set(1.35, 0.15, 1.35);
      puff(player.x, 0.3, player.z, 0xffffff, 8, 2);
      break;
    case 'train':
      sfx.squash();
      break;
    case 'splash':
    case 'swept':
      sfx.splash();
      puff(player.x, 0, player.z, 0xe1f5fe, 14, 3);
      break;
    case 'eagle':
      sfx.eagle();
      if (!eagleMesh) {
        eagleMesh = M.eagle();
        scene.add(eagleMesh);
      }
      eagleMesh.visible = true;
      break;
    case 'lightning':
      sfx.zap();
      puff(player.x, 0.4, player.z, 0x212121, 16, 2);
      break;
  }
  const { record, isNewBest } = storage.saveRun(selectedId, player.score);
  death.record = record;
  death.isNewBest = isNewBest && player.score > 0;
}

function showGameOver() {
  $('death-reason').textContent = DEATH_TEXT[death.type] || 'Game over';
  $('final-score').textContent = player.score;
  $('new-record').classList.toggle('hidden', !death.isNewBest);
  $('char-record').textContent = `${selectedName}'s furthest: ${death.record.best} · ${death.record.runs} run${death.record.runs === 1 ? '' : 's'}`;
  $('hud').classList.add('hidden');
  $('gameover').classList.remove('hidden');
  if (death.isNewBest) sfx.record();
}

// ---------------------------------------------------------------------- input
function tryHop(name) {
  if (state !== 'playing') return;
  const d = DIRS[name];
  if (player.hop) {
    player.queued = name;
    return;
  }
  const targetRow = player.row + d.dr;
  const lane = world.lane(targetRow);
  let tx = player.x + d.dc;
  const onLogs = lane && lane.type === 'river' && !lane.lily;
  if (!onLogs) tx = Math.round(tx);
  const col = Math.round(tx);
  player.yaw = d.yaw;
  if (world.isBlocked(targetRow, col) || tx < COL_MIN - 0.45 || tx > COL_MAX + 0.45) {
    // Bump in place
    player.inst.root.scale.set(1.1, 0.85, 1.1);
    return;
  }
  player.moved = true;
  player.idle = 0;
  player.platform = null;
  player.hop = { fx: player.x, fz: player.z, fy: player.y, tx, tz: -targetRow, row: targetRow, t: 0 };
  sfx.hop();
}

const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (KEYS[e.code]) {
    e.preventDefault();
    if (!e.repeat) tryHop(KEYS[e.code]);
    return;
  }
  if (e.code === 'Escape') {
    if (state === 'playing') setPaused(true);
    else if (state === 'paused') setPaused(false);
  }
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
    e.preventDefault();
    if (state === 'dead' && death && death.shown) startGame();
    else if (state === 'menu') startGame();
    else if (state === 'paused') setPaused(false);
  }
});

let touch = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  touch = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  touch = null;
  if (Math.hypot(dx, dy) < 25) return tryHop('up');
  if (Math.abs(dx) > Math.abs(dy)) tryHop(dx > 0 ? 'right' : 'left');
  else tryHop(dy > 0 ? 'down' : 'up');
});

$('btn-play').onclick = startGame;
$('btn-retry').onclick = startGame;
$('btn-menu').onclick = showMenu;
$('btn-pause').onclick = () => setPaused(true);
$('btn-resume').onclick = () => setPaused(false);
$('btn-quit').onclick = () => {
  if (player.score > 0) storage.saveRun(selectedId, player.score);
  showMenu();
};
$('btn-mute').onclick = () => {
  sfx.setMuted(!sfx.muted);
  $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
};
$('file-input').onchange = (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  importFiles(files);
};
$('weather-mode').value = weatherMode;
$('weather-mode').onchange = (e) => {
  weatherMode = e.target.value;
  localStorage.setItem('crossy.weatherMode', weatherMode);
  // Preview the choice behind the menu.
  if (weatherMode === 'dynamic') weather.set('clear');
  else weather.set(weatherMode);
};

window.addEventListener('dragover', (e) => {
  if (state !== 'menu') return;
  e.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dragging');
});
window.addEventListener('drop', (e) => {
  document.body.classList.remove('dragging');
  if (state !== 'menu') return;
  e.preventDefault();
  const files = [...e.dataTransfer.files].filter((f) => /\.(fbx|vrm)$/i.test(f.name));
  if (files.length) importFiles(files);
  else showToast('Only .fbx and .vrm files can be imported', '', true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

// ------------------------------------------------------------------------ HUD
let toastTimer = 0;
function showToast(title, detail = '', error = false) {
  const t = $('toast');
  t.innerHTML = '';
  t.append(title);
  if (detail) {
    const s = document.createElement('small');
    s.textContent = detail;
    t.append(s);
  }
  t.classList.toggle('error', error);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), error ? 5000 : 3200);
}

function updateHud() {
  $('score').textContent = player.score;
  const best = Math.max(player.bestBefore, player.score);
  $('best').textContent = `TOP ${best} · ${selectedName}`;
}

function updateWeatherBadge() {
  const def = weather.def;
  $('weather-icon').textContent = def.icon;
  $('weather-label').textContent = def.label;
}

// -------------------------------------------------------------------- effects
const puffGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
function puff(x, y, z, color, count, speed) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(puffGeo, material);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    effects.push({
      mesh,
      vx: Math.cos(a) * speed * Math.random(),
      vy: 1 + Math.random() * speed,
      vz: Math.sin(a) * speed * Math.random(),
      life: 0.6 + Math.random() * 0.4,
      t: 0,
    });
  }
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    e.vy -= 9 * dt;
    e.mesh.position.x += e.vx * dt;
    e.mesh.position.y = Math.max(0, e.mesh.position.y + e.vy * dt);
    e.mesh.position.z += e.vz * dt;
    e.mesh.scale.setScalar(1 - e.t / e.life);
    if (e.t >= e.life) {
      e.mesh.removeFromParent();
      effects.splice(i, 1);
    }
  }
}

// ----------------------------------------------------------------------- loop
function standHeight(row, x) {
  const lane = world.lane(row);
  if (!lane || lane.type !== 'river') return 0;
  return lane.lily ? 0.04 : 0.22;
}

function land() {
  const h = player.hop;
  player.hop = null;
  player.x = h.tx;
  player.z = h.tz;
  player.row = h.row;
  player.inst.root.scale.set(1.15, 0.8, 1.15);
  if (player.row > player.score) {
    player.score = player.row;
    if (!player.announcedBest && player.bestBefore > 0 && player.score > player.bestBefore) {
      player.announcedBest = true;
      showToast('🏆 New best for ' + selectedName + '!');
      sfx.record();
    }
    updateHud();
  }
  const lane = world.lane(player.row);
  if (lane && lane.type === 'river') {
    const p = world.platformAt(player.row, player.x);
    if (!p) return die('splash');
    player.platform = p;
    if (p.pad) player.x = p.x;
    player.offset = player.x - p.x;
  }
  player.y = standHeight(player.row, player.x);
  if (player.queued) {
    const q = player.queued;
    player.queued = null;
    tryHop(q);
  }
}

function updatePlayer(dt) {
  const root = player.inst.root;
  // Recover from squash/stretch
  root.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 14));

  if (player.hop) {
    const h = player.hop;
    h.t = Math.min(1, h.t + dt / HOP_TIME);
    player.x = h.fx + (h.tx - h.fx) * h.t;
    player.z = h.fz + (h.tz - h.fz) * h.t;
    const ty = standHeight(h.row, h.tx);
    player.y = h.fy + (ty - h.fy) * h.t + Math.sin(Math.PI * h.t) * HOP_HEIGHT;
    root.scale.set(0.9, 1.15, 0.9);
    if (h.t >= 1) land();
  } else if (player.platform) {
    // Ride the log
    player.x = player.platform.x + player.offset;
    if (player.x < COL_MIN - 0.7 || player.x > COL_MAX + 0.7) return die('swept');
  }
  if (state !== 'playing') return;

  const rowNow = Math.round(-player.z);
  const hazard = world.hazardAt(rowNow, player.x);
  if (hazard) return die(hazard);

  player.idle += dt;
  if (player.z - focus.z > EAGLE_DISTANCE || player.idle > IDLE_LIMIT) return die('eagle');
}

function updateDeath(dt) {
  death.t += dt;
  const root = player.inst.root;
  switch (death.type) {
    case 'train':
      player.x += death.vx * dt;
      player.y += 4 * dt;
      root.rotation.z += 12 * dt;
      break;
    case 'splash':
    case 'swept':
      player.y -= 1.5 * dt;
      if (player.y < -0.9) root.visible = false;
      break;
    case 'lightning':
      root.scale.setScalar(Math.max(0.01, 1 - death.t * 2));
      if (death.t > 0.5) root.visible = false;
      break;
    case 'eagle': {
      const t = death.t;
      if (t < 0.6) {
        const k = t / 0.6;
        eagleMesh.position.set(player.x, 4 - 3.2 * k, player.z - 12 * (1 - k));
      } else {
        const k = (t - 0.6) / 0.8;
        eagleMesh.position.set(player.x, 0.8 + k * 6, player.z + k * 14);
        player.y = eagleMesh.position.y - 0.7;
        player.z = eagleMesh.position.z;
      }
      eagleMesh.rotation.set(0, Math.PI, 0);
      break;
    }
  }
  if (!death.shown && death.t > 1.1) {
    death.shown = true;
    showGameOver();
  }
}

function updateCamera(dt) {
  if (state === 'playing' && player.moved) {
    const creep = 0.35 + Math.min(0.5, player.score * 0.003);
    focus.z -= creep * dt;
  }
  if (state === 'playing' || state === 'menu') {
    if (player.z < focus.z) focus.z += (player.z - focus.z) * Math.min(1, dt * 3);
    const tx = THREE.MathUtils.clamp(player.x * 0.6, -3, 3);
    focus.x += (tx - focus.x) * Math.min(1, dt * 3);
  }
  // Look a little ahead so more of the upcoming lanes are visible.
  lookAt.copy(focus).add(LOOK_AHEAD);
  camera.position.copy(lookAt).add(CAM_OFFSET);
  camera.lookAt(lookAt);
  sun.position.copy(focus).add(new THREE.Vector3(-5, 14, 6));
  sun.target.position.copy(focus);
}

const WHITE = new THREE.Color(0xffffff);
function applyWeather() {
  const p = weather.params;
  const flash = weather.flash;
  scene.background.copy(p.sky).lerp(WHITE, flash * 0.6);
  scene.fog.color.copy(scene.background);
  scene.fog.near = CAM_DIST + p.fogNear;
  scene.fog.far = CAM_DIST + Math.max(p.fogFar, p.fogNear + 1);
  sun.intensity = 2.2 * p.lightI + flash * 2;
  sun.color.copy(p.light);
  hemi.intensity = 1.6 * (0.25 + p.lightI * 0.75) + flash * 2;
  world.applySnow(weather.snowCover);
  $('weather-fill').style.width = weather.enabled ? `${Math.min(100, (weather.timeLeft / 38) * 100)}%` : '100%';
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state !== 'paused') {
    world.ensure(player.row);
    world.update(dt, weather, player.row);
    weather.update(dt, focus, state === 'playing');
    if (state === 'playing') updatePlayer(dt);
    else if (state === 'dead') updateDeath(dt);
    updateEffects(dt);
    if (player.inst) player.inst.update(dt);
    updateCamera(dt);
  }
  applyWeather();

  // Holder follows logical position; smooth facing.
  player.holder.position.set(player.x, player.y, player.z);
  let dy = player.yaw - player.holder.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.holder.rotation.y += dy * Math.min(1, dt * 20);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------- start
(async function init() {
  await setCharacter(selectedId);
  resetRun();
  if (weatherMode !== 'dynamic') weather.set(weatherMode);
  await renderCharacterGrid();
  updateHud();
  requestAnimationFrame(frame);
})();

// Handy for debugging from the browser console.
window.__crossy = { weather, world, player, startGame };

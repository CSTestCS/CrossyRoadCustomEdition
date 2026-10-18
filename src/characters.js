// Character registry: built-in voxel characters plus imported FBX / VRM models.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { BUILTIN_CHARACTERS } from './models.js';
import * as storage from './storage.js';

const TARGET_HEIGHT = 1.25; // world units (one tile = 1); humanoids are thin so go a bit taller
const MAX_FOOTPRINT = 1.0;

// FBX files often reference texture files that weren't imported alongside
// them. Swap those URLs for a white pixel so the material color still shows.
const WHITE_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const manager = new THREE.LoadingManager();
manager.setURLModifier((url) =>
  url.startsWith('data:') || url.startsWith('blob:') ? url : WHITE_PIXEL
);

/**
 * A character ready to drop into the scene.
 * `root` is what the game moves/rotates/squashes; `update(dt)` drives
 * animations (FBX clips, VRM spring bones).
 */
class CharacterInstance {
  constructor(model, { yaw = 0, mixer = null, vrm = null } = {}) {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group(); // per-model facing correction
    this.pivot.rotation.y = yaw;
    this.root.add(this.pivot);
    this.pivot.add(normalize(model));
    this.mixer = mixer;
    this.vrm = vrm;
    this.model = model;
  }

  setYaw(yaw) {
    this.pivot.rotation.y = yaw;
  }

  update(dt) {
    if (this.mixer) this.mixer.update(dt);
    if (this.vrm) this.vrm.update(dt);
  }

  dispose() {
    this.root.removeFromParent();
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
      return;
    }
    this.model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
        m.dispose();
      }
    });
  }
}

/** Scales a model to character size, centers it and puts its feet on y = 0. */
function normalize(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) throw new Error('The model has no visible geometry.');
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let s = TARGET_HEIGHT / Math.max(size.y, 1e-6);
  const footprint = Math.max(size.x, size.z) * s;
  if (footprint > MAX_FOOTPRINT) s *= MAX_FOOTPRINT / footprint;
  if (!Number.isFinite(s) || s <= 0) throw new Error('The model has an invalid size.');

  const holder = new THREE.Group();
  holder.add(object);
  holder.scale.setScalar(s);
  holder.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Skinned meshes are often culled wrongly after rescaling.
      o.frustumCulled = false;
    }
  });
  return holder;
}

function pickIdleClip(clips) {
  return clips.find((c) => /idle|breath|stand/i.test(c.name)) || clips[0];
}

async function loadFBX(buffer, yaw) {
  const loader = new FBXLoader(manager);
  let object;
  try {
    object = loader.parse(buffer, '');
  } catch (err) {
    throw new Error(`Couldn't read the FBX file (${err.message || err}).`);
  }
  let mixer = null;
  if (object.animations && object.animations.length) {
    mixer = new THREE.AnimationMixer(object);
    mixer.clipAction(pickIdleClip(object.animations)).play();
  }
  return new CharacterInstance(object, { yaw, mixer });
}

function relaxArms(vrm) {
  // VRMs load in a T-pose; lower the arms so they look natural while hopping.
  const h = vrm.humanoid;
  if (!h) return;
  const set = (bone, z) => {
    const node = h.getNormalizedBoneNode(bone);
    if (node) node.rotation.z = z;
  };
  set('leftUpperArm', -1.25);
  set('rightUpperArm', 1.25);
  set('leftLowerArm', -0.15);
  set('rightLowerArm', 0.15);
}

async function loadVRM(buffer, yaw) {
  const loader = new GLTFLoader(manager);
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise((resolve, reject) =>
    loader.parse(buffer, '', resolve, (err) =>
      reject(new Error(`Couldn't read the VRM file (${err.message || err}).`))
    )
  );
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error("That file doesn't contain VRM data.");
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // VRM 0.x faces -Z; make every VRM face +Z
  relaxArms(vrm);
  vrm.update(0);
  return new CharacterInstance(vrm.scene, { yaw, vrm });
}

// ------------------------------------------------------------------ thumbnails

let thumb = null;
function thumbRig() {
  if (thumb) return thumb;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(160, 160, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(1.4, 1.2, 2.3);
  camera.lookAt(0, 0.45, 0);
  thumb = { renderer, scene, camera };
  return thumb;
}

function renderThumbnail(instance) {
  const { renderer, scene, camera } = thumbRig();
  const parent = instance.root.parent;
  const saved = instance.root.rotation.y;
  instance.root.rotation.y = 0;
  scene.add(instance.root);
  instance.update(0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  instance.root.rotation.y = saved;
  scene.remove(instance.root);
  if (parent) parent.add(instance.root);
  return url;
}

// -------------------------------------------------------------------- registry

const builtinThumbs = new Map();
const cache = new Map(); // id -> CharacterInstance for imported models
const CACHE_LIMIT = 3;

function remember(id, instance) {
  cache.delete(id);
  cache.set(id, instance);
  while (cache.size > CACHE_LIMIT) {
    const [oldId, old] = cache.entries().next().value;
    cache.delete(oldId);
    old.dispose();
  }
}

/** All selectable characters, built-ins first. */
export async function listCharacters() {
  const builtins = BUILTIN_CHARACTERS.map((c) => {
    if (!builtinThumbs.has(c.id)) {
      builtinThumbs.set(c.id, renderThumbnail(new CharacterInstance(c.build())));
    }
    return { id: c.id, name: c.name, kind: 'builtin', thumb: builtinThumbs.get(c.id) };
  });
  const custom = (await storage.listModels()).map((m) => ({
    id: m.id,
    name: m.name,
    kind: m.type,
    thumb: m.thumb,
  }));
  return [...builtins, ...custom];
}

export async function loadCharacter(id) {
  const builtin = BUILTIN_CHARACTERS.find((c) => c.id === id);
  if (builtin) return new CharacterInstance(builtin.build());
  if (cache.has(id)) {
    const inst = cache.get(id);
    remember(id, inst);
    return inst;
  }
  const entry = await storage.getModel(id);
  if (!entry) throw new Error('Character not found.');
  const inst = entry.type === 'vrm' ? await loadVRM(entry.data, entry.yaw || 0) : await loadFBX(entry.data, entry.yaw || 0);
  remember(id, inst);
  return inst;
}

function detectType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'fbx') return 'fbx';
  if (ext === 'vrm') return 'vrm';
  return null;
}

function displayName(file) {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return (base || 'Custom').slice(0, 24);
}

/** Imports an .fbx or .vrm file and stores it. Returns the new character id. */
export async function importFile(file) {
  const type = detectType(file);
  if (!type) throw new Error(`${file.name}: only .fbx and .vrm files are supported.`);
  const data = await file.arrayBuffer();
  const inst = type === 'vrm' ? await loadVRM(data, 0) : await loadFBX(data, 0);
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let name = displayName(file);
  if (type === 'vrm' && inst.vrm.meta) {
    name = (inst.vrm.meta.name || inst.vrm.meta.title || name).slice(0, 24);
  }
  const entry = { id, name, type, data, yaw: 0, thumb: renderThumbnail(inst), createdAt: Date.now() };
  await storage.putModel(entry);
  remember(id, inst);
  return id;
}

/** Turns an imported model 90° (for models that don't face forward). */
export async function rotateCharacter(id) {
  const entry = await storage.getModel(id);
  if (!entry) return;
  const yaw = ((entry.yaw || 0) + Math.PI / 2) % (Math.PI * 2);
  const inst = await loadCharacter(id);
  inst.setYaw(yaw);
  await storage.putModel({ ...entry, yaw, thumb: renderThumbnail(inst) });
}

export async function removeCharacter(id) {
  if (cache.has(id)) {
    cache.get(id).dispose();
    cache.delete(id);
  }
  await storage.deleteModel(id);
  storage.clearRecord(id);
}

export function isBuiltin(id) {
  return BUILTIN_CHARACTERS.some((c) => c.id === id);
}

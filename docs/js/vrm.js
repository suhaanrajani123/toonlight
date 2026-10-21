// vrm.js — load your own 3D model files and make them behave like the built-in characters.
//
// Supported: .vrm (VRoid Studio etc.), .glb / .gltf (Sketchfab, Blender, Mixamo→Blender export).
// Use it by adding `model: 'models/your-file.glb'` to a character in roster.js, or by
// dragging a file onto the stage to try it out.
//
// What gets animated automatically (when the model has it):
//   head turning toward your cursor   → a bone named like "Head" / "mixamorig:Head"
//   mouth moving with the voice       → VRM "aa" expression, or a morph target named jawOpen / mouthOpen / viseme_aa / A / あ
//   blinking                          → VRM "blink", or morphs named eyeBlinkLeft/Right / blink / Blink
//   moods                             → VRM expressions (happy, sad, angry, surprised, relaxed) or morphs with those names
//   built-in animation                → the model's first animation clip (often "Idle"), looped
//   T-pose arms                       → lowered to the sides if there's no animation
//   hand gestures (VRM models)        → the same wave / think / talking-with-hands / tada / shrug
//                                       as the built-in characters, plus relaxed fingers and breathing

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from 'three-vrm';
import { Gestures } from './gestures.js';

const VRM_MOODS = { happy: 'happy', sad: 'sad', angry: 'angry', surprised: 'surprised', thinking: 'relaxed' };
const MOUTH = /^(jawopen|mouthopen|mouth_open|viseme_aa|vrc\.v_aa|v_aa|aa|a|あ|mouth_a|mth_a)$/i;
const BLINK = /^(blink|eyeblink|eyesclosed|eye_close|blink_both|eyeblinkleft|eyeblinkright|まばたき|vrc\.blink)$/i;
const MOODS_RE = { happy: /^(happy|joy|smile|fun|mouthsmile)$/i, sad: /^(sad|sorrow|mouthfrown)$/i, angry: /^(angry|anger)$/i, surprised: /^(surprised|surprise|shock)$/i };

const HEAD_RE = /(^|[:_ .])head$/i;
const ARM_RE = { left: /(left|_l$|\.l$|^l_).*(upper)?arm$|(upper)?arm.*(left|_l$|\.l$)/i, right: /(right|_r$|\.r$|^r_).*(upper)?arm$|(upper)?arm.*(right|_r$|\.r$)/i };

// Collect every morph target in the model: name → list of [mesh, index].
function morphIndex(scene) {
  const map = new Map();
  scene.traverse((o) => {
    if (!o.morphTargetDictionary) return;
    for (const [name, i] of Object.entries(o.morphTargetDictionary)) {
      const key = name.toLowerCase().replace(/^.*\./, (m) => (m.startsWith('vrc.') ? m : ''));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push([o, i]);
    }
  });
  return map;
}

function morphSetter(map, re) {
  const hits = [...map.entries()].filter(([k]) => re.test(k)).flatMap(([, v]) => v);
  return hits.length ? (v) => hits.forEach(([m, i]) => (m.morphTargetInfluences[i] = v)) : null;
}

// ---------- arms and gestures for VRM models (VRoid Studio) ----------
//
// The built-in characters' gestures (gestures.js) are written for arms that hang straight
// down. A VRM's arms are stored in a T-pose instead, so each frame we take the gesture's
// arm angles and turn them into VRM bone rotations: first swing the arm down from the
// T-pose, then apply the gesture on top, in the same directions the built-in arms use.
// Older VRM 0.x files (most VRoid exports) face the other way, so their rotations are mirrored.

const ARM_SIDES = { L: 'left', R: 'right' };
const DOWN = { L: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)), R: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)) };
const UP = { L: DOWN.L.clone().invert(), R: DOWN.R.clone().invert() };
// arms resting a little away from the body (VRoid outfits are wider than the built-in bodies)
const REST = [[0.04, 0, 0.2], [-0.2, 0, -0.06], [0, 0, 0]];
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];

function vrmArms(vrm) {
  const h = vrm.humanoid;
  const bone = (n) => h.getNormalizedBoneNode(n);
  const mirror = vrm.meta?.metaVersion === '0';
  const fix = (q) => (mirror ? q.set(-q.x, q.y, -q.z, q.w) : q);

  const bones = {}, arms = {};
  for (const [k, side] of Object.entries(ARM_SIDES)) {
    bones[k] = ['UpperArm', 'LowerArm', 'Hand'].map((n) => bone(`${side}${n}`));
    if (bones[k].some((b) => !b)) return null;
    const s = k === 'L' ? 1 : -1;
    const e = (r) => ({ rotation: new THREE.Euler(r[0], s * r[1], s * r[2]) });
    arms[k] = { shoulder: e(REST[0]), elbow: e(REST[1]), hand: e(REST[2]) };
  }

  // relaxed, slightly curled fingers instead of the stiff T-pose hand
  for (const [k, side] of Object.entries(ARM_SIDES)) {
    const s = k === 'L' ? 1 : -1;
    FINGERS.forEach((f, i) => ['Proximal', 'Intermediate', 'Distal'].forEach((j, n) => {
      const b = bone(`${side}${f}${j}`);
      if (b) b.quaternion.copy(fix(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * (0.22 + n * 0.1 + i * 0.04)))));
    }));
    const thumb = bone(`${side}ThumbProximal`) || bone(`${side}ThumbMetacarpal`);
    if (thumb) thumb.quaternion.copy(fix(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 0.35, 0))));
  }

  const spine = bone('chest') || bone('spine');
  const q = new THREE.Quaternion(), tmp = new THREE.Quaternion(), eu = new THREE.Euler();
  return {
    arms,
    apply(t) {
      for (const k of ['L', 'R']) {
        const [upper, lower, hand] = bones[k], a = arms[k];
        upper.quaternion.copy(fix(q.setFromEuler(a.shoulder.rotation).multiply(DOWN[k])));
        lower.quaternion.copy(fix(q.copy(UP[k]).multiply(tmp.setFromEuler(a.elbow.rotation)).multiply(DOWN[k])));
        hand.quaternion.copy(fix(q.copy(UP[k]).multiply(tmp.setFromEuler(a.hand.rotation)).multiply(DOWN[k])));
      }
      // breathing
      if (spine) spine.quaternion.copy(fix(q.setFromEuler(eu.set(Math.sin(t * 1.8) * 0.012, 0, 0))));
    },
  };
}

function prepare(scene) {
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned meshes can vanish at the screen edge otherwise
    }
  });
}

// Scale to the height of the built-in characters, centre it, stand it on the platform.
function fit(object, height = 2.3) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(size.y, 0.0001);
  object.scale.multiplyScalar(s);
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  const c = box.getCenter(new THREE.Vector3());
  object.position.x -= c.x;
  object.position.z -= c.z;
  object.position.y -= box.min.y;
}

export async function loadModel(url) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm || null;
  const scene = vrm ? vrm.scene : gltf.scene;
  if (vrm) { VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.rotateVRM0(vrm); }
  prepare(scene);

  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(scene);
  root.add(holder);

  // --- find the head and arms ---
  let head = null, armL = null, armR = null;
  if (vrm?.humanoid) {
    head = vrm.humanoid.getNormalizedBoneNode('head');
    armL = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    armR = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
  } else {
    scene.traverse((o) => {
      if (!o.isBone) return;
      const n = o.name.replace(/mixamorig:?/i, '');
      if (!head && HEAD_RE.test(n)) head = o;
      if (!armL && /upper/i.test(n) && ARM_RE.left.test(n)) armL = o;
      if (!armR && /upper/i.test(n) && ARM_RE.right.test(n)) armR = o;
    });
  }

  // --- animation ---
  let mixer = null, animatesHead = false, body = null, gestures = null;
  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(scene);
    const clip = gltf.animations.find((a) => /idle|breath|stand/i.test(a.name)) || gltf.animations[0];
    mixer.clipAction(clip).play();
    animatesHead = !!head && clip.tracks.some((tr) => tr.name.startsWith(`${head.name}.`) && tr.name.endsWith('.quaternion'));
  } else if (vrm?.humanoid && (body = vrmArms(vrm))) {
    gestures = new Gestures(body.arms, { primary: 'R' });
    body.apply(0); // arms down before measuring the model's size
  } else if (vrm && armL && armR) {
    const s = vrm.meta?.metaVersion === '0' ? -1 : 1;
    armL.rotation.z = -1.2 * s;
    armR.rotation.z = 1.2 * s;
  }
  if (vrm) vrm.update(0);

  fit(holder);
  // hair and clothes physics: start from the resized model, or they fly outward
  if (vrm?.springBoneManager) { root.updateMatrixWorld(true); vrm.springBoneManager.setInitState?.(); vrm.springBoneManager.reset?.(); }

  // --- face controls ---
  let setMouth, setBlink, setMood;
  if (vrm?.expressionManager) {
    const em = vrm.expressionManager;
    setMouth = (v) => em.setValue('aa', v);
    setBlink = (v) => em.setValue('blink', v);
    setMood = (mood, w) => Object.entries(VRM_MOODS).forEach(([m, name]) => em.setValue(name, m === mood ? w : 0));
  } else {
    const map = morphIndex(scene);
    setMouth = morphSetter(map, MOUTH) || (() => {});
    setBlink = morphSetter(map, BLINK) || (() => {});
    const moodSetters = Object.fromEntries(Object.entries(MOODS_RE).map(([m, re]) => [m, morphSetter(map, re)]));
    setMood = (mood, w) => Object.entries(moodSetters).forEach(([m, fn]) => fn?.(m === mood ? w : 0));
  }

  const headRest = head ? head.quaternion.clone() : null;
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();

  return {
    root, head: head || root, rootBaseY: 0, speaking: false, thinking: false, mood: 'neutral', mouthOpen: 0,
    look: new THREE.Vector2(), nextBlink: 2, blinkT: undefined, isModel: true, gestures,
    setMood(m) { this.mood = m; },
    // wave, think, explain, both, tada, shrug, surprised, hips (see gestures.js)
    gesture(name) { gestures?.play(name); },
    update(t, dt, { mouth = 0, look } = {}) {
      mixer?.update(dt);
      if (look) this.look.lerp(look, 0.08);
      this.mouthOpen += (mouth - this.mouthOpen) * Math.min(1, dt * 25);

      if (head && headRest) {
        // turn the head on top of whatever the animation is doing
        if (!animatesHead) head.quaternion.copy(headRest); // otherwise the animation already reset it this frame
        euler.set(-this.look.y * 0.2 + (this.speaking ? Math.sin(t * 5.5) * 0.03 : 0), this.look.x * 0.4, this.thinking ? 0.15 : 0);
        head.quaternion.multiply(turn.setFromEuler(euler));
      }

      setMouth(this.mouthOpen);
      setMood(this.mood, 0.6);
      this.nextBlink -= dt;
      if (this.nextBlink < 0) { this.blinkT = 0; this.nextBlink = 2 + Math.random() * 3.5; }
      let b = 0;
      if (this.blinkT !== undefined) {
        this.blinkT += dt;
        b = this.blinkT < 0.08 ? this.blinkT / 0.08 : Math.max(0, 1 - (this.blinkT - 0.08) / 0.1);
        if (this.blinkT > 0.2) this.blinkT = undefined;
      }
      setBlink(b);
      if (!mixer) root.position.y = Math.sin(t * 1.8) * 0.01;
      if (body) {
        gestures.reset();
        // a gentle sway so the arms never look frozen
        body.arms.L.shoulder.rotation.z += Math.sin(t * 1.8) * 0.012;
        body.arms.R.shoulder.rotation.z -= Math.sin(t * 1.8 + 0.6) * 0.012;
        gestures.update(t, dt, this);
        body.apply(t);
      }
      vrm?.update(dt);
      // the stage's pop-in squashes the character; keep hair physics still until it's over
      if (vrm?.springBoneManager && Math.abs(root.scale.y - 1) > 0.001) vrm.springBoneManager.reset?.();
    },
  };
}

export const loadVRM = loadModel; // old name

// toonkit.js — the shared building blocks every Toonlight character is made from.
//
// Characters are built in code from simple shapes (spheres, capsules, cones),
// drawn with cel-shading ("toon" lighting with hard steps) and a dark outline,
// which is the classic anime/cartoon look. Every character ends up as a Rig:
// one object that knows how to blink, move its mouth, show a mood and idle.

import * as THREE from 'three';
import { Gestures } from './gestures.js';

export const INK = 0x2a2140; // outline + line-art colour (deep violet, not pure black)

// ---------- materials ----------

let gradient;
function gradientMap() {
  if (gradient) return gradient;
  // 3 brightness steps = shadow, mid-tone, light. NearestFilter keeps the steps hard.
  const data = new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

// STYLE 'real' = physically-based shading (looks like a 3D figure: soft light, reflections, shadows).
// STYLE 'toon' = the original flat cel-shaded look with ink outlines.
export const STYLE = 'real';

// Surface material. opts.rough (0 = mirror, 1 = chalk) and opts.metal (0/1) control the finish.
export function toon(color, opts = {}) {
  const { rough = 0.55, metal = 0, sheen = 0.15, ...rest } = opts;
  if (STYLE === 'toon') return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...rest });
  // sheen = soft glow at grazing angles (fabric, fur, skin), tinted by the surface's own colour
  const tint = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
  return new THREE.MeshPhysicalMaterial({
    color, roughness: rough, metalness: metal,
    sheen, sheenRoughness: 0.6, sheenColor: tint,
    ...rest,
  });
}
export const metal = (color, rough = 0.28) => toon(color, { rough, metal: 1, sheen: 0 });
export const gloss = (color, opts = {}) => toon(color, { rough: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0, ...opts });
export const skinMat = (color) => toon(color, { rough: 0.5, sheen: 0.25, sheenColor: 0xff9c88, clearcoat: 0.05 });
export const hairMat = (color, opts = {}) => toon(color, { rough: 0.38, sheen: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3, ...opts });
export const fabric = (color) => toon(color, { rough: 0.78, sheen: 0.3 });

// Eyes, pupils, lines: glossy in 'real' mode, unlit in 'toon' mode.
export const flat = (color, opts = {}) =>
  STYLE === 'toon'
    ? new THREE.MeshBasicMaterial({ color, ...opts })
    : new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 0.6, ...opts });
// Things that should never be shaded (sparkle highlights).
export const glow = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, ...opts });

const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

// "Inverted hull" outline: a slightly bigger copy of the mesh, drawn inside-out in ink.
export function outline(mesh, k = 0.045) {
  if (STYLE !== 'toon') return mesh;
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(1 + k);
  o.userData.outline = true;
  mesh.add(o);
  return mesh;
}

// ---------- geometry shortcuts ----------

export const sphere = (r = 1, w = 48, h = 32) => new THREE.SphereGeometry(r, w, h);
export const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 12, 24);
export const cone = (r, h, s = 16) => new THREE.ConeGeometry(r, h, s);
export const cyl = (rt, rb, h, s = 48) => new THREE.CylinderGeometry(rt, rb, h, s);
export const torus = (r, t, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 16, 64, arc);

// part(geometry, material, { pos, rot, scale, ol }) → a positioned mesh, optionally outlined.
export function part(geo, mat, { pos, rot, scale, ol, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = !mat.transparent;
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale !== undefined) Array.isArray(scale) ? m.scale.set(...scale) : m.scale.setScalar(scale);
  if (ol) outline(m, ol === true ? 0.045 : ol);
  if (name) m.name = name;
  return m;
}

export function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => c && g.add(c));
  return g;
}

// A point on the front of a sphere of radius R (sphere centred at origin, facing +z).
export function onSurface(R, x, y, inset = 0) {
  const z = Math.sqrt(Math.max(R * R - x * x - y * y, 0.0001));
  return new THREE.Vector3(x, y, z).multiplyScalar(1 - inset);
}

// A hair lock: a cone that lies along the head surface, base at (x, y) on a sphere
// of radius R, tip flowing in direction `dir` (default: straight down the forehead).
export function hairLock(R, x, y, len, r, mat, { dir = [0, -1, 0], lift = 0.02, flatten = 0.55, ol = 0.05 } = {}) {
  const p = onSurface(R, x, y);
  const n = p.clone().normalize();
  const d = new THREE.Vector3(...dir);
  const tangent = d.sub(n.clone().multiplyScalar(n.dot(d))).normalize();
  const m = part(cone(r, len, 12), mat, { ol });
  m.geometry.translate(0, 0, 0);
  m.scale.set(1, 1, flatten); // squash against the head before turning
  // build a basis: y = tangent (tip direction), z = normal, x = y × z
  const x3 = new THREE.Vector3().crossVectors(tangent, n).normalize();
  const basis = new THREE.Matrix4().makeBasis(x3, tangent, n);
  m.quaternion.setFromRotationMatrix(basis);
  m.position.copy(p).add(n.multiplyScalar(lift)).add(tangent.multiplyScalar(len * 0.42));
  return m;
}

// Turn a group so its +z axis points along the sphere's surface normal.
function faceOutward(obj, p) {
  obj.position.copy(p);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
}

// ---------- face ----------

// Anime eye: tall oval, big coloured iris, sparkle highlight, lash line on top.
function animeEye(s, iris) {
  const g = new THREE.Group();
  g.add(part(sphere(1), flat(0xffffff), { scale: [s, s * 1.3, s * 0.3] }));
  g.add(part(sphere(1), toon(iris), { pos: [0, -s * 0.12, s * 0.12], scale: [s * 0.8, s * 1.08, s * 0.25] }));
  g.add(part(sphere(1), flat(new THREE.Color(iris).multiplyScalar(0.35)), { pos: [0, -s * 0.12, s * 0.2], scale: [s * 0.4, s * 0.58, s * 0.2], name: 'pupil' }));
  g.add(part(sphere(1), glow(0xffffff), { pos: [s * 0.28, s * 0.3, s * 0.3], scale: s * 0.2 }));
  g.add(part(sphere(1), glow(0xffffff), { pos: [-s * 0.25, -s * 0.5, s * 0.28], scale: s * 0.1 }));
  g.add(part(capsule(s * 0.09, s * 1.5), flat(INK), { pos: [0, s * 1.22, s * 0.12], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.5] }));
  return g;
}

// Cartoon eye: big round white with a dot pupil (and optional coloured iris).
function roundEye(s, iris, slit = false) {
  const g = new THREE.Group();
  g.add(part(sphere(1), flat(0xffffff), { scale: [s, s * 1.1, s * 0.45], ol: 0.08 }));
  if (iris) g.add(part(sphere(1), toon(iris), { pos: [0, 0, s * 0.3], scale: [s * 0.65, s * 0.7, s * 0.25] }));
  g.add(part(sphere(1), flat(INK), { pos: [0, 0, s * (iris ? 0.56 : 0.42)], scale: slit ? [s * 0.14, s * 0.55, s * 0.12] : [s * 0.38, s * 0.42, s * 0.15], name: 'pupil' }));
  g.add(part(sphere(1), glow(0xffffff), { pos: [s * 0.22, s * 0.28, s * 0.66], scale: s * 0.14 }));
  return g;
}

// Builds eyes, brows, mouth and blush onto a head of radius R. Returns the face parts.
export function buildFace(head, R, cfg) {
  const e = { style: 'anime', size: 0.16, spacing: 0.26, y: 0.02, iris: 0x6a5acd, ...cfg.eye };
  const eyes = [-1, 1].map((side) => {
    const eg = new THREE.Group();
    const inner = e.style === 'anime' ? animeEye(e.size * R, e.iris) : roundEye(e.size * R, e.iris, e.slit);
    if (side < 0) inner.scale.x = -1; // mirror so the highlight sits on the same side visually
    eg.add(inner);
    faceOutward(eg, onSurface(R, side * e.spacing * R, e.y * R, 0.03));
    head.add(eg);
    return eg;
  });

  const b = { color: INK, y: e.y + e.size * 1.9, w: 0.2, thick: 0.035, ...cfg.brow };
  const brows = [-1, 1].map((side) => {
    const m = part(capsule(b.thick * R, b.w * R), flat(b.color), { rot: [0, 0, Math.PI / 2] });
    const holder = new THREE.Group();
    holder.add(m);
    faceOutward(holder, onSurface(R, side * e.spacing * R, b.y * R, -0.01));
    holder.userData.side = side;
    holder.userData.baseY = holder.position.y;
    head.add(holder);
    return holder;
  });

  const mo = { y: -0.38, w: 0.11, color: 0x6b1f35, ...cfg.mouth };
  const mouth = new THREE.Group();
  const open = part(sphere(1), flat(mo.color), { scale: [mo.w * R, mo.w * 0.8 * R, mo.w * 0.25 * R] });
  const tongue = part(sphere(1), flat(0xff7d93), { pos: [0, -mo.w * 0.35 * R, mo.w * 0.12 * R], scale: [mo.w * 0.55 * R, mo.w * 0.3 * R, mo.w * 0.15 * R] });
  open.add(tongue);
  tongue.scale.divide(open.scale); // keep tongue in head units even though parent is scaled
  tongue.position.divide(open.scale);
  if (mo.teeth) {
    // upper teeth: a white band along the top of the open mouth
    const teeth = part(sphere(1), flat(0xfbf7f2), { pos: [0, mo.w * 0.42 * R, mo.w * 0.14 * R], scale: [mo.w * 0.82 * R, mo.w * 0.26 * R, mo.w * 0.16 * R] });
    open.add(teeth);
    teeth.scale.divide(open.scale);
    teeth.position.divide(open.scale);
  }
  const smile = part(torus(mo.w * 0.85 * R, mo.w * 0.13 * R, Math.PI), flat(INK), { rot: [0, 0, Math.PI] });
  mouth.add(open, smile);
  faceOutward(mouth, onSurface(R, 0, mo.y * R, 0.01));
  head.add(mouth);

  if (cfg.blush !== false) {
    [-1, 1].forEach((side) => {
      const bl = part(sphere(1), glow(0xff8fa8, { transparent: true, opacity: 0.3, depthWrite: false }), { scale: [0.1 * R, 0.05 * R, 0.02 * R] });
      faceOutward(bl, onSurface(R, side * (e.spacing + 0.14) * R, (mo.y + 0.2) * R, -0.005));
      head.add(bl);
    });
  }

  return { eyes, brows, mouth: { group: mouth, open, smile, base: mo.w }, R };
}

// ---------- the rig ----------

// Mood → brow tilt (radians, inner end), brow lift (×R), mouth curve (+1 smile, -1 frown)
const MOODS = {
  neutral:   { tilt: 0,     lift: 0,    curve: 1,  eye: 1 },
  happy:     { tilt: -0.06, lift: 0.05, curve: 1,  eye: 0.82 },
  sad:       { tilt: 0.38,  lift: 0.01, curve: -1, eye: 0.9 },
  angry:     { tilt: -0.42, lift: -0.03, curve: -1, eye: 0.9 },
  surprised: { tilt: 0.05,  lift: 0.09, curve: 0,  eye: 1.15 },
  thinking:  { tilt: -0.15, lift: 0.04, curve: 0,  eye: 0.95 },
};
export const MOOD_NAMES = Object.keys(MOODS);

const lerp = (a, b, k) => a + (b - a) * k;

export class Rig {
  // root: whole character. head: the part that turns to look at you. face: from buildFace.
  // opts.restLid: 0 = wide awake, 0.4 = sleepy/half-lidded. opts.setMouth: custom mouth (e.g. a beak).
  // opts.tick(t, dt, rig): character-specific motion (tail, wings, wobble...).
  // opts.restMouth: how open the mouth stays when idle and smiling (0 = closed smile, 0.3 = grin).
  // opts.arms: { L, R } from attachArms, so the character can gesture (wave, think, talk with hands).
  // opts.gestureArm: 'R' or 'L', the arm used for one-handed gestures.
  constructor({ root, head, face, restLid = 0, restMouth = 0, setMouth, tick, height = 2.4, arms, gestureArm }) {
    Object.assign(this, { root, head, face, restLid, restMouth, customMouth: setMouth, customTick: tick, height });
    this.gestures = arms ? new Gestures(arms, { primary: gestureArm }) : null;
    this.mood = 'neutral';
    this.m = { ...MOODS.neutral };
    this.mouthOpen = 0;
    this.blink = 0;
    this.nextBlink = 1 + Math.random() * 2;
    this.look = new THREE.Vector2();
    this.thinking = false;
    this.speaking = false;
    this.headBase = head.rotation.clone();
    this.rootBaseY = root.position.y;
  }

  setMood(name) { this.mood = MOODS[name] ? name : 'neutral'; }

  // Play a one-off gesture: wave, explain, both, tada, shrug, surprised, hips (see gestures.js).
  gesture(name) { this.gestures?.play(name); }

  update(t, dt, { mouth = 0, look } = {}) {
    // smooth everything so it never snaps
    const k = 1 - Math.pow(0.0001, dt);
    const target = MOODS[this.mood];
    for (const key in target) this.m[key] = lerp(this.m[key], target[key], k * 0.6);
    this.mouthOpen = lerp(this.mouthOpen, mouth, 1 - Math.pow(0.000001, dt));
    if (look) this.look.lerp(look, k * 0.5);

    // blinking: quick close/open every few seconds
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blinkT = 0; this.nextBlink = 2 + Math.random() * 3.5; }
    if (this.blinkT !== undefined) {
      this.blinkT += dt;
      this.blink = this.blinkT < 0.08 ? this.blinkT / 0.08 : Math.max(0, 1 - (this.blinkT - 0.08) / 0.1);
      if (this.blinkT > 0.2) this.blinkT = undefined;
    } else this.blink = 0;
    const lid = Math.max(this.blink, this.restLid * (this.mood === 'surprised' ? 0 : 1));
    const eyeY = Math.max(0.06, (1 - lid) * this.m.eye);
    this.face.eyes.forEach((e) => { e.scale.y = eyeY; e.scale.x = 0.9 + 0.1 * this.m.eye; });

    // brows
    const R = this.face.R;
    this.face.brows.forEach((b) => {
      b.position.y = b.userData.baseY + this.m.lift * R + (this.speaking ? Math.sin(t * 7) * 0.006 : 0);
      b.rotation.z = b.userData.side * -this.m.tilt;
    });

    // mouth
    const v = this.mouthOpen;
    if (this.customMouth) this.customMouth(v, this);
    const mo = this.face.mouth;
    const surprisedO = this.mood === 'surprised' ? 0.45 : 0;
    const grin = this.m.curve > 0.3 ? this.restMouth : 0;
    const open = Math.max(v, surprisedO, grin);
    mo.open.visible = open > 0.04;
    mo.open.scale.y = mo.base * 0.8 * R * Math.max(open, 0.05);
    mo.open.scale.x = mo.base * R * (0.75 + 0.35 * (1 - open * 0.5));
    mo.smile.visible = open < 0.12 && Math.abs(this.m.curve) > 0.3;
    mo.smile.rotation.z = this.m.curve >= 0 ? Math.PI : 0;
    mo.smile.position.y = this.m.curve >= 0 ? 0 : -mo.base * 0.6 * R;

    // head: look toward the cursor, tilt when thinking, nod while talking
    const tilt = this.thinking ? 0.18 : 0;
    const nod = this.speaking ? Math.sin(t * 5.5) * 0.04 * (0.4 + v) : 0;
    this.head.rotation.y = this.headBase.y + this.look.x * 0.45;
    this.head.rotation.x = this.headBase.x - this.look.y * 0.22 + nod;
    this.head.rotation.z = lerp(this.head.rotation.z, this.headBase.z + tilt, k * 0.3);

    // breathing bob
    this.root.position.y = this.rootBaseY + Math.sin(t * 1.8) * 0.015;

    this.gestures?.reset();
    if (this.customTick) this.customTick(t, dt, this);
    this.gestures?.update(t, dt, this);
  }
}

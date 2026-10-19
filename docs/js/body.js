// body.js — a kit for building full-body characters: posable arms and hands, legs and
// shoes, torsos and jackets, heads and hairstyles. Every human character uses the same
// skeleton proportions (about 5 heads tall), so outfits and poses can be mixed freely.
//
// Coordinates: y is up, the character faces +z, x>0 is the character's LEFT side.
// `s` (side) is +1 for left, -1 for right; poses are written for the left side and mirrored.

import * as THREE from 'three';
import { toon, fabric, skinMat, hairMat, part, sphere, capsule, cone, cyl, torus, onSurface, hairLock, buildFace } from './toonkit.js';

export const Y = { hip: 0.98, waist: 1.12, chest: 1.38, shoulder: 1.56, neck: 1.66, head: 1.93 };

// ---------------- hands ----------------

// style: 'open' | 'peace' | 'fist' | 'grip' (curled around something held)
export function hand(s, { skin, glove, style = 'open' }) {
  const g = new THREE.Group();
  g.add(part(sphere(0.058), glove || skin, { scale: [1, 1.12, 0.6] }));
  const finger = (x, len, rx = 0, rz = 0, mat = skin) => {
    const f = new THREE.Group();
    f.position.set(x, -0.055, 0);
    f.rotation.set(rx, 0, rz);
    f.add(part(capsule(0.014, len), mat, { pos: [0, -len / 2 - 0.01, 0] }));
    g.add(f);
  };
  const xs = [-0.039, -0.013, 0.013, 0.039];
  if (style === 'open') xs.forEach((x, i) => finger(x, 0.05, 0, (i - 1.5) * 0.09));
  if (style === 'peace') {
    finger(xs[3] * s, 0.06, 0, s * 0.22);   // index
    finger(xs[2] * s, 0.06, 0, -s * 0.05);  // middle
    finger(xs[1] * s, 0.02, 1.8, 0);        // ring, curled
    finger(xs[0] * s, 0.02, 1.8, 0);        // pinky, curled
  }
  if (style === 'fist' || style === 'grip') xs.forEach((x) => finger(x, 0.025, style === 'fist' ? 2.2 : 1.5, 0));
  // thumb
  const t = new THREE.Group();
  t.position.set(-s * 0.05, -0.02, 0.02);
  t.rotation.set(style === 'grip' ? 0.9 : 0.3, 0, -s * 0.8);
  t.add(part(capsule(0.016, 0.035), skin, { pos: [0, -0.025, 0] }));
  g.add(t);
  return g;
}

// ---------------- arms ----------------

// sleeve: 'full' | 'rolled' | 'short' | 'none'. Returns { shoulder, elbow, hand } groups to pose.
export function arm(s, o) {
  const { skin, sleeveMat, sleeve = 'full', cuffMat, upperR = 0.072, foreR = 0.058 } = o;
  const shoulder = new THREE.Group();
  shoulder.add(part(capsule(upperR, 0.26), sleeve === 'none' ? skin : sleeveMat, { pos: [0, -0.17, 0] }));
  if (sleeve === 'short') shoulder.add(part(capsule(upperR * 0.86, 0.12), skin, { pos: [0, -0.27, 0] }));
  if (sleeve === 'rolled') shoulder.add(part(cyl(upperR + 0.014, upperR + 0.01, 0.07), cuffMat || sleeveMat, { pos: [0, -0.33, 0] }));
  const elbow = new THREE.Group();
  elbow.position.y = -0.36;
  shoulder.add(elbow);
  const foreMat = sleeve === 'full' ? sleeveMat : skin;
  elbow.add(part(capsule(foreR, 0.22), foreMat, { pos: [0, -0.14, 0] }));
  if (sleeve === 'full') elbow.add(part(cyl(foreR + 0.012, foreR + 0.006, 0.05), cuffMat || sleeveMat, { pos: [0, -0.27, 0] }));
  if (o.mesh) elbow.add(part(capsule(foreR + 0.004, 0.16), o.mesh, { pos: [0, -0.16, 0] })); // mesh sleeve overlay
  if (o.bracer) elbow.add(part(cyl(foreR + 0.009, foreR + 0.007, 0.09), o.bracer, { pos: [0, -0.24, 0] }));
  (o.bangles || []).forEach((mat, i) => elbow.add(part(torus(foreR + 0.006, 0.007), mat, { pos: [0, -0.22 - i * 0.017, 0], rot: [Math.PI / 2, 0, 0] })));
  if (o.watch) {
    elbow.add(part(torus(foreR + 0.004, 0.008), o.watch.strap, { pos: [0, -0.25, 0], rot: [Math.PI / 2, 0, 0] }));
    elbow.add(part(cyl(0.022, 0.022, 0.012), o.watch.face, { pos: [s * (foreR + 0.006), -0.25, 0], rot: [0, 0, Math.PI / 2] }));
  }
  if (o.glove) elbow.add(part(cyl(foreR + 0.004, foreR + 0.002, 0.06), o.glove, { pos: [0, -0.28, 0] }));
  const h = new THREE.Group();
  h.position.y = -0.33;
  elbow.add(h);
  // the hand's own style, plus a hidden open hand that gestures (waving, explaining) switch to
  const main = hand(s, { skin, glove: o.glove, style: o.handStyle });
  h.add(main);
  let open = null;
  if (o.handStyle && o.handStyle !== 'open') {
    open = hand(s, { skin, glove: o.glove, style: 'open' });
    open.visible = false;
    h.add(open);
  }
  return { shoulder, elbow, hand: h, palm: { main, open } };
}

// Poses for the LEFT arm (s = +1) as [shoulder xyz, elbow xyz, hand xyz]; mirrored for the right.
export const POSES = {
  down:   [[0.04, 0, 0.12], [-0.12, 0, -0.04], [0, 0, 0]],
  hip:    [[0.1, 0, 0.5], [-0.3, 0, -1.75], [0, 0, 0.6]],
  open:   [[-0.15, 0, 0.75], [-1.1, 0, 0.75], [0.2, 0.9, 0.2]],
  pocket: [[0.18, 0, 0.18], [-0.35, 0, -0.42], [0.2, 0, 0.3]],
  peace:  [[-0.25, 0, 1.0], [-0.3, 0, 1.84], [0, 0.3, 0]],
  hold:   [[-0.75, 0, 0.18], [-0.85, 0, -0.35], [0.2, 0, 0.2]],
  strap:  [[-0.25, 0, 0.1], [-1.5, 0, -0.85], [0, 0, 0.2]],   // hand resting on a bag strap at the chest
};

export function pose(a, s, name) {
  const [sh, el, hd] = POSES[name];
  a.shoulder.rotation.set(sh[0], s * sh[1], s * sh[2]);
  a.elbow.rotation.set(el[0], s * el[1], s * el[2]);
  a.hand.rotation.set(hd[0], s * hd[1], s * hd[2]);
  a.rest = a.elbow.rotation.clone();
}

export function attachArms(root, o, { left = 'down', right = 'down', width = 0.33 } = {}) {
  const L = arm(1, { ...o, ...(o.left || {}) });
  const R = arm(-1, { ...o, ...(o.right || {}) });
  L.shoulder.position.set(width, Y.shoulder, 0);
  R.shoulder.position.set(-width, Y.shoulder, 0);
  pose(L, 1, left);
  pose(R, -1, right);
  root.add(L.shoulder, R.shoulder);
  return { L, R };
}

// ---------------- legs & shoes ----------------

function shoe(root, s, x, o) {
  const { style = 'boot', mat, sole, accent } = o;
  if (style === 'boot') {
    root.add(part(capsule(0.085, 0.12), mat, { pos: [x, 0.15, 0] }));
    root.add(part(sphere(0.1), mat, { pos: [x, 0.06, 0.07], scale: [0.9, 0.6, 1.5] }));
  } else if (style === 'hightop') {
    root.add(part(capsule(0.09, 0.1), mat, { pos: [x, 0.16, 0] }));
    root.add(part(sphere(0.105), mat, { pos: [x, 0.065, 0.07], scale: [0.95, 0.62, 1.55] }));
    if (accent) {
      root.add(part(torus(0.092, 0.018), accent, { pos: [x, 0.2, 0], rot: [Math.PI / 2, 0, 0] }));
      root.add(part(sphere(0.06), accent, { pos: [x + s * 0.06, 0.09, 0.05], scale: [0.4, 0.7, 1.2] }));
    }
  } else { // sneaker
    root.add(part(sphere(0.105), mat, { pos: [x, 0.07, 0.06], scale: [0.95, 0.7, 1.6] }));
    root.add(part(capsule(0.07, 0.04), mat, { pos: [x, 0.13, -0.01] }));
    if (accent) root.add(part(sphere(0.05), accent, { pos: [x + s * 0.07, 0.07, 0.05], scale: [0.4, 0.8, 1.8] }));
  }
  root.add(part(cyl(0.1, 0.1, 0.035), sole, { pos: [x, 0.018, 0.05], scale: [0.95, 1, 1.6] }));
}

// o: { pants (mat) | skin + skirt, socks (thigh-high mat), sockBand, shoe: {...}, rips, cargo, width }
export function legs(root, o) {
  const w = o.width ?? 0.12;
  [-1, 1].forEach((s) => {
    const x = s * w;
    if (o.pants) {
      root.add(part(capsule(o.legR ?? 0.1, 0.62), o.pants, { pos: [x, 0.56, 0] }));
      if (o.cargo) root.add(part(new THREE.BoxGeometry(0.1, 0.13, 0.05), o.cargo, { pos: [x + s * 0.08, 0.6, 0.03], rot: [0, s * 0.5, 0] }));
      if (o.rips) [[0.5, 0.09], [0.66, 0.085]].forEach(([y, z], i) => root.add(part(sphere(0.03), o.rips, { pos: [x + (i ? -s * 0.02 : s * 0.02), y, z], scale: [1.3, 0.5, 0.3] })));
    } else {
      root.add(part(capsule(o.legR ?? 0.08, 0.66), o.skin, { pos: [x, 0.56, 0] }));
      if (o.socks) {
        root.add(part(capsule((o.legR ?? 0.08) + 0.006, 0.42), o.socks, { pos: [x, 0.42, 0] }));
        if (o.sockBand) root.add(part(torus((o.legR ?? 0.08) + 0.008, 0.014), o.sockBand, { pos: [x, 0.66, 0], rot: [Math.PI / 2, 0, 0] }));
      }
    }
    shoe(root, s, x, o.shoe);
  });
  // hips
  if (o.pants) root.add(part(cyl(0.23, 0.24, 0.22), o.pants, { pos: [0, 0.94, 0], scale: [1, 1, 0.85] }));
  if (o.skirt) {
    const { mat, top = 0.21, bottom = 0.33, len = 0.3, y = 0.88 } = o.skirt;
    // pleats: a low-poly cylinder with flat shading reads as folded fabric
    const geo = new THREE.CylinderGeometry(top, bottom, len, 18, 1, true);
    const m = mat.clone();
    m.flatShading = true;
    m.side = THREE.DoubleSide;
    root.add(part(geo, m, { pos: [0, y, 0], scale: [1, 1, 0.82] }));
    root.add(part(cyl(top, top, 0.06), mat, { pos: [0, y + len / 2, 0], scale: [1, 1, 0.82] }));
    root.add(part(cyl(0.2, 0.22, 0.14), mat, { pos: [0, y + len / 2 - 0.05, 0], scale: [1, 1, 0.8] })); // shorts underneath
  }
}

export function belt(root, { mat, buckle, y = 1.0, r = 0.245 }) {
  root.add(part(cyl(r, r, 0.06), mat, { pos: [0, y, 0], scale: [1, 1, 0.85] }));
  if (buckle) root.add(part(torus(0.03, 0.009), buckle, { pos: [0, y, r * 0.85 + 0.005] }));
}

// ---------------- torso & jackets ----------------

// o: { shirt, female, crop (skin mat → bare midriff), neck: 'v' | 'turtle' | 'crew', vColor }
export function torso(root, o) {
  const f = o.female;
  if (o.crop) {
    root.add(part(cyl(0.2, 0.22, 0.24), o.crop, { pos: [0, 1.12, 0], scale: [1, 1, 0.78] }));      // bare waist
    root.add(part(cyl(f ? 0.25 : 0.27, 0.2, 0.36), o.shirt, { pos: [0, 1.42, 0], scale: [1, 1, 0.78] }));
  } else {
    root.add(part(cyl(f ? 0.25 : 0.27, f ? 0.2 : 0.23, 0.62), o.shirt, { pos: [0, 1.31, 0], scale: [1, 1, 0.78] }));
  }
  if (f) [-1, 1].forEach((s) => root.add(part(sphere(0.085), o.shirt, { pos: [s * 0.085, 1.4, 0.13], scale: [1, 0.9, 0.75] })));
  if (o.ribbed) for (let i = 0; i < 7; i++) root.add(part(cyl(0.005, 0.005, 0.42), o.ribbed, { pos: [-0.12 + i * 0.04, 1.3, 0.19 + (f ? 0.02 : 0) - Math.abs(i - 3) * 0.006], rot: [-0.06, 0, 0] }));
  if (o.neck === 'turtle') root.add(part(cyl(0.085, 0.1, 0.1), o.shirt, { pos: [0, 1.64, 0] }));
  if (o.neck === 'v') root.add(part(cone(0.09, 0.18, 3), o.vColor || o.shirt, { pos: [0, 1.54, 0.16], rot: [Math.PI, 0, 0], scale: [1, 1, 0.3] }));
  if (o.neck === 'crew') root.add(part(torus(0.1, 0.02), o.shirt, { pos: [0, 1.61, 0.02], rot: [Math.PI / 2, 0, 0] }));
}

// o: { mat, lining, len (0.66 = to the hips, 0.45 = cropped), open (gap), collar: 'shirt'|'band'|'hood'|'lapel', pockets, zipper }
export function jacket(root, o) {
  const len = o.len ?? 0.66;
  const top = 1.62, cy = top - len / 2;
  const open = o.open ?? 0.36; // fraction of PI left open at the front
  const shellMat = o.mat.clone();
  shellMat.side = THREE.DoubleSide;
  root.add(part(new THREE.CylinderGeometry(0.3, o.flare ?? 0.27, len, 40, 1, true, Math.PI * (open / 2), Math.PI * (2 - open)), shellMat, { pos: [0, cy, 0], scale: [1, 1, 0.82] }));
  if (o.lining) root.add(part(new THREE.CylinderGeometry(0.295, (o.flare ?? 0.27) - 0.005, len - 0.01, 40, 1, true, Math.PI * (open / 2), Math.PI * (2 - open)), o.lining, { pos: [0, cy, 0], scale: [1, 1, 0.81] }));
  if (o.band) root.add(part(cyl(0.27, 0.27, 0.06), o.band, { pos: [0, top - len + 0.03, 0], scale: [1, 1, 0.84] })); // ribbed hem (bomber)
  [-1, 1].forEach((s) => {
    const panelW = o.collar === 'lapel' ? 0.12 : 0.09;
    root.add(part(new THREE.BoxGeometry(panelW, len - 0.08, 0.03), o.mat, { pos: [s * 0.19, cy - 0.02, 0.2], rot: [-0.05, s * -0.45, 0] }));
    if (o.collar === 'lapel') root.add(part(new THREE.BoxGeometry(0.09, 0.22, 0.02), o.mat, { pos: [s * 0.15, 1.5, 0.215], rot: [0.1, s * -0.5, s * 0.35] }));
    if (o.pockets) root.add(part(new THREE.BoxGeometry(0.1, 0.11, 0.02), o.pockets, { pos: [s * 0.21, 1.4, 0.225], rot: [0, s * -0.45, 0] }));
    if (o.zipper) root.add(part(new THREE.BoxGeometry(0.012, len - 0.1, 0.01), o.zipper, { pos: [s * 0.15, cy, 0.235], rot: [0, s * -0.45, 0] }));
    root.add(part(sphere(0.125), o.mat, { pos: [s * 0.3, Y.shoulder, 0], scale: [1, 0.75, 0.9] })); // shoulder
    if (o.patch && s === 1) root.add(part(new THREE.BoxGeometry(0.07, 0.05, 0.01), o.patch, { pos: [0.37, 1.48, 0.04], rot: [0, 0.9, 0] }));
  });
  if (o.collar === 'shirt' || o.collar === 'lapel') root.add(part(torus(0.15, 0.04, Math.PI * 1.3), o.collarMat || o.mat, { pos: [0, 1.62, -0.02], rot: [Math.PI / 2 - 0.25, 0, Math.PI * 0.85] }));
  if (o.collar === 'band') root.add(part(torus(0.13, 0.035), o.band || o.mat, { pos: [0, 1.63, -0.01], rot: [Math.PI / 2 - 0.15, 0, 0] }));
  if (o.collar === 'hood') root.add(part(sphere(0.2), o.hoodMat || o.mat, { pos: [0, 1.62, -0.2], scale: [1.1, 0.55, 0.6] }));
}

export function backpack(root, { mat, strap, roll, flap }) {
  root.add(part(new THREE.BoxGeometry(0.4, 0.46, 0.2), mat, { pos: [0, 1.3, -0.33], rot: [0.05, 0, 0] }));
  if (flap) root.add(part(new THREE.BoxGeometry(0.3, 0.15, 0.06), flap, { pos: [0, 1.2, -0.45] }));
  if (roll) {
    root.add(part(cyl(0.085, 0.085, 0.48), roll, { pos: [0, 1.6, -0.32], rot: [0, 0, Math.PI / 2] }));
    [-0.14, 0.14].forEach((x) => root.add(part(torus(0.088, 0.011), strap, { pos: [x, 1.6, -0.32], rot: [0, Math.PI / 2, 0] })));
  }
  [-1, 1].forEach((s) => root.add(part(new THREE.BoxGeometry(0.045, 0.5, 0.02), strap, { pos: [s * 0.15, 1.32, 0.215], rot: [0.06, 0, s * -0.1] })));
}

// a bag worn across the body: strap from one shoulder to the opposite hip
export function crossbody(root, { mat, strap, side = 1, size = [0.2, 0.14, 0.07], y = 1.02, front = true }) {
  const bag = part(new THREE.BoxGeometry(...size), mat, { pos: [side * 0.28, y, front ? 0.12 : 0], rot: [0, side * (front ? -0.6 : -1.3), 0] });
  root.add(bag);
  const from = new THREE.Vector3(-side * 0.2, 1.6, 0.06), to = new THREE.Vector3(side * 0.27, y + size[1] / 2, 0.16);
  const curve = new THREE.QuadraticBezierCurve3(from, new THREE.Vector3(0, 1.32, 0.27), to);
  root.add(part(new THREE.TubeGeometry(curve, 20, 0.012, 6), strap));
  return bag;
}

export function necklace(root, { cord, pendant, y = 1.47, z = 0.19, long = false }) {
  root.add(part(torus(long ? 0.12 : 0.1, 0.005), cord, { pos: [0, long ? 1.56 : 1.6, 0.07], rot: [Math.PI / 2 - (long ? 1.05 : 0.9), 0, 0] }));
  if (pendant) {
    const p = part(cone(0.022, 0.06, 4), pendant, { pos: [0, y, z], rot: [Math.PI, 0, 0] });
    root.add(p);
    return p;
  }
}

// ---------------- heads ----------------

// o: { skin, R, jaw (bool, masculine), stubble (mat), eye, brow, mouth, lips, nose }
export function head(root, o) {
  const R = o.R ?? 0.25;
  const h = new THREE.Group();
  h.position.set(0, Y.head + (o.lift ?? 0), 0.01);
  root.add(h);
  root.add(part(cyl(o.female ? 0.065 : 0.075, o.female ? 0.075 : 0.085, 0.16), o.skin, { pos: [0, Y.neck, 0] }));
  h.add(part(sphere(R), o.skin, { scale: o.female ? [0.93, 1.03, 0.96] : [0.95, 1.05, 0.98] }));
  // jaw / chin: masculine = wide and square-ish, feminine = narrow and pointed
  h.add(part(sphere(R * (o.female ? 0.5 : 0.62)), o.skin, { pos: [0, -R * (o.female ? 0.6 : 0.55), R * 0.27], scale: o.female ? [1.1, 0.85, 1] : [1.15, 0.8, 1] }));
  if (o.stubble) h.add(part(sphere(R * 0.64), o.stubble, { pos: [0, -R * 0.56, R * 0.27], scale: [1.17, 0.82, 1.02] }));
  h.add(part(sphere(R * (o.female ? 0.11 : 0.14)), o.skin, { pos: onSurface(R, 0, -R * 0.12, -0.1).toArray(), scale: [0.8, 1, 1.2] }));
  [-1, 1].forEach((s) => h.add(part(sphere(R * 0.16), o.skin, { pos: [s * R * 0.93, -R * 0.05, 0], scale: [0.5, 1, 0.8] })));
  if (o.earrings) [-1, 1].forEach((s) => h.add(part(sphere(0.012), o.earrings, { pos: [s * R * 0.93, -R * 0.25, 0.01] })));
  const face = buildFace(h, R, {
    eye: { style: 'anime', size: 0.15, spacing: 0.36, y: 0.02, ...o.eye },
    brow: { w: 0.2, thick: o.female ? 0.03 : 0.05, y: 0.3, ...o.brow },
    mouth: { y: -0.46, w: 0.24, color: 0x5e1d24, teeth: true, ...o.mouth },
    blush: o.blush ?? false,
  });
  return { head: h, face, R };
}

// ---------------- hairstyles ----------------

const rnd = (i) => Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);

export function hairSpiky(h, R, { mat, hi, count = 18, len = 0.13, fringe = true, sideburns = true }) {
  h.add(part(sphere(R * 1.06), mat, { pos: [0, R * 0.12, -R * 0.12], scale: [1, 0.95, 1] }));
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = i * 2.399;
    const yUp = 0.3 + 0.7 * ((i + 0.5) / count);
    const r = Math.sqrt(1 - yUp * yUp);
    const d = new THREE.Vector3(Math.cos(a) * r, yUp, Math.sin(a) * r - 0.3).normalize();
    if (d.z > 0.5 && d.y < 0.8) continue;
    const l = len + rnd(i) * len * 0.5;
    const t = part(cone(0.075, l, 8), i % 3 ? mat : hi || mat);
    t.scale.set(1, 1, 0.55);
    const tip = d.clone().add(new THREE.Vector3((rnd(i + 7) - 0.5) * 0.6, 0.55, -0.55)).normalize();
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip);
    t.position.copy(d.multiplyScalar(R * 0.98)).add(new THREE.Vector3(0, R * 0.12, -R * 0.1)).add(tip.clone().multiplyScalar(l * 0.3));
    g.add(t);
  }
  if (fringe) [[-0.12, -0.6], [-0.03, -0.2], [0.07, 0.35], [0.15, 0.7]].forEach(([x, tilt]) => {
    const t = part(cone(0.04, 0.13, 6), mat);
    const p = onSurface(R, x, R * 0.62, -0.02);
    t.position.set(p.x, p.y + 0.02, p.z + 0.03);
    t.rotation.set(Math.PI + 0.7, 0, tilt);
    g.add(t);
  });
  if (sideburns) [-1, 1].forEach((s) => g.add(part(capsule(0.025, 0.08), mat, { pos: [s * R * 0.9, -R * 0.05, R * 0.25] })));
  h.add(g);
  return g;
}

// A wavy lock: a chain of capsules that zig-zags slightly as it falls.
function wavyLock(mat, { len, r, wave = 0.18, segs = 4, phase = 0 }) {
  const g = new THREE.Group();
  let parent = g;
  const seg = len / segs;
  for (let i = 0; i < segs; i++) {
    const j = new THREE.Group();
    j.rotation.z = (i === 0 ? 0 : Math.sin(i * 1.7 + phase) * wave);
    j.rotation.x = i === 0 ? 0 : 0.05;
    const rr = r * (1 - i * 0.12);
    j.add(part(capsule(rr, seg), mat, { pos: [0, -seg / 2, 0], scale: [1, 1, 0.7] }));
    parent.add(j);
    const next = new THREE.Group();
    next.position.y = -seg;
    j.add(next);
    parent = next;
  }
  return g;
}

// Long wavy hair: full cap, a curtain of locks down the back, two locks framing the face,
// and side-swept bangs. length is how far below the head centre the hair falls.
export function hairLong(h, R, { mat, hi, length = 0.75, bangs = 'side', volume = 1 }) {
  // scalp: pushed back so it covers the top and back of the head but never the face
  h.add(part(sphere(R * 1.07), mat, { pos: [0, R * 0.14, -R * 0.24], scale: [1.02 * volume, 1, 0.96] }));
  const locks = new THREE.Group();
  const n = 15;
  for (let i = 0; i < n; i++) {
    // angle around the head: 0 = straight back; spread from one ear (-100°) to the other (+100°)
    const a = (-1 + 2 * (i / (n - 1))) * 1.75;
    const x = Math.sin(a) * R * 0.98 * volume, z = -Math.cos(a) * R * 0.95 - R * 0.05;
    const l = wavyLock(i % 3 ? mat : hi || mat, { len: length * (0.85 + rnd(i) * 0.25), r: 0.07 * volume, phase: i, segs: 5 });
    l.position.set(x, R * 0.3, Math.min(z, -R * 0.15));
    l.rotation.z = Math.sin(a) * 0.35;   // fan out over the shoulders
    l.rotation.x = 0.12;
    locks.add(l);
  }
  // face-framing locks: start beside the temples and fall in front of the shoulders
  [-1, 1].forEach((s) => {
    const l = wavyLock(mat, { len: length * 0.92, r: 0.055 * volume, phase: s * 2, segs: 5 });
    l.position.set(s * R * 1.02, R * 0.2, -R * 0.02);
    l.rotation.set(-0.25, 0, s * 0.18);
    locks.add(l);
  });
  h.add(locks);
  if (bangs === 'side') {
    [[-0.2, -0.9], [-0.06, -0.7], [0.08, -0.55], [0.2, -0.35]].forEach(([x, d], i) =>
      h.add(hairLock(R, x, R * 0.78 - Math.abs(x) * 0.2, 0.2 + i * 0.03, 0.085, i % 2 ? mat : hi || mat, { dir: [-d, -1, 0] })));
  } else if (bangs === 'center') {
    [-1, 1].forEach((s) => [0.05, 0.17].forEach((x, i) =>
      h.add(hairLock(R, s * x, R * 0.8, 0.22 + i * 0.04, 0.085, mat, { dir: [s * 0.7, -1, 0] }))));
  }
  return locks;
}

// High ponytail: cap, bangs, and a tail that arcs up and back then falls.
export function hairPonytail(h, R, { mat, hi, clip }) {
  h.add(part(sphere(R * 1.06), mat, { pos: [0, R * 0.14, -R * 0.2], scale: [1, 1, 0.97] }));
  [[-0.18, 0.5], [-0.05, 0.2], [0.08, -0.25], [0.2, -0.6]].forEach(([x, d], i) =>
    h.add(hairLock(R, x, R * 0.8, 0.2 + (i % 2) * 0.05, 0.085, i % 2 ? mat : hi || mat, { dir: [d, -1, 0] })));
  [-1, 1].forEach((s) => {
    const l = wavyLock(mat, { len: 0.28, r: 0.04, wave: 0.12, phase: s });
    l.position.set(s * R * 0.85, R * 0.05, R * 0.35);
    h.add(l);
  });
  const tail = new THREE.Group();
  tail.position.set(0, R * 0.7, -R * 0.85);
  const pts = [[0, 0, 0], [0, 0.08, -0.12], [0, -0.02, -0.25], [0.02, -0.25, -0.3], [0.04, -0.5, -0.26], [0.03, -0.68, -0.2]];
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = 0.11 * (1 - t * 0.7) * (t < 0.15 ? 0.7 + t * 2 : 1);
    tail.add(part(sphere(r), i % 4 === 1 ? hi || mat : mat, { pos: curve.getPoint(t).toArray(), scale: [1, 1.25, 0.85] }));
  }
  h.add(tail);
  h.add(part(torus(0.05, 0.02), mat, { pos: [0, R * 0.72, -R * 0.86], rot: [1.0, 0, 0] })); // hair tie
  return tail;
}

export function cap(h, R, { mat, brim, patch }) {
  h.add(part(new THREE.SphereGeometry(R * 1.12, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), mat, { pos: [0, R * 0.32, -R * 0.04], rot: [-0.12, 0, 0] }));
  const b = part(cyl(R * 0.75, R * 0.8, 0.02), brim || mat, { pos: [0, R * 0.42, R * 0.95], rot: [-0.32, 0, 0], scale: [1, 1, 0.75] });
  h.add(b);
  h.add(part(sphere(0.02), brim || mat, { pos: [0, R * 1.43, -R * 0.15] }));
  if (patch) h.add(part(new THREE.BoxGeometry(0.1, 0.05, 0.01), patch, { pos: [0, R * 0.85, R * 0.85], rot: [-0.65, 0, 0] }));
}

// a flat 5-pointed star (for badges, clips, prints)
export function starGeo(r = 0.05, depth = 0.015) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4, bevelSegments: 2 });
  g.center();
  return g;
}

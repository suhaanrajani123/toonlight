// Kaito Hayabusa — the hyper underdog (anime).
// Spiky teal hair, orange sporty jacket with a lightning-bolt patch, sneakers.
import * as THREE from 'three';
import { toon, flat, glow, metal, gloss, skinMat, hairMat, fabric, part, sphere, capsule, cone, cyl, torus, hairLock, onSurface, buildFace, Rig } from '../toonkit.js';

function boltShape() {
  const s = new THREE.Shape();
  [[0.02, 0.12], [-0.06, 0.0], [0.0, 0.0], [-0.03, -0.12], [0.07, 0.03], [0.01, 0.03], [0.05, 0.12]]
    .forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
}

export function build() {
  const skin = skinMat(0xf4c9a9), hair = hairMat(0x1aa99d), hairDark = hairMat(0x0f7a71);
  const jacket = toon(0xf26a22, { rough: 0.6, sheen: 0.5 }), white = fabric(0xf2f0f8), shorts = fabric(0x26305e), shoe = gloss(0xe8324f);
  const root = new THREE.Group();

  // --- body ---
  root.add(part(cyl(0.24, 0.32, 0.5), jacket, { pos: [0, 0.82, 0], ol: 0.03 }));          // jacket torso
  root.add(part(cyl(0.245, 0.245, 0.06), white, { pos: [0, 0.74, 0] }));                     // chest stripe
  root.add(part(torus(0.17, 0.05), white, { pos: [0, 1.07, 0], rot: [Math.PI / 2, 0, 0] })); // collar
  root.add(part(boltShape(), metal(0xffcf33, 0.35), { pos: [0.1, 0.9, 0.26], rot: [0, 0.35, 0], scale: 1.1 }));
  root.add(part(cyl(0.3, 0.27, 0.22), shorts, { pos: [0, 0.48, 0], ol: 0.03 }));
  [-1, 1].forEach((s) => {
    root.add(part(capsule(0.085, 0.2), skin, { pos: [s * 0.13, 0.27, 0], ol: 0.05 }));         // legs
    root.add(part(sphere(0.12), shoe, { pos: [s * 0.14, 0.07, 0.05], scale: [0.95, 0.65, 1.35], ol: 0.05 }));
    root.add(part(sphere(0.12), white, { pos: [s * 0.14, 0.03, 0.05], scale: [1, 0.25, 1.4] }));  // soles
    // arms: one fist pumped slightly forward for energy
    root.add(part(capsule(0.08, 0.36), jacket, { pos: [s * 0.36, 0.8, 0.04], rot: [s > 0 ? -0.5 : 0, 0, s * 0.35], ol: 0.05 }));
    root.add(part(sphere(0.085), skin, { pos: [s * 0.45, s > 0 ? 0.62 : 0.6, s > 0 ? 0.16 : 0.04], ol: 0.06 }));
  });

  // --- head ---
  const head = new THREE.Group();
  head.position.set(0, 1.52, 0);
  root.add(head);
  root.add(part(cyl(0.07, 0.08, 0.2), skin, { pos: [0, 1.1, 0] }));
  const R = 0.5;
  head.add(part(sphere(R), skin, { scale: [1, 1, 0.95], ol: 0.025 }));
  const face = buildFace(head, R, {
    eye: { style: 'anime', iris: 0xe39b1f, size: 0.17, spacing: 0.34, y: -0.06 },
    brow: { color: 0x0e6d64, w: 0.24, thick: 0.05 },
    mouth: { y: -0.47, w: 0.1 },
  });
  // cheek bandage
  head.add(part(capsule(0.03, 0.08), fabric(0xf3d3a2), { pos: onSurface(R, 0.27, -0.25, -0.02).toArray(), rot: [0, 0.5, 1.2] }));

  // --- spiky hair ---
  head.add(part(sphere(R * 1.07, 32, 16, 0), hair, { pos: [0, 0.06, -0.08], ol: 0.025 }));
  const spikes = new THREE.Group();
  const dirs = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    dirs.push([Math.cos(a) * 0.8, 0.55 + Math.sin(i * 1.7) * 0.2, Math.sin(a) * 0.8 - 0.35]);
  }
  dirs.forEach(([x, y, z], i) => {
    const d = new THREE.Vector3(x, y, z).normalize();
    const sp = part(cone(0.15, 0.55 + (i % 3) * 0.1, 10), i % 2 ? hair : hairDark, { ol: 0.05 });
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    sp.position.copy(d.clone().multiplyScalar(R * 0.95));
    spikes.add(sp);
  });
  head.add(spikes);
  // front fringe: short jagged spikes over the forehead
  [-0.28, -0.12, 0.04, 0.2, 0.32].forEach((x, i) =>
    head.add(hairLock(R, x, R * 0.78, 0.28 + (i % 2) * 0.08, 0.1, hair, { dir: [x * 0.8 + (i % 2 ? 0.2 : -0.2), -1, 0] })));

  return new Rig({
    root, head, face,
    tick(t, dt, rig) {
      spikes.rotation.z = Math.sin(t * 2.2) * 0.02;
      // he can't stand still: a bouncy idle, bigger while talking
      root.position.y = rig.rootBaseY + Math.abs(Math.sin(t * (rig.speaking ? 6 : 3.2))) * (rig.speaking ? 0.04 : 0.02);
    },
  });
}

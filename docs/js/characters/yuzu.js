// Yuzu Amano — the shy genius (anime).
// Honey-brown bob, big round glasses, white lab coat over a pink hoodie.
import * as THREE from 'three';
import { toon, flat, glow, metal, gloss, skinMat, hairMat, fabric, part, sphere, capsule, cyl, torus, hairLock, onSurface, buildFace, Rig, INK } from '../toonkit.js';

export function build() {
  const skin = skinMat(0xf8dccd), hair = hairMat(0xc98f3f), hairDark = hairMat(0xa06f2a);
  const coat = fabric(0xf2f4fb), hoodie = fabric(0xf58bb8), legs = fabric(0x3d3a66), shoe = gloss(0x6b5bd6);
  const root = new THREE.Group();

  // --- body ---
  root.add(part(cyl(0.22, 0.42, 0.85), coat, { pos: [0, 0.6, 0], ol: 0.03 }));      // lab coat
  root.add(part(cyl(0.1, 0.17, 0.62), hoodie, { pos: [0, 0.74, 0.21], rot: [-0.18, 0, 0] })); // hoodie peeking through the open coat
  root.add(part(torus(0.2, 0.07), hoodie, { pos: [0, 1.05, -0.05], rot: [Math.PI / 2 - 0.3, 0, 0], ol: 0.05 })); // hood
  root.add(part(sphere(0.06), flat(0x5aa9ff), { pos: [-0.2, 0.86, 0.3], scale: [0.6, 1, 0.3] }));  // pen in pocket
  [-1, 1].forEach((s) => {
    root.add(part(capsule(0.075, 0.4), coat, { pos: [s * 0.3, 0.73, 0.08], rot: [-0.45, 0, s * 0.15], ol: 0.05 }));
    root.add(part(cyl(0.08, 0.08, 0.06), hoodie, { pos: [s * 0.33, 0.52, 0.2], rot: [-0.45, 0, s * 0.15] })); // cuffs
    root.add(part(sphere(0.07), skin, { pos: [s * 0.25, 0.48, 0.27], ol: 0.06 }));
    root.add(part(capsule(0.07, 0.12), legs, { pos: [s * 0.11, 0.12, 0], ol: 0.05 }));
    root.add(part(sphere(0.1), shoe, { pos: [s * 0.12, 0.04, 0.05], scale: [0.9, 0.55, 1.3], ol: 0.05 }));
  });
  // a little tablet she holds in front of her
  root.add(part(new THREE.BoxGeometry(0.42, 0.3, 0.03), gloss(0x3f3a73), { pos: [0, 0.5, 0.33], rot: [-0.5, 0, 0], ol: 0.04 }));
  root.add(part(new THREE.BoxGeometry(0.36, 0.24, 0.01), glow(0x8ff0ff), { pos: [0, 0.51, 0.35], rot: [-0.5, 0, 0] }));

  // --- head ---
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  root.add(head);
  root.add(part(cyl(0.07, 0.08, 0.2), skin, { pos: [0, 1.08, 0] }));
  const R = 0.5;
  head.add(part(sphere(R), skin, { scale: [1, 1, 0.95], ol: 0.025 }));
  const face = buildFace(head, R, {
    eye: { style: 'anime', iris: 0x2f9e64, size: 0.18, spacing: 0.33, y: -0.08 },
    brow: { color: 0x9c6a2a, w: 0.18 },
    mouth: { y: -0.48, w: 0.08 },
  });

  // glasses: two rings and a bridge, sitting just in front of the eyes
  const glasses = new THREE.Group();
  [-1, 1].forEach((s) => {
    const p = onSurface(R, s * 0.33 * R, -0.08 * R, -0.12);
    const ring = part(torus(0.15, 0.018), metal(0x2a2140, 0.3), { pos: p.toArray() });
    ring.lookAt(p.clone().multiplyScalar(2));
    glasses.add(ring);
    const lens = part(new THREE.CircleGeometry(0.15, 32), glow(0xbfe9ff, { transparent: true, opacity: 0.12, depthWrite: false }), { pos: p.toArray() });
    lens.lookAt(p.clone().multiplyScalar(2));
    glasses.add(lens);
  });
  glasses.add(part(cyl(0.012, 0.012, 0.1), flat(INK), { pos: [0, -0.03, R * 1.08], rot: [0, 0, Math.PI / 2] }));
  head.add(glasses);

  // --- bob haircut ---
  // top cap all the way round, then the sides/back hang lower but leave the face open
  const bobMat = hairMat(0xc98f3f, { side: THREE.DoubleSide });
  head.add(part(new THREE.SphereGeometry(R * 1.1, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), bobMat, { pos: [0, 0.02, -0.04], ol: 0.025 }));
  head.add(part(new THREE.SphereGeometry(R * 1.1, 32, 24, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.66), bobMat, { pos: [0, 0.02, -0.04] }));
  // straight-cut fringe
  [-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].forEach((x, i) =>
    head.add(hairLock(R, x, R * 0.82, 0.27 + (i % 2) * 0.03, 0.095, i % 3 === 0 ? hairDark : hair, { dir: [0, -1, 0] })));
  // ahoge — the single stubborn strand on top
  const ahoge = part(new THREE.TorusGeometry(0.1, 0.022, 8, 24, Math.PI * 1.3), hair, { pos: [0.02, R * 1.15, 0], rot: [0, Math.PI / 2, 0.3], ol: 0.12 });
  head.add(ahoge);

  return new Rig({
    root, head, face,
    tick(t, dt, rig) {
      ahoge.rotation.z = 0.3 + Math.sin(t * (rig.speaking ? 9 : 2.5)) * 0.15;
      // shy: glances down a little when she isn't talking
      if (!rig.speaking) head.rotation.x += 0.06;
    },
  });
}

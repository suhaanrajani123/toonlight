// Seraphine Valcrest — the regal strategist (anime).
// Long silver-lavender hair, dark military coat with gold trim, a small tiara.
import * as THREE from 'three';
import { toon, flat, glow, metal, gloss, skinMat, hairMat, fabric, part, group, sphere, capsule, cone, cyl, torus, hairLock, buildFace, Rig } from '../toonkit.js';

export function build() {
  const skin = skinMat(0xf6d5c6), hair = hairMat(0xc9bdf0), hairDark = hairMat(0x9d8bd6);
  const coat = fabric(0x262a5c), gold = metal(0xe2b450), boot = gloss(0x1c1d3d);
  const root = new THREE.Group();

  // --- body ---
  root.add(part(cyl(0.2, 0.52, 0.95), coat, { pos: [0, 0.6, 0], ol: 0.03 }));          // coat
  root.add(part(torus(0.5, 0.035), gold, { pos: [0, 0.14, 0], rot: [Math.PI / 2, 0, 0] })); // hem trim
  root.add(part(cyl(0.035, 0.035, 0.85), gold, { pos: [0, 0.6, 0.355], rot: [-0.33, 0, 0] })); // front strip
  [0.78, 0.6, 0.42].forEach((y, i) => root.add(part(sphere(0.035), gold, { pos: [0.06, y, 0.25 + i * 0.065] })));
  root.add(part(torus(0.17, 0.045), gold, { pos: [0, 1.06, 0], rot: [Math.PI / 2, 0, 0] })); // collar
  [-1, 1].forEach((s) => {
    root.add(part(sphere(0.13), coat, { pos: [s * 0.25, 0.98, 0], scale: [1.1, 0.8, 1], ol: 0.04 }));   // shoulder
    root.add(part(sphere(0.07), gold, { pos: [s * 0.3, 1.04, 0], scale: [1.4, 0.4, 1.2] }));             // epaulette
    root.add(part(capsule(0.075, 0.45), coat, { pos: [s * 0.36, 0.72, 0.02], rot: [0, 0, s * 0.22], ol: 0.05 }));
    root.add(part(sphere(0.075), skin, { pos: [s * 0.42, 0.44, 0.04], ol: 0.06 }));
    root.add(part(capsule(0.08, 0.12), boot, { pos: [s * 0.13, 0.08, 0.02], ol: 0.05 }));
  });

  // --- head ---
  const head = new THREE.Group();
  head.position.set(0, 1.55, 0);
  root.add(head);
  root.add(part(cyl(0.07, 0.08, 0.2), skin, { pos: [0, 1.12, 0] }));                 // neck
  const R = 0.5;
  head.add(part(sphere(R), skin, { scale: [1, 1, 0.95], ol: 0.025 }));
  const face = buildFace(head, R, {
    eye: { style: 'anime', iris: 0x7b55d6, size: 0.19, spacing: 0.34, y: -0.05 },
    brow: { color: 0x8c79c9, w: 0.2 },
    mouth: { y: -0.48, w: 0.09 },
  });

  // --- hair ---
  head.add(part(sphere(R * 1.08, 32, 24), hair, { pos: [0, 0.05, -0.1], scale: [1, 1, 0.98], ol: 0.025 })); // back of head
  const fall = part(capsule(0.42, 0.95), hairDark, { pos: [0, -0.62, -0.32], scale: [1, 1, 0.42], ol: 0.03 });
  head.add(fall);
  [-1, 1].forEach((s) => {
    head.add(part(capsule(0.1, 0.7), hair, { pos: [s * 0.47, -0.42, 0.1], rot: [0.1, 0, s * 0.08], ol: 0.05 })); // side locks
  });
  // bangs: a fan of soft cones across the forehead
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.095;
    const len = 0.34 - Math.abs(i) * 0.012 + (i % 2 ? 0.05 : 0);
    head.add(hairLock(R, x, R * 0.8 - Math.abs(x) * 0.25, len, 0.1, hair, { dir: [x * 0.35, -1, 0] }));
  }
  // side-swept lock that frames the face
  head.add(hairLock(R, -0.3, R * 0.55, 0.5, 0.12, hairDark, { dir: [-0.35, -1, 0] }));
  // tiara
  const tiara = group(
    part(torus(0.36, 0.022, Math.PI), gold, { rot: [-0.5, 0, 0] }),
    part(cone(0.06, 0.16, 4), gold, { pos: [0, 0.38, -0.12], rot: [-0.5, 0, 0] }),
    part(sphere(0.045), gloss(0x9b6bff, { transmission: 0.4 }), { pos: [0, 0.3, -0.04] }),
  );
  tiara.position.set(0, R * 0.62, 0.02);
  head.add(tiara);

  return new Rig({
    root, head, face, restLid: 0.12,
    tick(t) { fall.rotation.x = Math.sin(t * 1.3) * 0.03; },
  });
}

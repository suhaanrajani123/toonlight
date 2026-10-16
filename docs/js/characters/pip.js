// Professor Pip — the tiny, grumpy inventor owl (cartoon).
// Round owl with brass goggles, big bushy brows, a tool belt. Talks with his beak.
import * as THREE from 'three';
import { toon, flat, glow, metal, gloss, skinMat, hairMat, fabric, part, sphere, cone, cyl, torus, onSurface, buildFace, Rig } from '../toonkit.js';

export function build() {
  const feather = fabric(0x8c5b3c), featherDark = fabric(0x6b4128), belly = fabric(0xeccfa2), disc = fabric(0xf5e2c2);
  const beakMat = gloss(0xf0a032), brass = metal(0xd4a03c, 0.25), leather = toon(0x5a3a26, { rough: 0.7 });
  const root = new THREE.Group();

  // --- body ---
  const body = part(sphere(0.62), feather, { pos: [0, 0.68, 0], scale: [1, 1.05, 0.92], ol: 0.025 });
  root.add(body);
  root.add(part(sphere(0.5), belly, { pos: [0, 0.6, 0.3], scale: [0.9, 0.95, 0.55] }));
  // belly feather marks
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.13, y = 0.5 + (i % 2) * 0.14;
    root.add(part(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), flat(0xc69a63), { pos: [x, y, 0.57 - Math.abs(x) * 0.3], rot: [0, 0, Math.PI] }));
  }
  root.add(part(torus(0.6, 0.05), leather, { pos: [0, 0.38, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.92, 1] })); // tool belt
  root.add(part(new THREE.BoxGeometry(0.14, 0.14, 0.08), leather, { pos: [0.3, 0.32, 0.47], rot: [0, 0.5, 0], ol: 0.05 })); // pouch
  const wrench = part(cyl(0.022, 0.022, 0.26), metal(0xc8cdd8, 0.2), { pos: [-0.3, 0.38, 0.5], rot: [0, 0, 0.5], ol: 0.1 });
  wrench.add(part(torus(0.04, 0.018), metal(0xc8cdd8, 0.2), { pos: [0, 0.14, 0] }));
  root.add(wrench);
  const wings = [-1, 1].map((s) => {
    const w = part(sphere(0.3), featherDark, { pos: [s * 0.58, 0.68, -0.02], scale: [0.35, 0.9, 0.7], rot: [0, 0, s * 0.15], ol: 0.05 });
    root.add(w);
    return w;
  });
  [-1, 1].forEach((s) => [-0.05, 0, 0.05].forEach((dx) =>
    root.add(part(sphere(0.05), beakMat, { pos: [s * 0.2 + dx, 0.05, 0.3], scale: [0.8, 0.6, 1.5] }))));

  // --- head ---
  const head = new THREE.Group();
  head.position.set(0, 1.42, 0);
  root.add(head);
  const R = 0.52;
  head.add(part(sphere(R), feather, { scale: [1.08, 0.95, 0.95], ol: 0.025 }));
  // facial discs behind each eye
  [-1, 1].forEach((s) => {
    const p = onSurface(R, s * 0.36 * R, 0.0, 0.08);
    const d = part(sphere(0.21), disc, { pos: p.toArray(), scale: [1, 1, 0.45] });
    d.lookAt(p.clone().multiplyScalar(2));
    head.add(d);
  });
  const face = buildFace(head, R, {
    eye: { style: 'round', iris: 0xf08a1c, size: 0.25, spacing: 0.36, y: 0.02 },
    brow: { color: 0xeeeeee, w: 0.34, thick: 0.07, y: 0.55 },
    mouth: { y: -0.5, w: 0.05 },
    blush: false,
  });
  face.mouth.group.visible = false; // Pip talks with his beak instead

  // goggles over the eyes + strap round the head
  [-1, 1].forEach((s) => {
    const p = onSurface(R, s * 0.36 * R, 0.02 * R, -0.06);
    const g = part(torus(0.15, 0.035), brass, { pos: p.toArray(), ol: 0.12 });
    g.lookAt(p.clone().multiplyScalar(2));
    head.add(g);
  });
  head.add(part(torus(R * 1.05, 0.03), leather, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [1.08, 0.95, 1] }));

  // beak: upper part is fixed, lower part hinges open as he talks
  const bp = onSurface(R, 0, -0.5 * R, -0.1);
  head.add(part(cone(0.09, 0.22, 4), beakMat, { pos: [bp.x, bp.y, bp.z], rot: [Math.PI - 0.4, Math.PI / 4, 0], ol: 0.08 }));
  const jaw = new THREE.Group();
  jaw.position.set(bp.x, bp.y - 0.04, bp.z - 0.04);
  jaw.add(part(cone(0.05, 0.1, 4), gloss(0xd98b20), { pos: [0, -0.02, 0.05], rot: [Math.PI - 0.9, Math.PI / 4, 0], ol: 0.08 }));
  head.add(jaw);

  // ear tufts
  [-1, 1].forEach((s) => head.add(part(cone(0.1, 0.3, 8), featherDark, { pos: [s * 0.36, 0.48, -0.05], rot: [0, 0, -s * 0.45], ol: 0.05 })));

  return new Rig({
    root, head, face, restLid: 0.3,
    setMouth(v) { jaw.rotation.x = v * 0.55; },
    tick(t, dt, rig) {
      const flap = rig.speaking ? Math.sin(t * 8) * 0.12 : Math.sin(t * 1.4) * 0.03;
      wings[0].rotation.z = -0.15 - flap;
      wings[1].rotation.z = 0.15 + flap;
    },
  });
}

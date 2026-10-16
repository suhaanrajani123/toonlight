// Marlowe — the dramatic detective cat (cartoon).
// Grey tabby in a trench coat and fedora, half-lidded slit eyes, swishing tail.
import * as THREE from 'three';
import { toon, flat, glow, metal, gloss, skinMat, hairMat, fabric, part, sphere, capsule, cone, cyl, torus, onSurface, buildFace, Rig, INK } from '../toonkit.js';

// Grey fur with darker tabby stripes, drawn on a canvas and wrapped onto the head.
function tabbyTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#a3a3b4';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#6f6f84';
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 26;
    g.beginPath();
    g.ellipse(x, 34, 7, 30, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function build() {
  const furOpts = { rough: 0.85, sheen: 0.5, sheenRoughness: 0.8 };
  const fur = toon(0xffffff, { map: tabbyTexture(), ...furOpts }), furPlain = toon(0xa3a3b4, furOpts), furDark = toon(0x6f6f84, furOpts);
  const coat = fabric(0xc29d5e), coatDark = fabric(0x8f6f3a), hat = fabric(0x3a3240), band = toon(0x8c2f45, { rough: 0.35 });
  const white = toon(0xf4f2f6, furOpts), pink = gloss(0xf597ab);
  const root = new THREE.Group();

  // --- trench coat ---
  root.add(part(cyl(0.22, 0.48, 0.92), coat, { pos: [0, 0.6, 0], ol: 0.03 }));
  root.add(part(torus(0.4, 0.04), coatDark, { pos: [0, 0.62, 0], rot: [Math.PI / 2, 0, 0], scale: [0.98, 1, 1] })); // belt
  root.add(part(new THREE.BoxGeometry(0.1, 0.08, 0.04), metal(0xd8c070), { pos: [0, 0.62, 0.4] }));                  // buckle
  [-1, 1].forEach((s) => {
    root.add(part(new THREE.BoxGeometry(0.16, 0.26, 0.04), coatDark, { pos: [s * 0.11, 0.95, 0.2], rot: [-0.3, 0, s * -0.35], ol: 0.05 })); // lapels
    root.add(part(capsule(0.075, 0.42), coat, { pos: [s * 0.33, 0.74, 0.03], rot: [0, 0, s * 0.2], ol: 0.05 }));
    root.add(part(sphere(0.075), furPlain, { pos: [s * 0.38, 0.48, 0.05], ol: 0.06 }));
    root.add(part(sphere(0.1), furPlain, { pos: [s * 0.14, 0.05, 0.08], scale: [0.9, 0.55, 1.3], ol: 0.05 }));
  });
  [0.82, 0.42].forEach((y) => [-1, 1].forEach((s) => root.add(part(sphere(0.025), flat(INK), { pos: [s * 0.08, y, y > 0.6 ? 0.28 : 0.42] }))));

  // tail: a curve that swishes
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.22, -0.3), new THREE.Vector3(0.4, 0.15, -0.4),
    new THREE.Vector3(0.68, 0.35, -0.3), new THREE.Vector3(0.75, 0.66, -0.15),
  ]);
  const tail = new THREE.Group();
  tail.add(part(new THREE.TubeGeometry(tailCurve, 24, 0.06, 10), furPlain, { ol: 0.12 }));
  tail.add(part(sphere(0.07), furDark, { pos: [0.75, 0.66, -0.15] }));
  root.add(tail);

  // --- head ---
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  root.add(head);
  root.add(part(cyl(0.08, 0.09, 0.2), furPlain, { pos: [0, 1.1, 0] }));
  const R = 0.52;
  const skull = part(sphere(R), fur, { scale: [1.08, 0.95, 0.95], rot: [0, -Math.PI / 2, 0], ol: 0.025 });
  head.add(skull);
  // muzzle: two puffy cheeks + chin, nose
  [-1, 1].forEach((s) => {
    const p = onSurface(R, s * 0.12, -0.2, 0.08);
    head.add(part(sphere(0.12), white, { pos: p.toArray(), scale: [1, 0.8, 0.8] }));
  });
  head.add(part(sphere(0.07), pink, { pos: onSurface(R, 0, -0.1, -0.06).toArray(), scale: [1.2, 0.8, 0.8], ol: 0.08 }));
  // whiskers
  [-1, 1].forEach((s) => [-0.04, 0.02].forEach((dy, i) => {
    const w = part(cyl(0.006, 0.006, 0.38), flat(INK), { pos: [s * 0.36, -0.2 + dy, 0.4], rot: [0, s * -0.4, Math.PI / 2 + s * (i ? 0.12 : -0.08)] });
    head.add(w);
  }));
  const face = buildFace(head, R, {
    eye: { style: 'round', iris: 0xbad43d, size: 0.22, spacing: 0.34, y: 0.1, slit: true },
    brow: { color: 0x4a4a5e, w: 0.2, thick: 0.035 },
    mouth: { y: -0.48, w: 0.07, color: 0x5a1f2e },
    blush: false,
  });
  // ears
  [-1, 1].forEach((s) => {
    head.add(part(cone(0.17, 0.3, 4), furPlain, { pos: [s * 0.46, 0.3, -0.05], rot: [0, Math.PI / 4, -s * 0.9], ol: 0.05 }));
    head.add(part(cone(0.1, 0.2, 4), pink, { pos: [s * 0.45, 0.29, 0.02], rot: [0, Math.PI / 4, -s * 0.9] }));
  });

  // fedora, tipped forward a little
  const fedora = new THREE.Group();
  fedora.add(part(cyl(0.68, 0.68, 0.035, 48), hat, { ol: 0.03 }));
  fedora.add(part(cyl(0.34, 0.4, 0.34, 32), hat, { pos: [0, 0.18, 0], ol: 0.04 }));
  fedora.add(part(cyl(0.405, 0.405, 0.08, 32), band, { pos: [0, 0.06, 0] }));
  fedora.add(part(sphere(0.3), hat, { pos: [0, 0.33, 0], scale: [1.1, 0.25, 1.25] })); // pinched crown top
  fedora.position.set(0, R * 0.78, -0.02);
  fedora.rotation.set(0.14, 0, -0.08);
  head.add(fedora);

  return new Rig({
    root, head, face, restLid: 0.3,
    tick(t, dt, rig) {
      tail.rotation.y = Math.sin(t * 1.6) * 0.35;
      tail.rotation.z = Math.sin(t * 1.1) * 0.06;
    },
  });
}

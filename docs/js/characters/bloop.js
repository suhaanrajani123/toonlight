// Bloop — the silly jelly blob (cartoon).
// A see-through mint blob with a glowing core, big eyes and a wobbly antenna.
import * as THREE from 'three';
import { toon, flat, glow, metal, gloss, skinMat, hairMat, fabric, part, sphere, cyl, buildFace, Rig } from '../toonkit.js';

export function build() {
  // glassy jelly: light passes through it (transmission) and bends (ior)
  const jelly = toon(0x7ef0c6, { rough: 0.08, transmission: 0.55, thickness: 1.2, ior: 1.33, clearcoat: 1, sheen: 0, attenuationColor: 0x2fbf93, attenuationDistance: 1.5 });
  const root = new THREE.Group();

  // The whole blob is the "head", so it all turns to look at you.
  const head = new THREE.Group();
  head.position.set(0, 0.85, 0);
  root.add(head);
  const R = 0.85;
  const blob = part(sphere(R, 48, 32), jelly, { scale: [1.12, 0.98, 1], ol: 0.02 });
  head.add(blob);
  head.add(part(sphere(0.32), glow(0xd8fff3, { transparent: true, opacity: 0.35, depthWrite: false }), { pos: [0.1, -0.2, -0.1] })); // inner core
  head.add(part(sphere(0.16), glow(0xffffff, { transparent: true, opacity: 0.55 }), { pos: [-0.42, 0.45, 0.48], scale: [1.4, 0.7, 0.4], rot: [0, 0, 0.6] })); // shine
  // little floating bubbles inside
  const bubbles = [[0.35, 0.1, 0.2], [-0.3, -0.3, 0.1], [0.2, -0.45, 0.3]].map((p) => {
    const b = part(sphere(0.05), glow(0xffffff, { transparent: true, opacity: 0.6 }), { pos: p });
    head.add(b);
    return b;
  });

  const face = buildFace(head, R, {
    eye: { style: 'round', iris: null, size: 0.2, spacing: 0.3, y: 0.12 },
    brow: { color: 0x1e7a5c, w: 0.16, thick: 0.035, y: 0.55 },
    mouth: { y: -0.15, w: 0.17, color: 0x1e5a48 },
  });

  // antenna with a bubble on the end
  const antenna = new THREE.Group();
  antenna.position.set(0.05, R * 0.95, 0);
  antenna.add(part(cyl(0.02, 0.03, 0.35), jelly, { pos: [0, 0.17, 0], ol: 0.12 }));
  antenna.add(part(sphere(0.09), glow(0xffe066), { pos: [0, 0.38, 0], ol: 0.07 }));
  head.add(antenna);

  // stubby feet
  [-1, 1].forEach((s) => root.add(part(sphere(0.16), jelly, { pos: [s * 0.38, 0.06, 0.15], scale: [1.2, 0.5, 1.3], ol: 0.05 })));

  return new Rig({
    root, head, face,
    tick(t, dt, rig) {
      // squash-and-stretch jiggle; extra wobbly while talking
      const amp = rig.speaking ? 0.06 + rig.mouthOpen * 0.05 : 0.025;
      const sq = Math.sin(t * (rig.speaking ? 11 : 3)) * amp;
      head.scale.set(1 + sq, 1 - sq, 1 + sq * 0.5);
      head.position.y = 0.85 - sq * 0.4;
      antenna.rotation.z = Math.sin(t * 4.2) * 0.3;
      antenna.rotation.x = Math.cos(t * 3.1) * 0.15;
      bubbles.forEach((b, i) => { b.position.y = ((t * 0.15 + i * 0.33) % 1) * 0.9 - 0.5; });
    },
  });
}

// Fennick — the fox explorer and map-maker (cartoon).
// Orange fox with teal-tipped ears, paws and tail; leather aviator cap with goggles;
// patchwork vest; olive trousers and boots; magnifying glass in one paw, brass compass in the other.
import * as THREE from 'three';
import { toon, glow, metal, fabric, part, sphere, capsule, cone, cyl, torus, onSurface, buildFace, Rig } from '../toonkit.js';
import { legs, belt, torso, attachArms, Y } from '../body.js';

function fur(color) { return toon(color, { rough: 0.85, sheen: 0.7, sheenRoughness: 0.8 }); }

export function build() {
  const m = {
    fur: fur(0xd9752c), furDark: fur(0xa94f1c), cream: fur(0xf3e3c8), teal: fur(0x2f7f86), tealDark: fur(0x1f5a63),
    vest: toon(0x9a7343, { rough: 0.7 }), patchA: fabric(0x4f7aa0), patchB: fabric(0xc9a25e), patchC: fabric(0x7a5536),
    pants: fabric(0x6a6a3c), boot: toon(0x6b4325, { rough: 0.45, clearcoat: 0.3 }), leather: toon(0x6b4a2e, { rough: 0.55 }),
    brass: metal(0xcf9f45, 0.25), glass: toon(0xbfe8ff, { transmission: 0.9, rough: 0.05, thickness: 0.05, ior: 1.5, clearcoat: 1 }),
    nose: toon(0x1e1a1c, { rough: 0.2, clearcoat: 1 }),
  };
  const root = new THREE.Group();

  legs(root, { pants: m.pants, cargo: m.pants, shoe: { style: 'boot', mat: m.boot, sole: m.leather } });
  belt(root, { mat: m.leather, buckle: m.brass, r: 0.25 });
  [-1, 1].forEach((s) => root.add(part(new THREE.BoxGeometry(0.1, 0.12, 0.07), m.leather, { pos: [s * 0.22, 0.92, 0.13], rot: [0, s * -0.6, 0] })));
  // cream chest fur under a patchwork vest
  torso(root, { shirt: m.cream, neck: 'crew' });
  const vestGeo = new THREE.CylinderGeometry(0.285, 0.255, 0.6, 40, 1, true, Math.PI * 0.2, Math.PI * 1.6);
  root.add(part(vestGeo, toon(0x9a7343, { rough: 0.7, side: THREE.DoubleSide }), { pos: [0, 1.31, 0], scale: [1, 1, 0.82] }));
  [-1, 1].forEach((s) => {
    root.add(part(new THREE.BoxGeometry(0.11, 0.5, 0.03), m.vest, { pos: [s * 0.18, 1.3, 0.2], rot: [-0.05, s * -0.45, 0] }));
    root.add(part(sphere(0.12), m.fur, { pos: [s * 0.3, Y.shoulder, 0], scale: [1, 0.75, 0.9] }));
  });
  // patches, a pocket watch chain and a rolled map tube on the back
  [[0.2, 1.42, m.patchA], [-0.19, 1.25, m.patchB], [0.18, 1.15, m.patchC], [-0.2, 1.45, m.patchC]].forEach(([x, y, mat], i) =>
    root.add(part(new THREE.BoxGeometry(0.07, 0.07, 0.01), mat, { pos: [x, y, 0.225], rot: [0, Math.sign(x) * -0.45, i * 0.2] })));
  root.add(part(new THREE.TorusGeometry(0.06, 0.006, 6, 24, Math.PI), m.brass, { pos: [0.15, 1.2, 0.235], rot: [0, -0.45, Math.PI] }));
  root.add(part(cyl(0.05, 0.05, 0.5), m.patchB, { pos: [0.1, 1.3, -0.26], rot: [0, 0, 0.5] }));

  // arms: fur on the upper arm, teal "gloves" from the forearm down
  const { L, R: Rt } = attachArms(root, {
    skin: m.teal, sleeveMat: m.fur, sleeve: 'rolled', cuffMat: m.cream,
    left: { handStyle: 'grip' }, right: { handStyle: 'grip' },
  }, { left: 'hold', right: 'hold' });
  // right paw (character's right = -x) raises the magnifying glass; left paw holds the compass lower
  Rt.shoulder.rotation.set(-1.05, 0, -0.35);
  Rt.elbow.rotation.set(-0.9, 0, 0.55);
  Rt.rest = Rt.elbow.rotation.clone();
  L.shoulder.rotation.set(-0.55, 0, 0.3);
  L.elbow.rotation.set(-0.9, 0, -0.5);
  const glass = new THREE.Group();
  glass.add(part(cyl(0.018, 0.022, 0.16), m.leather, { pos: [0, -0.02, 0] }));
  glass.add(part(torus(0.1, 0.016), m.brass, { pos: [0, 0.16, 0] }));
  glass.add(part(new THREE.CircleGeometry(0.1, 32), m.glass, { pos: [0, 0.16, 0] }));
  glass.rotation.set(0.2, 0, 0.3);
  glass.position.set(0, -0.05, 0.03);
  Rt.hand.add(glass);
  const compass = new THREE.Group();
  compass.add(part(cyl(0.065, 0.065, 0.025), m.brass));
  compass.add(part(cyl(0.055, 0.055, 0.004), toon(0xf4ead2), { pos: [0, 0.014, 0] }));
  const needle = part(cone(0.012, 0.09, 3), toon(0xc0392b), { pos: [0, 0.019, 0], rot: [Math.PI / 2, 0, 0] });
  compass.add(needle);
  compass.add(part(torus(0.015, 0.005), m.brass, { pos: [0, 0, -0.075], rot: [Math.PI / 2, 0, 0] }));
  compass.rotation.set(1.3, 0, 0);
  compass.position.set(0, -0.06, 0.06);
  L.hand.add(compass);

  // bushy tail: a chain of fluffy spheres that curves out to the side, tipped teal
  const tail = new THREE.Group();
  tail.position.set(0, 0.95, -0.2);
  const pts = [[0, 0, 0], [0.18, -0.12, -0.2], [0.42, -0.1, -0.28], [0.62, 0.08, -0.24], [0.72, 0.32, -0.12]];
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const r = 0.06 + Math.sin(t * Math.PI) * 0.11;
    const mat = t > 0.8 ? m.teal : t > 0.65 ? m.tealDark : t < 0.25 ? m.fur : (i % 3 ? m.fur : m.furDark);
    tail.add(part(sphere(r), mat, { pos: curve.getPoint(t).toArray() }));
  }
  root.add(tail);

  // --- fox head ---
  const h = new THREE.Group();
  h.position.set(0, Y.head + 0.02, 0.01);
  root.add(h);
  root.add(part(cyl(0.08, 0.09, 0.16), m.fur, { pos: [0, Y.neck, 0] }));
  root.add(part(sphere(0.13), m.cream, { pos: [0, 1.6, 0.1], scale: [1.2, 0.7, 0.8] }));      // chest ruff
  const R = 0.27;
  h.add(part(sphere(R), m.fur, { scale: [1.05, 0.95, 0.95] }));
  // muzzle: cream lower jaw and an orange bridge, ending in a glossy black nose
  h.add(part(cone(0.13, 0.26, 24), m.cream, { pos: [0, -R * 0.42, R * 0.92], rot: [Math.PI / 2, 0, 0], scale: [1.15, 1, 0.75] }));
  h.add(part(cone(0.11, 0.24, 24), m.fur, { pos: [0, -R * 0.3, R * 0.9], rot: [Math.PI / 2 + 0.12, 0, 0], scale: [1, 1, 0.6] }));
  h.add(part(sphere(0.04), m.nose, { pos: [0, -R * 0.36, R * 1.38], scale: [1.2, 0.9, 1] }));
  // white cheek fluff
  [-1, 1].forEach((s) => h.add(part(cone(0.09, 0.2, 10), m.cream, { pos: [s * R * 0.92, -R * 0.42, R * 0.25], rot: [0, 0, s * 1.9] })));
  const face = buildFace(h, R, {
    eye: { style: 'anime', iris: 0x1f9e95, size: 0.16, spacing: 0.4, y: 0.06 },
    brow: { color: 0x1f5a63, w: 0.2, thick: 0.05, y: 0.36 },
    mouth: { y: -0.72, w: 0.16, color: 0x4a1a20, teeth: true },
    blush: false,
  });
  face.mouth.group.position.z += 0.03;
  // big ears with teal tips and cream insides, poking out through the cap
  [-1, 1].forEach((s) => {
    const ear = new THREE.Group();
    ear.position.set(s * R * 0.6, R * 0.8, -R * 0.05);
    ear.rotation.set(-0.1, 0, -s * 0.35);
    ear.add(part(cone(0.11, 0.32, 12), m.fur, { pos: [0, 0.14, 0], scale: [1, 1, 0.55] }));
    ear.add(part(cone(0.07, 0.22, 12), m.cream, { pos: [0, 0.12, 0.035], scale: [1, 1, 0.3] }));
    ear.add(part(cone(0.055, 0.12, 12), m.teal, { pos: [0, 0.26, 0], scale: [1, 1, 0.6] }));
    h.add(ear);
  });
  // leather aviator cap with ear flaps and goggles pushed up on the forehead
  h.add(part(new THREE.SphereGeometry(R * 1.08, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.45), m.leather, { pos: [0, R * 0.05, -R * 0.04], rot: [-0.15, 0, 0] }));
  [-1, 1].forEach((s) => h.add(part(sphere(0.09), m.leather, { pos: [s * R * 0.98, -R * 0.15, -R * 0.1], scale: [0.35, 1, 0.8] })));
  [-1, 1].forEach((s) => {
    const p = onSurface(R * 1.1, s * R * 0.32, R * 0.62);
    const ring = part(torus(0.07, 0.022), m.brass, { pos: p.toArray() });
    ring.lookAt(p.clone().multiplyScalar(2));
    h.add(ring);
    const lens = part(new THREE.CircleGeometry(0.06, 24), glow(0x7fd3ff, { transparent: true, opacity: 0.75 }), { pos: p.clone().multiplyScalar(1.01).toArray() });
    lens.lookAt(p.clone().multiplyScalar(2));
    h.add(lens);
  });
  h.add(part(torus(R * 1.07, 0.02), m.leather, { pos: [0, R * 0.5, -R * 0.06], rot: [Math.PI / 2 + 0.25, 0, 0] })); // goggle strap

  return new Rig({
    root, head: h, face, arms: { L, R: Rt }, restMouth: 0.25,
    tick(t, dt, rig) {
      tail.rotation.y = Math.sin(t * 1.5) * 0.25;
      tail.rotation.z = Math.sin(t * 2.1) * 0.06;
      needle.rotation.z = Math.sin(t * 0.9) * 0.6;
      // when talking, he waves the magnifying glass around like he's investigating
      const g = rig.speaking ? Math.sin(t * 2.8) * 0.2 : Math.sin(t * 1.1) * 0.04;
      Rt.elbow.rotation.x = Rt.rest.x + g;
    },
  });
}

// Kaito Hayabusa — the cheerful wandering adventurer (anime).
// Messy dark hair, stubble and a big grin; olive field jacket over an orange shirt and
// a dark knit vest; wolf-tooth pendant, leather bracers, belt with pouch, backpack, cargo pants.
// Built with grown-up proportions (about 5 heads tall) instead of the chibi look.
import * as THREE from 'three';
import { toon, flat, glow, metal, gloss, skinMat, hairMat, fabric, part, sphere, capsule, cone, cyl, torus, onSurface, buildFace, Rig } from '../toonkit.js';

// A two-joint arm: shoulder → elbow → hand. Returns the groups so it can be posed/animated.
function arm(side, m) {
  const shoulder = new THREE.Group();
  const upper = part(capsule(0.075, 0.26), m.jacket, {});
  upper.position.y = -0.17;
  shoulder.add(upper);
  // rolled-up sleeve cuff just above the elbow
  shoulder.add(part(cyl(0.088, 0.085, 0.07), m.jacketLight, { pos: [0, -0.33, 0] }));
  const elbow = new THREE.Group();
  elbow.position.y = -0.36;
  shoulder.add(elbow);
  elbow.add(part(capsule(0.06, 0.22), m.skin, { pos: [0, -0.14, 0] }));               // forearm
  elbow.add(part(cyl(0.068, 0.066, 0.09), m.leather, { pos: [0, -0.24, 0] }));         // bracer
  elbow.add(part(torus(0.067, 0.008), m.leatherDark, { pos: [0, -0.215, 0], rot: [Math.PI / 2, 0, 0] }));
  elbow.add(part(torus(0.067, 0.008), m.leatherDark, { pos: [0, -0.265, 0], rot: [Math.PI / 2, 0, 0] }));
  const hand = new THREE.Group();
  hand.position.y = -0.33;
  elbow.add(hand);
  hand.add(part(sphere(0.06), m.skin, { scale: [1, 1.15, 0.6] }));                       // palm
  // four fingers + thumb, slightly spread
  for (let i = 0; i < 4; i++) {
    hand.add(part(capsule(0.014, 0.05), m.skin, { pos: [(i - 1.5) * 0.026, -0.085, 0], rot: [0, 0, (i - 1.5) * 0.08] }));
  }
  hand.add(part(capsule(0.016, 0.04), m.skin, { pos: [side * -0.06, -0.03, 0.02], rot: [0, 0, side * 0.9] }));
  return { shoulder, elbow, hand };
}

export function build() {
  const m = {
    skin: skinMat(0xe2a983),
    hair: hairMat(0x2a1f1a), hairHi: hairMat(0x3b2c24),
    jacket: fabric(0x5b6640), jacketLight: fabric(0x7a8458), jacketDark: fabric(0x444d2f),
    shirt: fabric(0xd9672a), vest: fabric(0x2f333b),
    pants: fabric(0x4a4034), leather: toon(0x7a4a2a, { rough: 0.55 }), leatherDark: toon(0x4e2e1a, { rough: 0.6 }),
    brass: metal(0xc99a45, 0.3), silver: metal(0xcfd3da, 0.25), boot: toon(0x5a3820, { rough: 0.45, clearcoat: 0.3 }),
    pack: fabric(0x6b5232), roll: fabric(0x8a6b45),
  };
  const root = new THREE.Group();

  // --- legs & boots ---
  [-1, 1].forEach((s) => {
    root.add(part(capsule(0.1, 0.62), m.pants, { pos: [s * 0.12, 0.56, 0] }));
    root.add(part(new THREE.BoxGeometry(0.1, 0.13, 0.05), m.pants, { pos: [s * 0.2, 0.62, 0.03], rot: [0, s * 0.5, 0] }));  // cargo pocket
    root.add(part(capsule(0.085, 0.12), m.boot, { pos: [s * 0.12, 0.15, 0.0] }));
    root.add(part(sphere(0.1), m.boot, { pos: [s * 0.12, 0.06, 0.07], scale: [0.9, 0.6, 1.5] }));
    root.add(part(cyl(0.1, 0.1, 0.03), m.leatherDark, { pos: [s * 0.12, 0.015, 0.04], scale: [0.9, 1, 1.5] }));        // sole
  });

  // --- hips & belt ---
  root.add(part(cyl(0.24, 0.25, 0.2), m.pants, { pos: [0, 0.94, 0] }));
  root.add(part(cyl(0.255, 0.255, 0.07), m.leather, { pos: [0, 1.0, 0] }));
  root.add(part(new THREE.BoxGeometry(0.09, 0.07, 0.025), m.brass, { pos: [0, 1.0, 0.255] }));
  root.add(part(new THREE.BoxGeometry(0.05, 0.035, 0.03), m.leatherDark, { pos: [0, 1.0, 0.262] }));
  const pouch = part(new THREE.BoxGeometry(0.13, 0.15, 0.08), m.leather, { pos: [-0.24, 0.9, 0.12], rot: [0, -0.7, 0] });
  pouch.add(part(new THREE.BoxGeometry(0.135, 0.06, 0.085), m.leatherDark, { pos: [0, 0.05, 0.004] }));
  root.add(pouch);

  // --- torso: knit vest over orange shirt ---
  root.add(part(cyl(0.27, 0.23, 0.6), m.vest, { pos: [0, 1.32, 0], scale: [1, 1, 0.78] }));
  for (let i = 0; i < 6; i++) root.add(part(cyl(0.006, 0.006, 0.5), m.jacketDark, { pos: [-0.12 + i * 0.048, 1.3, 0.205 - Math.abs(i - 2.5) * 0.008], rot: [-0.08, 0, 0] })); // knit ribs
  root.add(part(cone(0.1, 0.2, 3), m.shirt, { pos: [0, 1.53, 0.17], rot: [Math.PI, 0, 0], scale: [1, 1, 0.3] })); // shirt V at the neck

  // --- open field jacket: a shell around the back and sides, open at the front ---
  const shell = new THREE.CylinderGeometry(0.3, 0.27, 0.66, 40, 1, true, Math.PI * 0.18, Math.PI * 1.64);
  root.add(part(shell, toon(0x5b6640, { rough: 0.8, sheen: 0.3, side: THREE.DoubleSide }), { pos: [0, 1.28, 0], scale: [1, 1, 0.82] }));
  [-1, 1].forEach((s) => {
    // lapels / front panels hanging open
    root.add(part(new THREE.BoxGeometry(0.1, 0.56, 0.03), m.jacket, { pos: [s * 0.2, 1.3, 0.2], rot: [-0.06, s * -0.45, s * 0.04] }));
    root.add(part(new THREE.BoxGeometry(0.1, 0.1, 0.02), m.jacketDark, { pos: [s * 0.21, 1.42, 0.225], rot: [0, s * -0.45, 0] })); // chest pocket flap
    root.add(part(sphere(0.012), m.brass, { pos: [s * 0.21, 1.4, 0.24] }));
    root.add(part(sphere(0.13), m.jacket, { pos: [s * 0.3, 1.56, 0], scale: [1, 0.75, 0.9] }));                          // shoulder
    // backpack straps over the shoulders
    root.add(part(new THREE.BoxGeometry(0.05, 0.5, 0.02), m.leatherDark, { pos: [s * 0.15, 1.32, 0.215], rot: [0.06, 0, s * -0.1] }));
  });
  root.add(part(torus(0.15, 0.04, Math.PI * 1.3), m.jacketLight, { pos: [0, 1.62, -0.02], rot: [Math.PI / 2 - 0.25, 0, Math.PI * 0.85] })); // collar

  // --- backpack + bedroll ---
  root.add(part(new THREE.BoxGeometry(0.42, 0.48, 0.2), m.pack, { pos: [0, 1.3, -0.33], rot: [0.05, 0, 0] }));
  root.add(part(new THREE.BoxGeometry(0.3, 0.16, 0.06), m.leather, { pos: [0, 1.2, -0.45] }));
  root.add(part(cyl(0.09, 0.09, 0.5), m.roll, { pos: [0, 1.62, -0.32], rot: [0, 0, Math.PI / 2] }));
  [-0.15, 0.15].forEach((x) => root.add(part(torus(0.092, 0.012), m.leatherDark, { pos: [x, 1.62, -0.32], rot: [0, Math.PI / 2, 0] })));

  // --- arms: left hand on hip, right arm open in a welcoming gesture ---
  const L = arm(1, m), Rt = arm(-1, m);
  L.shoulder.position.set(0.33, 1.56, 0);
  L.shoulder.rotation.set(0.1, 0, 0.5);
  L.elbow.rotation.set(-0.3, 0, -1.75);
  L.hand.rotation.set(0, 0, 0.6);
  Rt.shoulder.position.set(-0.33, 1.56, 0);
  Rt.shoulder.rotation.set(-0.15, 0, -0.75);
  Rt.elbow.rotation.set(-1.1, 0, -0.75);
  Rt.hand.rotation.set(0.2, -0.9, -0.2);
  root.add(L.shoulder, Rt.shoulder);
  const restElbow = Rt.elbow.rotation.clone();

  // --- neck & pendant ---
  root.add(part(cyl(0.075, 0.085, 0.16), m.skin, { pos: [0, 1.66, 0] }));
  root.add(part(torus(0.1, 0.006), m.leatherDark, { pos: [0, 1.6, 0.07], rot: [Math.PI / 2 - 0.9, 0, 0] }));
  const pendant = part(cone(0.025, 0.07, 4), m.silver, { pos: [0, 1.47, 0.19], rot: [Math.PI, 0, 0] });
  root.add(pendant);

  // --- head ---
  const head = new THREE.Group();
  head.position.set(0, 1.93, 0.01);
  root.add(head);
  const R = 0.25;
  head.add(part(sphere(R), m.skin, { scale: [0.95, 1.05, 0.98] }));
  head.add(part(sphere(R * 0.62), m.skin, { pos: [0, -R * 0.55, R * 0.25], scale: [1.15, 0.8, 1] }));   // strong jaw
  // stubble: a soft dark layer over the jaw and chin
  const stubble = toon(0x8a5d45, { rough: 0.95, sheen: 0.2 }); // darker skin tone = five-o'clock shadow
  head.add(part(sphere(R * 0.64), stubble, { pos: [0, -R * 0.56, R * 0.27], scale: [1.17, 0.82, 1.02] }));
  head.add(part(sphere(R * 0.14), m.skin, { pos: onSurface(R, 0, -R * 0.12, -0.1).toArray(), scale: [0.8, 1, 1.2] })); // nose
  [-1, 1].forEach((s) => head.add(part(sphere(R * 0.16), m.skin, { pos: [s * R * 0.95, -R * 0.05, 0], scale: [0.5, 1, 0.8] }))); // ears
  const face = buildFace(head, R, {
    eye: { style: 'anime', iris: 0x6b3f22, size: 0.15, spacing: 0.36, y: 0.02 },
    brow: { color: 0x241a15, w: 0.22, thick: 0.05, y: 0.3 },
    mouth: { y: -0.46, w: 0.27, color: 0x5e1d24, teeth: true },
    blush: false,
  });

  // messy, spiky hair: a cap plus tufts pointing up, back and a few falling forward
  head.add(part(sphere(R * 1.06), m.hair, { pos: [0, R * 0.12, -R * 0.12], scale: [1, 0.95, 1] }));
  const tufts = new THREE.Group();
  const rnd = (i) => Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
  for (let i = 0; i < 18; i++) {
    const a = i * 2.399; // golden-angle spread over the scalp
    const yUp = 0.3 + 0.7 * ((i + 0.5) / 18);
    const r = Math.sqrt(1 - yUp * yUp);
    const d = new THREE.Vector3(Math.cos(a) * r, yUp, Math.sin(a) * r - 0.3).normalize();
    if (d.z > 0.5 && d.y < 0.8) continue; // keep the face clear
    const len = 0.13 + rnd(i) * 0.07;
    const t = part(cone(0.075, len, 8), i % 3 ? m.hair : m.hairHi);
    t.scale.set(1, 1, 0.55); // flat chunky locks, not needles
    // tufts sweep up and back, each with a slightly different lean
    const tip = d.clone().add(new THREE.Vector3((rnd(i + 7) - 0.5) * 0.6, 0.55, -0.55)).normalize();
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip);
    t.position.copy(d.multiplyScalar(R * 0.98)).add(new THREE.Vector3(0, R * 0.12, -R * 0.1)).add(tip.clone().multiplyScalar(len * 0.3));
    tufts.add(t);
  }
  // fringe: a few strands falling over the forehead
  [[-0.12, -0.6], [-0.03, -0.2], [0.07, 0.35], [0.15, 0.7]].forEach(([x, tilt]) => {
    const t = part(cone(0.04, 0.13, 6), m.hair);
    const p = onSurface(R, x, R * 0.62, -0.02);
    t.position.set(p.x, p.y + 0.02, p.z + 0.03);
    t.rotation.set(Math.PI + 0.7, 0, tilt);
    tufts.add(t);
  });
  [-1, 1].forEach((s) => tufts.add(part(capsule(0.025, 0.08), m.hair, { pos: [s * R * 0.9, -R * 0.05, R * 0.25] }))); // sideburns
  head.add(tufts);

  return new Rig({
    root, head, face, restMouth: 0.5,
    tick(t, dt, rig) {
      // relaxed sway; when talking, the open hand gestures along with the words
      root.rotation.y = Math.sin(t * 0.7) * 0.04;
      const g = rig.speaking ? Math.sin(t * 3.1) * 0.18 + rig.mouthOpen * 0.12 : Math.sin(t * 1.2) * 0.03;
      Rt.elbow.rotation.x = restElbow.x - g;
      Rt.elbow.rotation.z = restElbow.z + g * 0.4;
      pendant.rotation.z = Math.sin(t * 2) * 0.1;
      tufts.rotation.z = Math.sin(t * 1.7) * 0.01;
    },
  });
}

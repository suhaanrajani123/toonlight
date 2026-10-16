// Jun Arata — the laid-back tech kid (anime).
// Short spiky black hair, black techwear jacket with pockets and mesh sleeves, grey tee,
// sling bag across the chest, black cargo joggers with straps, chunky orange sneakers.
import * as THREE from 'three';
import { toon, metal, skinMat, hairMat, fabric, part, Rig } from '../toonkit.js';
import { legs, torso, jacket, crossbody, attachArms, head, hairSpiky } from '../body.js';

export function build() {
  const m = {
    skin: skinMat(0xefc29f), hair: hairMat(0x15161a), hairHi: hairMat(0x2a2c33),
    jacket: toon(0x1c1d22, { rough: 0.6, sheen: 0.3 }), jacketDark: fabric(0x121317), tee: fabric(0x3a3c42),
    pants: fabric(0x18191d), strap: toon(0x2a2b31, { rough: 0.5 }), buckle: metal(0x9aa0aa, 0.3),
    mesh: toon(0x111114, { transparent: true, opacity: 0.55, rough: 0.8, depthWrite: false }),
    shoe: toon(0x8a4a24, { rough: 0.5 }), shoeAccent: toon(0x1b1b1f, { rough: 0.5 }), sole: fabric(0xd9d2c4),
    watch: { strap: toon(0x111114, { rough: 0.4 }), face: metal(0x2b2f36, 0.2) },
  };
  const root = new THREE.Group();

  legs(root, { pants: m.pants, cargo: m.jacketDark, legR: 0.105, shoe: { style: 'sneaker', mat: m.shoe, sole: m.sole, accent: m.shoeAccent } });
  // ankle cuffs and dangling straps on the joggers
  [-1, 1].forEach((s) => {
    root.add(part(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 24), m.jacketDark, { pos: [s * 0.12, 0.22, 0] }));
    root.add(part(new THREE.BoxGeometry(0.02, 0.2, 0.01), m.strap, { pos: [s * 0.2, 0.62, 0.06], rot: [0, s * 0.6, s * 0.1] }));
    root.add(part(new THREE.BoxGeometry(0.03, 0.025, 0.012), m.buckle, { pos: [s * 0.2, 0.52, 0.065], rot: [0, s * 0.6, 0] }));
  });
  torso(root, { shirt: m.tee, neck: 'crew' });
  jacket(root, { mat: m.jacket, collar: 'band', band: m.jacketDark, zipper: m.buckle, pockets: m.jacketDark, len: 0.62, open: 0.3 });
  crossbody(root, { mat: m.jacketDark, strap: m.strap, side: 1, size: [0.17, 0.12, 0.07], y: 1.3 });
  const { L, R: Rt } = attachArms(root, {
    skin: m.skin, sleeveMat: m.jacket, sleeve: 'rolled', cuffMat: m.jacketDark, mesh: m.mesh,
    left: { watch: m.watch, handStyle: 'grip' }, right: { handStyle: 'grip' },
  }, { left: 'down', right: 'down' });

  const { head: h, face, R } = head(root, {
    skin: m.skin, eye: { iris: 0x2b1d16, size: 0.15 }, brow: { color: 0x101114, w: 0.21, thick: 0.045 },
    mouth: { w: 0.27 },
  });
  const tufts = hairSpiky(h, R, { mat: m.hair, hi: m.hairHi, count: 22, len: 0.11, sideburns: false });

  return new Rig({
    root, head: h, face, restMouth: 0.55,
    tick(t, dt, rig) {
      // easy-going bounce on the toes; arms swing a little when talking
      root.position.y = rig.rootBaseY + Math.abs(Math.sin(t * 1.6)) * 0.008;
      const g = rig.speaking ? Math.sin(t * 2.6) * 0.08 : 0;
      L.shoulder.rotation.x = 0.04 + g;
      Rt.shoulder.rotation.x = 0.04 - g;
      tufts.rotation.z = Math.sin(t * 1.4) * 0.01;
    },
  });
}

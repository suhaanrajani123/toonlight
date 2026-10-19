// Raven Ashford — the night-market rogue (anime).
// Long wavy brown hair under a black cap; black leather jacket with a patch over a black top,
// pendant, cargo skirt with pouches, backpack with bedroll, bangles and a cuff, boots.
import * as THREE from 'three';
import { toon, metal, skinMat, hairMat, fabric, part, Rig } from '../toonkit.js';
import { legs, belt, torso, jacket, backpack, necklace, attachArms, head, hairLong, cap } from '../body.js';

export function build() {
  const m = {
    skin: skinMat(0xf0c3a4), hair: hairMat(0x4a2e22), hairHi: hairMat(0x6b4330),
    leather: toon(0x1d1d22, { rough: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 }), black: fabric(0x1e1f24), blackSoft: fabric(0x2b2c33),
    silver: metal(0xd2d6dd, 0.22), strap: toon(0x26262b, { rough: 0.5 }), patch: fabric(0x3a3c45),
    boot: toon(0x18181c, { rough: 0.35, clearcoat: 0.5 }), roll: fabric(0x2e2f36),
  };
  const root = new THREE.Group();

  legs(root, {
    skin: m.skin, legR: 0.078, width: 0.11,
    skirt: { mat: m.black, top: 0.21, bottom: 0.3, len: 0.3, y: 0.86 },
    shoe: { style: 'boot', mat: m.boot, sole: m.strap },
  });
  // knee-high boots
  [-1, 1].forEach((s) => root.add(part(capsule2(0.085, 0.3), m.boot, { pos: [s * 0.11, 0.3, 0] })));
  // cargo pouches on the skirt
  [-1, 1].forEach((s) => root.add(part(new THREE.BoxGeometry(0.1, 0.12, 0.06), m.blackSoft, { pos: [s * 0.2, 0.84, 0.14], rot: [0, s * -0.5, 0] })));
  belt(root, { mat: m.strap, buckle: m.silver, y: 1.02, r: 0.22 });
  torso(root, { shirt: m.black, female: true, neck: 'crew' });
  jacket(root, { mat: m.leather, collar: 'lapel', len: 0.5, zipper: m.silver, patch: m.patch, flare: 0.25 });
  backpack(root, { mat: m.blackSoft, strap: m.strap, roll: m.roll });
  const pendant = necklace(root, { cord: m.silver, pendant: m.silver, y: 1.45, z: 0.21, long: true });
  const { L, R: Rt } = attachArms(root, {
    skin: m.skin, sleeveMat: m.leather, sleeve: 'full', upperR: 0.064, foreR: 0.052,
    left: { bracer: m.silver }, right: { bangles: [m.silver, m.strap, m.silver, m.strap] },
  }, { left: 'hip', right: 'open', width: 0.3 });

  const { head: h, face, R } = head(root, {
    skin: m.skin, female: true, R: 0.24,
    eye: { iris: 0x5a3a22, size: 0.165, spacing: 0.37 }, brow: { color: 0x3a2318 },
    mouth: { w: 0.25, color: 0x8a2a3a },
  });
  const locks = hairLong(h, R, { mat: m.hair, hi: m.hairHi, length: 0.62, bangs: 'none', volume: 1.08 });
  cap(h, R, { mat: m.black, brim: m.black, patch: m.patch });

  return new Rig({
    root, head: h, face, arms: { L, R: Rt }, restMouth: 0.45,
    tick(t, dt, rig) {
      root.rotation.y = Math.sin(t * 0.6) * 0.04;
      const g = rig.speaking ? Math.sin(t * 3) * 0.16 + rig.mouthOpen * 0.1 : Math.sin(t * 1.1) * 0.03;
      Rt.elbow.rotation.x = Rt.rest.x - g;
      Rt.elbow.rotation.z = Rt.rest.z - g * 0.4;
      locks.rotation.x = Math.sin(t * 1.3) * 0.02;
      pendant.rotation.z = Math.sin(t * 2.2) * 0.1;
    },
  });
}

function capsule2(r, len) { return new THREE.CapsuleGeometry(r, len, 8, 20); }

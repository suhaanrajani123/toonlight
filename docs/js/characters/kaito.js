// Kaito Hayabusa — the cheerful wandering adventurer (anime).
// Messy dark hair, stubble and a big grin; olive field jacket with rolled sleeves over an
// orange shirt and dark knit vest; pendant, leather bracers, belt with pouch, backpack, cargo pants.
import * as THREE from 'three';
import { toon, metal, skinMat, hairMat, fabric, part, Rig } from '../toonkit.js';
import { legs, belt, torso, jacket, backpack, necklace, attachArms, head, hairSpiky } from '../body.js';

export function build() {
  const m = {
    skin: skinMat(0xe2a983), hair: hairMat(0x2a1f1a), hairHi: hairMat(0x3b2c24),
    jacket: fabric(0x5b6640), jacketLight: fabric(0x7a8458), jacketDark: fabric(0x444d2f),
    shirt: fabric(0xd9672a), vest: fabric(0x2f333b), pants: fabric(0x4a4034),
    leather: toon(0x7a4a2a, { rough: 0.55 }), leatherDark: toon(0x4e2e1a, { rough: 0.6 }),
    brass: metal(0xc99a45, 0.3), silver: metal(0xcfd3da, 0.25), boot: toon(0x5a3820, { rough: 0.45, clearcoat: 0.3 }),
    pack: fabric(0x6b5232), roll: fabric(0x8a6b45),
  };
  const root = new THREE.Group();

  legs(root, { pants: m.pants, cargo: m.pants, shoe: { style: 'boot', mat: m.boot, sole: m.leatherDark } });
  belt(root, { mat: m.leather, buckle: m.brass, r: 0.25 });
  const pouch = part(new THREE.BoxGeometry(0.13, 0.15, 0.08), m.leather, { pos: [-0.24, 0.9, 0.12], rot: [0, -0.7, 0] });
  pouch.add(part(new THREE.BoxGeometry(0.135, 0.06, 0.085), m.leatherDark, { pos: [0, 0.05, 0.004] }));
  root.add(pouch);
  torso(root, { shirt: m.vest, ribbed: m.jacketDark, neck: 'v', vColor: m.shirt });
  jacket(root, { mat: m.jacket, collar: 'shirt', collarMat: m.jacketLight, pockets: m.jacketDark });
  backpack(root, { mat: m.pack, strap: m.leatherDark, roll: m.roll, flap: m.leather });
  const pendant = necklace(root, { cord: m.leatherDark, pendant: m.silver });
  const { L, R: Rt } = attachArms(root, { skin: m.skin, sleeveMat: m.jacket, sleeve: 'rolled', cuffMat: m.jacketLight, bracer: m.leather }, { left: 'hip', right: 'open' });

  const { head: h, face, R } = head(root, {
    skin: m.skin, stubble: toon(0x8a5d45, { rough: 0.95, sheen: 0.2 }),
    eye: { iris: 0x6b3f22 }, brow: { color: 0x241a15, w: 0.22 }, mouth: { w: 0.27 },
  });
  const tufts = hairSpiky(h, R, { mat: m.hair, hi: m.hairHi });

  return new Rig({
    root, head: h, face, arms: { L, R: Rt }, restMouth: 0.5,
    tick(t, dt, rig) {
      root.rotation.y = Math.sin(t * 0.7) * 0.04;
      const g = rig.speaking ? Math.sin(t * 3.1) * 0.18 + rig.mouthOpen * 0.12 : Math.sin(t * 1.2) * 0.03;
      Rt.elbow.rotation.x = Rt.rest.x - g;
      Rt.elbow.rotation.z = Rt.rest.z - g * 0.4;
      pendant.rotation.z = Math.sin(t * 2) * 0.1;
      tufts.rotation.z = Math.sin(t * 1.7) * 0.01;
    },
  });
}

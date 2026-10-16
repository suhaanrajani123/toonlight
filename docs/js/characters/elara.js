// Elara Quinn — the calm city girl (anime).
// Long wavy silver-blonde hair, blue eyes, dusty-rose bomber jacket over a navy ribbed
// turtleneck, layered silver necklaces, ripped black skinny jeans, white sneakers,
// black crossbody bag, a watch, one hand in her pocket.
import * as THREE from 'three';
import { toon, metal, skinMat, hairMat, fabric, part, Rig } from '../toonkit.js';
import { legs, torso, jacket, crossbody, necklace, attachArms, head, hairLong } from '../body.js';

export function build() {
  const m = {
    skin: skinMat(0xf6d6c3), hair: hairMat(0xd9d0c1), hairHi: hairMat(0xbfb4a3),
    bomber: toon(0xa35d63, { rough: 0.55, sheen: 0.4 }), band: fabric(0x7e4148), knit: fabric(0x1f2a44), knitRib: fabric(0x172036),
    jeans: fabric(0x1c1c22), silver: metal(0xdfe3ea, 0.18), bag: toon(0x141418, { rough: 0.35, clearcoat: 0.5 }),
    sneaker: toon(0xf3f1ee, { rough: 0.5 }), sole: fabric(0xe2ddd5),
    watch: { strap: metal(0xc9ccd2, 0.25), face: toon(0xf5f5f5, { rough: 0.2 }) },
  };
  const root = new THREE.Group();

  legs(root, { pants: m.jeans, legR: 0.09, width: 0.115, rips: m.skin, shoe: { style: 'sneaker', mat: m.sneaker, sole: m.sole } });
  torso(root, { shirt: m.knit, female: true, neck: 'turtle', ribbed: m.knitRib });
  jacket(root, { mat: m.bomber, collar: 'band', band: m.band, len: 0.56, open: 0.42, flare: 0.28 });
  crossbody(root, { mat: m.bag, strap: m.bag, side: -1, size: [0.2, 0.16, 0.07], y: 0.98 });
  necklace(root, { cord: m.silver, pendant: m.silver, y: 1.5, z: 0.2 });
  necklace(root, { cord: m.silver, long: true });
  const { L, R: Rt } = attachArms(root, {
    skin: m.skin, sleeveMat: m.bomber, sleeve: 'full', cuffMat: m.band, upperR: 0.066, foreR: 0.054,
    left: { watch: m.watch }, right: { handStyle: 'grip' },
  }, { left: 'pocket', right: 'down', width: 0.3 });

  const { head: h, face, R } = head(root, {
    skin: m.skin, female: true, R: 0.24,
    eye: { iris: 0x4f86c6, size: 0.165, spacing: 0.37 }, brow: { color: 0x9a8f80 },
    mouth: { w: 0.18, color: 0xa04050, teeth: false }, earrings: m.silver,
  });
  const locks = hairLong(h, R, { mat: m.hair, hi: m.hairHi, length: 0.78, bangs: 'center', volume: 1.12 });

  return new Rig({
    root, head: h, face,
    tick(t, dt, rig) {
      // relaxed lean with a slow sway; hair drifts a little
      root.rotation.z = 0.025 + Math.sin(t * 0.8) * 0.01;
      root.rotation.y = Math.sin(t * 0.5) * 0.05;
      locks.rotation.x = Math.sin(t * 1.1) * 0.02;
      if (rig.speaking) Rt.elbow.rotation.x = Rt.rest.x - Math.abs(Math.sin(t * 2.4)) * 0.25;
      else Rt.elbow.rotation.x = Rt.rest.x;
    },
  });
}

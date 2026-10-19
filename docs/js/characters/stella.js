// Stella Nova — the star-powered hype girl (cartoon).
// High brown ponytail with a star clip, flowing red jacket with yellow lining and stars,
// black crop top with a star, navy pleated skirt, black thigh-highs with yellow bands,
// red-and-yellow high-tops, fingerless gloves, peace sign and hand on hip.
import * as THREE from 'three';
import { toon, metal, skinMat, hairMat, fabric, part, Rig } from '../toonkit.js';
import { legs, belt, torso, jacket, attachArms, head, hairPonytail, starGeo } from '../body.js';

export function build() {
  const m = {
    skin: skinMat(0xf7d2b8), hair: hairMat(0x7a4a2c), hairHi: hairMat(0x95603b),
    red: toon(0xd8342c, { rough: 0.55, sheen: 0.4 }), yellow: toon(0xf6b51e, { rough: 0.5 }), black: fabric(0x1c1c22),
    navy: toon(0x23305a, { rough: 0.7 }), star: metal(0xffc93a, 0.35), white: fabric(0xf2f0ec),
  };
  const root = new THREE.Group();

  legs(root, {
    skin: m.skin, legR: 0.078, width: 0.12, socks: m.black, sockBand: m.yellow,
    skirt: { mat: m.navy, top: 0.2, bottom: 0.32, len: 0.24, y: 0.88 },
    shoe: { style: 'hightop', mat: m.red, sole: m.white, accent: m.yellow },
  });
  root.add(part(starGeo(0.035), m.star, { pos: [0.16, 0.82, 0.22], rot: [0, 0.5, 0.2] })); // star on the skirt
  belt(root, { mat: m.black, buckle: m.star, y: 1.0, r: 0.215 });
  torso(root, { shirt: m.black, female: true, crop: m.skin, neck: 'crew' });
  root.add(part(starGeo(0.05), m.star, { pos: [0, 1.4, 0.215] }));                         // star on the top
  // flowing coat: long, flared, yellow lining, stars on the shoulders
  jacket(root, { mat: m.red, lining: m.yellow, collar: 'shirt', collarMat: m.red, len: 0.82, flare: 0.44, open: 0.5 });
  [-1, 1].forEach((s) => root.add(part(starGeo(0.035), m.star, { pos: [s * 0.36, 1.5, 0.08], rot: [0, s * 0.8, 0] })));
  const { L, R: Rt } = attachArms(root, {
    skin: m.skin, sleeveMat: m.red, sleeve: 'rolled', cuffMat: m.yellow, glove: m.black, upperR: 0.066, foreR: 0.052,
    left: { handStyle: 'grip' }, right: { handStyle: 'peace', bangles: [m.yellow] },
  }, { left: 'hip', right: 'peace', width: 0.3 });

  const { head: h, face, R } = head(root, {
    skin: m.skin, female: true, R: 0.25, lift: -0.01,
    eye: { iris: 0x5a3214, size: 0.19, spacing: 0.37 }, brow: { color: 0x5a331f },
    mouth: { w: 0.26, color: 0x9a2638 }, blush: true, earrings: m.star,
  });
  const tail = hairPonytail(h, R, { mat: m.hair, hi: m.hairHi });
  h.add(part(starGeo(0.05), m.star, { pos: [R * 0.6, R * 0.85, R * 0.1], rot: [0, 0.9, 0.3] }));     // star hair clip

  return new Rig({
    root, head: h, face, arms: { L, R: Rt }, restMouth: 0.55,
    tick(t, dt, rig) {
      // bouncy energy: the ponytail swings, the peace sign wiggles when she talks
      root.position.y = rig.rootBaseY + Math.abs(Math.sin(t * 2.2)) * 0.012;
      tail.rotation.z = Math.sin(t * 2.2) * 0.12;
      tail.rotation.x = Math.sin(t * 1.3) * 0.05;
      const g = rig.speaking ? Math.sin(t * 6) * 0.15 : 0;
      Rt.hand.rotation.z = -0.15 + g;
    },
  });
}

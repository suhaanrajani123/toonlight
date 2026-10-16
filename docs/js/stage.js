// stage.js — the 3D scene: renderer, camera, lights, the platform the character
// stands on, and the per-frame loop that animates whichever character is "on stage".

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toon, gloss, part, cyl, STYLE } from './toonkit.js';

// Studio look shared by the stage and the portraits: filmic tone mapping + a soft
// studio reflection map so glossy, metal and glass surfaces have something to reflect.
export function studio(renderer, scene) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (STYLE === 'toon') return;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    studio(this.renderer, this.scene);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.target = new THREE.Vector3(0, 1.12, 0);

    // lights: soft sky fill, a warm key from the front-left, a coloured rim from behind
    this.scene.add(new THREE.HemisphereLight(0xfff6ee, 0x5a4f80, 0.6));
    const key = new THREE.DirectionalLight(0xfff1e2, 2.6);
    key.position.set(-2.2, 4.5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -2;
    key.shadow.camera.right = key.shadow.camera.top = 2.5;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.7);
    fill.position.set(3, 2, 3);
    this.scene.add(fill);
    this.rim = new THREE.DirectionalLight(0xffffff, 2.4);
    this.rim.position.set(2, 3, -4);
    this.scene.add(this.rim);

    // the round platform
    this.platform = new THREE.Group();
    // a paper "coaster" with an ink rim, to match the notebook look
    this.platformTop = toon(0xfbf6ec, { rough: 0.85, sheen: 0.2 });
    this.platform.add(part(cyl(1.12, 1.14, 0.1, 96), this.platformTop, { pos: [0, -0.05, 0] }));
    this.platform.add(part(cyl(1.18, 1.18, 0.12, 96), toon(0x000000, { rough: 0.6 }), { pos: [0, -0.07, 0] }));
    this.platform.children.forEach((m) => { m.castShadow = false; m.receiveShadow = true; });
    this.scene.add(this.platform);

    this.rig = null;
    this.mouse = new THREE.Vector2();
    this.mouthLevel = () => 0;
    this.timer = new THREE.Timer();
    this.entrance = 1;

    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      // -1..1 relative to the character's face, clamped so the head never over-turns
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -(((e.clientY - r.top) / r.height) * 2 - 1) + 0.35;
      this.mouse.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
    });

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // small or narrow stages: step back and aim lower, so the character sits above the cast bar
    // narrow stages (phones): step back so the whole body fits the width
    const narrow = this.camera.aspect < 1.05;
    const dist = narrow ? 6.9 / Math.max(this.camera.aspect, 0.6) : 6.6;
    this.target.y = narrow ? 1.05 : 1.12;
    this.camera.position.set(0, 1.45, dist);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  setTheme(color) {
    this.platformTop.color.set(0xfbf6ec).lerp(new THREE.Color(color), 0.18);
    this.rim.color.set(color).lerp(new THREE.Color(0xffffff), 0.45);
  }

  show(rig) {
    if (this.rig) this.scene.remove(this.rig.root);
    this.rig = rig;
    this.scene.add(rig.root);
    this.entrance = 0; // play a little pop-in
  }

  frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    if (this.rig) {
      this.onFrame?.(this.rig);
      if (this.entrance < 1) {
        this.entrance = Math.min(1, this.entrance + dt * 2.5);
        const e = this.entrance, s = 1 + Math.sin(e * Math.PI) * 0.12 * (1 - e);
        this.rig.root.scale.set(s * e ** 0.4, (2 - s) * e ** 0.4, s * e ** 0.4);
      }
      this.rig.update(t, dt, { mouth: this.mouthLevel(t), look: this.mouse });
    }
    this.renderer.render(this.scene, this.camera);
  }
}

// Render a small portrait of a character (used for the cast buttons).
// One offscreen renderer is shared by all portraits: creating a WebGL context is expensive.
let shot;
export function portrait(rig, size = 160) {
  if (!shot) {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size, false);
    const scene = new THREE.Scene();
    studio(renderer, scene);
    scene.add(new THREE.HemisphereLight(0xfff6ee, 0x5a4f80, 0.8));
    const key = new THREE.DirectionalLight(0xfff1e2, 2.6);
    key.position.set(-2, 4, 5);
    scene.add(key);
    shot = { canvas, renderer, scene, cam: new THREE.PerspectiveCamera(22, 1, 0.1, 50) };
  }
  const { canvas, renderer, scene, cam } = shot;
  scene.add(rig.root);
  rig.update(0, 0.016, { mouth: 0 });
  rig.root.updateMatrixWorld(true);
  const headY = rig.head.getWorldPosition(new THREE.Vector3()).y;
  cam.position.set(0, headY + 0.1, 4.2);
  cam.lookAt(0, headY - 0.05, 0);
  renderer.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  scene.remove(rig.root);
  return url;
}

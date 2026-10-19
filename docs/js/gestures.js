// gestures.js — body language for the built-in characters.
//
// A gesture is a short arm animation (wave, hand on chin, talking with the hands...)
// blended on top of whatever pose the character normally stands in. Several can overlap
// for a moment, so one gesture smoothly hands over to the next.
//
// Arm poses use the same format as POSES in body.js: [shoulder, elbow, hand] rotations
// (x, y, z in radians) written for the LEFT arm; the right arm is mirrored automatically.
//   shoulder x < 0  → arm swings forward      shoulder z > 0 → arm lifts out to the side
//   elbow x < 0     → forearm bends forward   elbow z > 0    → forearm bends up/outward

const POSE = {
  wave:     [[-0.3, 0, 1.35], [-0.15, 0, 1.6], [0, 0.35, 0]],
  chin:     [[-0.8, 0.05, -0.05], [-2.45, 0, -0.45], [0.35, 0, 0.1]],
  explain:  [[-0.45, 0, 0.32], [-1.15, 0, 0.35], [0.25, 1.05, 0.15]],
  tada:     [[-0.25, 0, 0.72], [-0.55, 0, 0.45], [0, 1.2, 0.25]],
  shrug:    [[0.05, 0, 0.42], [-1.35, 0, 0.75], [0.2, 1.4, 0.35]],
  handsUp:  [[-0.55, 0, 0.6], [-1.55, 0, 0.95], [0, 1.0, 0]],
  hip:      [[0.1, 0, 0.5], [-0.3, 0, -1.75], [0, 0, 0.6]],
};

const wave = (a) => [[0, 0, 0], [0, 0, Math.sin(a * 11) * 0.16], [0, 0, Math.sin(a * 11) * 0.38]];
const beat = (a) => [[0, 0, 0], [Math.sin(a * 5.2) * 0.14, 0, 0], [0, Math.sin(a * 2.6) * 0.25, 0]];
const bounce = (a) => [[0, 0, Math.sin(a * 7) * 0.04], [0, 0, 0], [0, 0, 0]];

// P = the character's main gesturing arm, O = the other arm.
const GESTURES = {
  wave:      { P: 'wave', dur: 2.2, wig: wave },
  think:     { P: 'chin', hold: true },
  explain:   { P: 'explain', dur: 1.7, wig: beat },
  explain2:  { O: 'explain', dur: 1.7, wig: beat },
  both:      { P: 'explain', O: 'explain', dur: 1.9, wig: beat },
  tada:      { P: 'tada', O: 'tada', dur: 1.9, wig: bounce },
  shrug:     { P: 'shrug', O: 'shrug', dur: 1.7 },
  surprised: { P: 'handsUp', O: 'handsUp', dur: 1.5 },
  hips:      { P: 'hip', O: 'hip', dur: 2.6 },
};
export const GESTURE_NAMES = Object.keys(GESTURES);

const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const JOINTS = ['shoulder', 'elbow', 'hand'];
const OPEN_HAND = new Set(['wave', 'explain', 'tada', 'shrug', 'handsUp']); // poses that look better with an open palm

export class Gestures {
  // arms: { L, R } from attachArms. primary: which arm waves and explains ('R' by default).
  constructor(arms, { primary = 'R' } = {}) {
    this.arms = { L: { ...arms.L, s: 1 }, R: { ...arms.R, s: -1 } };
    this.primary = primary;
    this.base = {};
    for (const k of ['L', 'R']) this.base[k] = JOINTS.map((j) => this.arms[k][j].rotation.clone());
    this.active = [];        // [{ def, age, out }] — out = fading out
    this.nextBeat = 0.6;
  }

  // Put the arms back in their normal pose; the character's own tick and the gestures
  // are then layered on top each frame.
  reset() {
    for (const k of ['L', 'R']) JOINTS.forEach((j, i) => this.arms[k][j].rotation.copy(this.base[k][i]));
  }

  play(name) {
    const def = GESTURES[name];
    if (!def) return;
    // a new gesture takes over: the others fade out under it
    for (const g of this.active) if (!g.out) g.out = 0;
    this.active.push({ name, def, age: 0, out: null });
  }

  holding(name) { return this.active.some((g) => g.name === name && g.out === null); }
  release(name) { for (const g of this.active) if (g.name === name && g.out === null) g.out = 0; }
  busy() { return this.active.some((g) => g.out === null); }

  weight(g) {
    const fadeIn = smooth(g.age / 0.35);
    if (g.out !== null) return fadeIn * (1 - smooth(g.out / 0.4));
    if (!g.def.hold) return fadeIn * (1 - smooth((g.age - (g.def.dur - 0.4)) / 0.4));
    return fadeIn;
  }

  update(t, dt, rig) {
    // automatic body language
    if (rig.thinking && !this.holding('think')) this.play('think');
    if (!rig.thinking && this.holding('think')) this.release('think');
    if (rig.speaking && !rig.thinking) {
      this.nextBeat -= dt;
      if (this.nextBeat <= 0 && !this.busy()) {
        const pick = ['explain', 'explain', 'explain2', 'both'][Math.floor(Math.random() * 4)];
        this.play(pick);
        this.nextBeat = GESTURES[pick].dur + 0.4 + Math.random() * 1.4;
      }
    } else this.nextBeat = 0.5;

    // age the gestures and drop the finished ones
    for (const g of this.active) {
      g.age += dt;
      if (g.out !== null) g.out += dt;
      else if (!g.def.hold && g.age >= g.def.dur) g.out = 0.4; // already faded by the envelope
    }
    this.active = this.active.filter((g) => !(g.out !== null && g.out >= 0.4));

    // blend each gesture over the current pose, oldest first
    const other = this.primary === 'R' ? 'L' : 'R';
    const openW = { L: 0, R: 0 };
    for (const g of this.active) {
      const w = this.weight(g);
      if (w <= 0.001) continue;
      const wig = g.def.wig ? g.def.wig(g.age) : null;
      for (const [slot, key] of [['P', this.primary], ['O', other]]) {
        const poseName = g.def[slot];
        if (!poseName) continue;
        const arm = this.arms[key], s = arm.s, p = POSE[poseName];
        if (OPEN_HAND.has(poseName)) openW[key] = Math.max(openW[key], w);
        JOINTS.forEach((j, i) => {
          const r = arm[j].rotation, d = wig ? wig[i] : [0, 0, 0];
          r.x += (p[i][0] + d[0] - r.x) * w;
          r.y += (s * (p[i][1] + d[1]) - r.y) * w;
          r.z += (s * (p[i][2] + d[2]) - r.z) * w;
        });
      }
    }
    // curled or peace-sign hands open up during big gestures
    for (const k of ['L', 'R']) {
      const palm = this.arms[k].palm;
      if (!palm?.open) continue;
      const open = openW[k] > 0.5;
      palm.open.visible = open;
      palm.main.visible = !open;
    }
  }
}

// AI opponents for Race mode. Each bot flies the same corridor with its own
// pace and lane wander, plus gentle rubber-banding so the pack stays in the
// race instead of running away or vanishing behind. Bots never collide/die --
// they're rivals to chase and overtake, tracked by distance for ranking.

import * as THREE from 'three';
import { CFG } from './config.js';
import { halfWidth } from './path.js';
import { Ghost } from './ghost.js';

const BOT_NAMES = ['NOVA', 'ZEPH', 'KORO', 'VYPR', 'ECHO', 'HALO', 'JET-X', 'ORB', 'RAZE', 'LUX', 'AX-7', 'DELT'];
const BOT_COLORS = [0xff5ea8, 0x5ec8ff, 0xffd36e, 0x7cff9b, 0xc77dff, 0xff9d5e, 0x6effe0];

export class Bots {
  constructor(scene) { this.scene = scene; this.list = []; }

  spawn(count, startZ) {
    this.clear();
    const names = shuffle(BOT_NAMES.slice());
    for (let i = 0; i < count; i++) {
      const name = names[i] || ('BOT-' + (i + 1));
      const ghost = new Ghost(this.scene, BOT_COLORS[i % BOT_COLORS.length], name, 'BOT');
      this.list.push({
        ghost, name,
        z: startZ + (Math.random() * 80 - 30),
        u: (Math.random() * 2 - 1) * 6,
        v: CFG.wallHeight * (0.35 + Math.random() * 0.2),
        speed: CFG.startSpeed,
        skill: 0.92 + Math.random() * 0.32,   // pace relative to the player
        lanePhase: Math.random() * 6.2831,
        laneFreq: 0.12 + Math.random() * 0.22,
      });
    }
  }

  update(dt, t, playerZ, playerBaseSpeed) {
    for (const b of this.list) {
      // Target pace tracks the player's, scaled by skill, with rubber-banding:
      // a bot far ahead eases off; one far behind speeds up.
      const gap = b.z - playerZ;
      const rubber = THREE.MathUtils.clamp(-gap * 0.02, -14, 16);
      const target = Math.max(CFG.startSpeed * 0.6, playerBaseSpeed * b.skill + rubber);
      b.speed += (target - b.speed) * Math.min(1, dt * 1.6);
      b.z += b.speed * dt;

      // Wander laterally / vertically inside the corridor.
      const hw = halfWidth(b.z);
      const lim = Math.max(2, hw - 3);
      b.u = Math.sin(t * b.laneFreq + b.lanePhase) * lim * 0.7;
      b.v = CFG.wallHeight * 0.42 + Math.sin(t * b.laneFreq * 0.7 + b.lanePhase * 1.7) * 6;

      // Only render bots in a visible band around the player.
      const near = b.z > playerZ - 140 && b.z < playerZ + 500;
      b.ghost.setVisible(near);
      if (near) b.ghost.place(b.z, b.u, b.v);
    }
  }

  // Distances of all bots, for race-position ranking.
  positions() { return this.list.map((b) => b.z); }

  count() { return this.list.length; }

  clear() {
    for (const b of this.list) b.ghost.dispose();
    this.list = [];
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

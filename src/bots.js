// AI opponents. Real bots, not scripted puppets: each one integrates the same
// lateral/vertical flight physics as the player (accel, damping, clamped
// velocity) and can actually crash into a wall or the floor. Their forward
// pace is locked to the player's exact current speed -- no faster, no slower,
// no lag -- so pace is never a competitive factor; only piloting is. A
// crashed bot simply stops -- it stays in the field as a wreck.

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
        ghost, name, alive: true,
        z: startZ + (Math.random() * 40 - 15),
        u: (Math.random() * 2 - 1) * 4,
        v: CFG.wallHeight * 0.42,
        velU: 0, velV: 0,
        speed: CFG.startSpeed,
        wanderPhase: Math.random() * 6.2831,
        wanderFreq: 0.1 + Math.random() * 0.18,
        vertPhase: Math.random() * 6.2831,
      });
    }
  }

  update(dt, t, playerZ, playerSpeed) {
    for (const b of this.list) {
      if (b.alive) this._flyOne(b, dt, t, playerSpeed);

      // Only render bots in a visible band around the player.
      const near = b.z > playerZ - 140 && b.z < playerZ + 500;
      b.ghost.setVisible(near);
      if (near) b.ghost.place(b.z, b.u, b.v);
    }
  }

  _flyOne(b, dt, t, playerSpeed) {
    // Forward pace: locked to the player's exact current speed, instantly --
    // no ramp-up lag, no independent boost economy to fall behind on.
    b.speed = playerSpeed;
    b.z += b.speed * dt;

    // ---- Steering AI: hug a wandering line down the corridor, staying clear
    // of the walls/floor, then integrate through the REAL flight physics
    // (accel + damping + velocity clamp) -- exactly like the player's ship.
    const hw = halfWidth(b.z);
    const ampU = Math.min(6, hw * 0.55);
    const desiredU = Math.sin(t * b.wanderFreq + b.wanderPhase) * ampU;
    const desiredV = CFG.wallHeight * 0.42 + Math.sin(t * b.wanderFreq * 0.7 + b.vertPhase) * 6;

    const ax = THREE.MathUtils.clamp((desiredU - b.u) * 0.22, -1, 1);
    const ay = THREE.MathUtils.clamp((desiredV - b.v) * 0.22, -1, 1);

    b.velU += -ax * CFG.accelLat * dt;
    b.velU -= b.velU * CFG.dampLat * dt;
    b.velU = THREE.MathUtils.clamp(b.velU, -CFG.maxLatVel, CFG.maxLatVel);
    b.u += b.velU * dt;

    b.velV += ay * CFG.accelVert * dt;
    b.velV -= b.velV * CFG.dampVert * dt;
    b.velV = THREE.MathUtils.clamp(b.velV, -CFG.maxVertVel, CFG.maxVertVel);
    b.v += b.velV * dt;

    // ---- Real collision: a bot that clips a wall or the floor actually
    // crashes and stops, exactly like the player would.
    const limU = hw - CFG.shipRadius;
    const minV = CFG.floorClear;
    const maxV = CFG.wallHeight - CFG.ceilClear;
    if (b.v > maxV) { b.v = maxV; if (b.velV > 0) b.velV = 0; }
    if (b.v <= minV || Math.abs(b.u) >= limU) {
      b.alive = false;
      b.velU = b.velV = 0;
    }
  }

  // Distances of all bots (crashed ones simply stop advancing), for ranking.
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

// AI opponents. Real bots, not scripted puppets: each one integrates the same
// lateral/vertical flight physics as the player (accel, damping, clamped
// velocity) and can actually crash into a wall or the floor. Their forward
// pace is locked to the player's exact current speed -- no faster, no slower,
// no lag -- so pace is never a competitive factor; only piloting is. A
// crashed bot simply stops -- it stays in the field as a wreck.
//
// Steering looks ahead along the corridor for the tightest upcoming
// half-width and aims for the middle of whatever room is actually available
// there, biased by a per-bot lateral "personality" -- so each bot reacts to
// the real procedural canyon in front of it instead of tracing a fixed
// wiggle, and one that's the same for a solid stretch instead of a random
// dance every tick.

import * as THREE from 'three';
import { CFG } from './config.js';
import { halfWidth } from './path.js';
import { Ghost } from './ghost.js';

const BOT_NAMES = ['NOVA', 'ZEPH', 'KORO', 'VYPR', 'ECHO', 'HALO', 'JET-X', 'ORB', 'RAZE', 'LUX', 'AX-7', 'DELT'];
const BOT_COLORS = [0xff5ea8, 0x5ec8ff, 0xffd36e, 0x7cff9b, 0xc77dff, 0xff9d5e, 0x6effe0];
const LOOKAHEAD = [20, 45, 75, 110]; // metres ahead sampled for the tightest upcoming width

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
        // Personality: a preferred lane (-1 hugs the left wall's safe edge,
        // +1 the right, 0 the centre) that drifts slowly over the run, plus
        // a preferred altitude within the vertical band.
        laneBias: Math.random() * 2 - 1,
        laneDriftPhase: Math.random() * 6.2831,
        laneDriftFreq: 0.02 + Math.random() * 0.03, // one lane change every ~30-80s
        altBias: (Math.random() * 2 - 1) * 6,
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

    // ---- Steering AI: find the tightest half-width over the next ~110m and
    // aim for a safe lane inside THAT (not just the current cross-section),
    // so a bot reacts to a narrowing canyon before it arrives, the same way
    // a real pilot reads the road ahead.
    const hwNow = halfWidth(b.z);
    let safeHw = hwNow;
    for (const d of LOOKAHEAD) safeHw = Math.min(safeHw, halfWidth(b.z + d));
    const margin = Math.max(0.5, safeHw - CFG.shipRadius - 1.5);

    // The personal lane preference drifts slowly (not a random walk every
    // frame) so a bot commits to a line for a while rather than twitching.
    const lane = b.laneBias * (0.5 + 0.5 * Math.sin(t * b.laneDriftFreq + b.laneDriftPhase));
    const targetU = THREE.MathUtils.clamp(lane * margin, -margin, margin);
    const targetV = THREE.MathUtils.clamp(
      CFG.wallHeight * 0.42 + b.altBias,
      CFG.floorClear + 3, CFG.wallHeight - CFG.ceilClear - 3
    );

    // A direct correction toward the target (not a human steer-input axis),
    // so no screen-mapping sign flip -- push straight toward +u/+v.
    const ax = THREE.MathUtils.clamp((targetU - b.u) * 0.22, -1, 1);
    const ay = THREE.MathUtils.clamp((targetV - b.v) * 0.22, -1, 1);

    b.velU += ax * CFG.accelLat * dt;
    b.velU -= b.velU * CFG.dampLat * dt;
    b.velU = THREE.MathUtils.clamp(b.velU, -CFG.maxLatVel, CFG.maxLatVel);
    b.u += b.velU * dt;

    b.velV += ay * CFG.accelVert * dt;
    b.velV -= b.velV * CFG.dampVert * dt;
    b.velV = THREE.MathUtils.clamp(b.velV, -CFG.maxVertVel, CFG.maxVertVel);
    b.v += b.velV * dt;

    // ---- Real collision: a bot that clips a wall or the floor actually
    // crashes and stops, exactly like the player would.
    const limU = hwNow - CFG.shipRadius;
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

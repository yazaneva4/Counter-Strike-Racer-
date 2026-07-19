// Boost gates. A pool of glowing rings streamed along the corridor. Thread one
// and you chain a boost + shove the rift back; miss and the chain breaks.
// Gates are addressed by absolute index so hit/miss resolves exactly once each.

import * as THREE from 'three';
import { CFG } from './config.js';
import { halfWidth, worldFromLocal, tangent } from './path.js';

const POOL = 10;

export class Gates {
  constructor(scene) {
    this.onResult = null; // (hit:boolean, gateIndex:number) => void
    this.lastResolved = -1;
    this.flash = { idx: -1, color: new THREE.Color(), t: 0 };

    this.slots = [];
    for (let i = 0; i < POOL; i++) {
      const group = new THREE.Group();

      const ringGeo = new THREE.TorusGeometry(CFG.gateRadius, 0.45, 8, 40);
      const ringMat = new THREE.MeshBasicMaterial({
        color: CFG.colGate,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      group.add(ring);

      // Faint outer halo ring.
      const haloGeo = new THREE.TorusGeometry(CFG.gateRadius + 0.9, 0.14, 6, 40);
      const haloMat = new THREE.MeshBasicMaterial({
        color: CFG.colGate,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      group.add(halo);

      group.frustumCulled = false;
      scene.add(group);
      this.slots.push({ group, ring, halo, ringMat, haloMat });
    }
    this._c = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  reset() {
    this.lastResolved = -1;
    this.flash.t = 0;
    this.flash.idx = -1;
  }

  // Deterministic placement of gate `idx` in canyon-local space.
  layout(idx) {
    const z = CFG.gateFirst + idx * CFG.gateSpacing;
    const hw = halfWidth(z);
    const maxU = Math.max(0, hw - CFG.gateRadius - 1.5);
    const u = maxU * 0.72 * Math.sin(idx * 2.3 + 1.1);
    const vLo = CFG.gateRadius + CFG.floorClear + 1;
    const vHi = CFG.wallHeight - CFG.gateRadius - CFG.ceilClear - 1;
    const v = THREE.MathUtils.clamp(
      CFG.wallHeight * 0.44 + 7 * Math.sin(idx * 1.7),
      vLo,
      Math.max(vLo, vHi)
    );
    return { z, u, v };
  }

  update(shipZ, shipU, shipV, dt, t) {
    // Resolve any gates the ship has just passed.
    let idx = this.lastResolved + 1;
    while (CFG.gateFirst + idx * CFG.gateSpacing <= shipZ) {
      const g = this.layout(idx);
      const du = shipU - g.u;
      const dv = shipV - g.v;
      const hit = Math.hypot(du, dv) <= CFG.gateRadius;
      this.flash.idx = idx;
      this.flash.color.set(hit ? CFG.colGateHit : CFG.colGateMiss);
      this.flash.t = 0.5;
      if (this.onResult) this.onResult(hit, idx);
      this.lastResolved = idx;
      idx++;
    }
    if (this.flash.t > 0) this.flash.t -= dt;

    // Assign pooled meshes to the visible window of gates.
    const first = Math.max(0, Math.ceil((shipZ - 15 - CFG.gateFirst) / CFG.gateSpacing));
    const pulse = 0.55 + 0.45 * Math.sin(t * 4);
    for (let k = 0; k < POOL; k++) {
      const gi = first + k;
      const slot = this.slots[k];
      const g = this.layout(gi);

      if (g.z < shipZ - 20 || g.z > shipZ + (CFG.segments - CFG.behind / CFG.seg) * CFG.seg) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;

      worldFromLocal(g.z, g.u, g.v, this._c);
      tangent(g.z, g.u, g.v, this._t);
      slot.group.position.copy(this._c);
      slot.group.up.set(0, 1, 0);
      slot.group.lookAt(this._c.clone().add(this._t));

      // Colour: default green, or flash on the just-resolved gate.
      let col = CFG.colGate;
      if (this.flash.t > 0 && gi === this.flash.idx) {
        slot.ringMat.color.copy(this.flash.color);
        slot.haloMat.color.copy(this.flash.color);
      } else if (gi <= this.lastResolved) {
        // A resolved gate that's still on screen dims out.
        col = 0x1a6f4a;
        slot.ringMat.color.set(col);
        slot.haloMat.color.set(col);
      } else {
        slot.ringMat.color.set(CFG.colGate);
        slot.haloMat.color.set(CFG.colGate);
      }

      const s = 1 + (gi > this.lastResolved ? pulse * 0.05 : 0);
      slot.group.scale.setScalar(s);
      slot.ring.rotation.z = t * 0.6;
      slot.ringMat.opacity = gi > this.lastResolved ? 0.85 + pulse * 0.15 : 0.4;
    }
  }
}

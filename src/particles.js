// Particle systems that sell speed and impact:
//   * dust   -- a field of motes streaming past to make velocity legible,
//   * sparks -- a pooled, additive burst system for grazes, exhaust and crashes.
//
// Sparks fade by scaling their colour toward black; under additive blending a
// black point contributes nothing, so brightness *is* the alpha.

import * as THREE from 'three';
import { CFG } from './config.js';
import { centerX, centerY, halfWidth } from './path.js';

const DUST = 900;
const SPARKS = 800;

// A soft radial-gradient sprite so points read as glowing motes, not squares.
function makeSoftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class Particles {
  constructor(scene) {
    // ---- Dust field ----------------------------------------------------
    this.dustZ = new Float32Array(DUST);
    this.dustOX = new Float32Array(DUST);
    this.dustOY = new Float32Array(DUST);
    this.dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) this._seedDust(i, i / DUST);

    const dustGeo = new THREE.BufferGeometry();
    const dustAttr = new THREE.BufferAttribute(this.dustPos, 3);
    dustAttr.setUsage(THREE.DynamicDrawUsage);
    dustGeo.setAttribute('position', dustAttr);
    this.dustAttr = dustAttr;
    const soft = makeSoftTexture();
    this.dustMat = new THREE.PointsMaterial({
      color: 0x8fefff,
      map: soft,
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // ---- Spark pool ----------------------------------------------------
    this.sPos = new Float32Array(SPARKS * 3);
    this.sVel = new Float32Array(SPARKS * 3);
    this.sCol = new Float32Array(SPARKS * 3); // live (faded) colour
    this.sBase = new Float32Array(SPARKS * 3); // colour at spawn
    this.sLife = new Float32Array(SPARKS);
    this.sMax = new Float32Array(SPARKS);
    this.sCursor = 0;

    const sparkGeo = new THREE.BufferGeometry();
    const sPosAttr = new THREE.BufferAttribute(this.sPos, 3);
    const sColAttr = new THREE.BufferAttribute(this.sCol, 3);
    sPosAttr.setUsage(THREE.DynamicDrawUsage);
    sColAttr.setUsage(THREE.DynamicDrawUsage);
    sparkGeo.setAttribute('position', sPosAttr);
    sparkGeo.setAttribute('color', sColAttr);
    this.sPosAttr = sPosAttr;
    this.sColAttr = sColAttr;
    this.sparkMat = new THREE.PointsMaterial({
      size: 1.8,
      map: soft,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparks = new THREE.Points(sparkGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
  }

  _seedDust(i, frac, shipZ = 0) {
    const z = shipZ + 30 + frac * 940;
    this.dustZ[i] = z;
    const hw = halfWidth(z);
    this.dustOX[i] = (Math.random() * 2 - 1) * (hw + 6);
    this.dustOY[i] = Math.random() * (CFG.wallHeight + 6);
  }

  reset(shipZ) {
    for (let i = 0; i < DUST; i++) this._seedDust(i, Math.random(), shipZ);
    for (let i = 0; i < SPARKS; i++) {
      this.sLife[i] = 0;
      const o = i * 3;
      this.sCol[o] = this.sCol[o + 1] = this.sCol[o + 2] = 0;
    }
    this.sColAttr.needsUpdate = true;
  }

  spawn(x, y, z, r, g, b, count, speed, life) {
    for (let n = 0; n < count; n++) {
      const i = this.sCursor;
      this.sCursor = (this.sCursor + 1) % SPARKS;
      const o = i * 3;
      this.sPos[o] = x;
      this.sPos[o + 1] = y;
      this.sPos[o + 2] = z;
      this.sVel[o] = (Math.random() * 2 - 1) * speed;
      this.sVel[o + 1] = (Math.random() * 2 - 1) * speed;
      this.sVel[o + 2] = (Math.random() * 2 - 1) * speed - speed * 0.3;
      this.sLife[i] = life * (0.6 + Math.random() * 0.4);
      this.sMax[i] = this.sLife[i];
      this.sBase[o] = r;
      this.sBase[o + 1] = g;
      this.sBase[o + 2] = b;
    }
  }

  graze(pos, side) {
    const c = side === 2 ? [0.0, 0.92, 1.0] : [1.0, 0.17, 0.75];
    this.spawn(pos.x, pos.y, pos.z, c[0], c[1], c[2], 14, 22, 0.4);
  }

  crash(pos) {
    this.spawn(pos.x, pos.y, pos.z, 1.0, 0.5, 0.15, 240, 48, 1.15);
    this.spawn(pos.x, pos.y, pos.z, 0.2, 0.9, 1.0, 120, 32, 1.35);
  }

  trail(pos, thrust) {
    if (Math.random() > 0.55) {
      this.spawn(pos.x, pos.y, pos.z, 0.2, 0.95, 1.0, 1, 5 + thrust * 8, 0.32);
    }
  }

  update(dt, shipZ, speed) {
    // Dust streams toward and past the ship.
    const drift = 40 + speed * 0.6;
    const pos = this.dustPos;
    for (let i = 0; i < DUST; i++) {
      this.dustZ[i] -= drift * dt;
      if (this.dustZ[i] < shipZ - 25) this._seedDust(i, Math.random(), shipZ + 700);
      const z = this.dustZ[i];
      const o = i * 3;
      pos[o] = centerX(z) + this.dustOX[i];
      pos[o + 1] = centerY(z) + this.dustOY[i];
      pos[o + 2] = z;
    }
    this.dustAttr.needsUpdate = true;
    this.dustMat.opacity = 0.35 + Math.min(0.5, (speed / CFG.maxSpeed) * 0.55);
    this.dustMat.size = 0.6 + (speed / CFG.maxSpeed) * 0.7;

    // Sparks: integrate, drag, fade.
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      if (this.sLife[i] <= 0) {
        if (this.sCol[o] || this.sCol[o + 1] || this.sCol[o + 2]) {
          this.sCol[o] = this.sCol[o + 1] = this.sCol[o + 2] = 0;
        }
        continue;
      }
      this.sLife[i] -= dt;
      this.sPos[o] += this.sVel[o] * dt;
      this.sPos[o + 1] += this.sVel[o + 1] * dt;
      this.sPos[o + 2] += this.sVel[o + 2] * dt;
      this.sVel[o] *= 0.94;
      this.sVel[o + 1] *= 0.94;
      this.sVel[o + 2] *= 0.94;
      const f = Math.max(0, this.sLife[i] / this.sMax[i]);
      const s = f * f;
      this.sCol[o] = this.sBase[o] * s;
      this.sCol[o + 1] = this.sBase[o + 1] * s;
      this.sCol[o + 2] = this.sBase[o + 2] * s;
    }
    this.sPosAttr.needsUpdate = true;
    this.sColAttr.needsUpdate = true;
  }
}

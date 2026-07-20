// The Race-mode finish line: a bright checkered curtain spanning the corridor
// with a glowing "FINISH" banner, placed at a fixed distance. You fly through it
// to win; it's hidden entirely in Solo mode.

import * as THREE from 'three';
import { CFG } from './config.js';
import { halfWidth, worldFromLocal, tangent } from './path.js';

export class Finish {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.frustumCulled = false;

    // Checkered curtain (translucent + additive so you can see through it).
    this.mat = new THREE.MeshBasicMaterial({
      map: makeCheckerTexture(),
      transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.group.add(this.curtain);

    // Bright frame around the opening.
    this.frameMat = new THREE.LineBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), this.frameMat);
    this.group.add(this.frame);

    // "FINISH" banner above the gate.
    this.banner = makeBanner();
    this.group.add(this.banner);

    scene.add(this.group);
    this._c = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  // Position across the corridor at the finish distance.
  place(z) {
    const hw = halfWidth(z);
    const H = CFG.wallHeight;
    const w = hw * 2 + 6;
    const h = H + 8;
    worldFromLocal(z, 0, H * 0.42, this._c);
    tangent(z, 0, H * 0.42, this._t);
    this.group.position.copy(this._c);
    this.group.up.set(0, 1, 0);
    this.group.lookAt(this._c.clone().add(this._t));
    this.curtain.scale.set(w, h, 1);
    this.frame.scale.set(w, h, 1);
    this.banner.position.set(0, h * 0.5 + 3, 0);
    this.banner.scale.set(26, 6.5, 1);
    this._z = z;
  }

  update(t) {
    if (!this.group.visible) return;
    const pulse = 0.32 + 0.14 * Math.sin(t * 3);
    this.mat.opacity = pulse;
    this.frameMat.opacity = 0.75 + 0.25 * Math.sin(t * 3);
  }

  setVisible(v) { this.group.visible = v; }
}

function makeCheckerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const n = 8, s = c.width / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = ((x + y) & 1) ? '#ffffff' : '#12001f';
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 5);
  tex.needsUpdate = true;
  return tex;
}

function makeBanner() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 84px Rajdhani, Segoe UI, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffd36e';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('FINISH', 256, 66);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  ctx.fillText('FINISH', 256, 66);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  return new THREE.Sprite(mat);
}

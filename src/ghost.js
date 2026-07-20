// A lightweight "ghost" craft used for both AI bots and live remote players.
// It's a cheap neon wireframe (so many can be on screen at once) with a floating
// name label that always faces the camera. Positioned in canyon-local space just
// like the player, so it threads the same corridor.

import * as THREE from 'three';
import { worldFromLocal, tangent } from './path.js';

export class Ghost {
  constructor(scene, color, name) {
    this.scene = scene;
    this.color = new THREE.Color(color);
    this.group = new THREE.Group();

    // Wireframe hull.
    const hullGeo = new THREE.ConeGeometry(0.8, 3.0, 6);
    hullGeo.rotateX(-Math.PI / 2);
    this.group.add(neonEdges(hullGeo, this.color, 0.95));

    // Thin wings (outline only -- keeps ghosts light and translucent-looking).
    const wingGeo = new THREE.BoxGeometry(5.0, 0.12, 1.3);
    wingGeo.translate(0, -0.1, 0.5);
    this.group.add(neonEdges(wingGeo, this.color, 0.8));

    // Engine glow facing back toward the chase camera.
    this.engineMat = new THREE.MeshBasicMaterial({
      color: this.color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const eng = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), this.engineMat);
    eng.position.set(0, 0, 1.7);
    this.group.add(eng);

    // Floating name tag.
    this._label = makeLabel(name, this.color);
    this._label.position.set(0, 2.4, 0.5);
    this.group.add(this._label);
    this._labelName = name;

    this.group.frustumCulled = false;
    scene.add(this.group);

    this._p = new THREE.Vector3();
    this._f = new THREE.Vector3();
  }

  setName(name) {
    if (name === this._labelName) return;
    this._labelName = name;
    drawLabel(this._label.material.map, name, this.color);
    this._label.material.map.needsUpdate = true;
  }

  // Place at a canyon-local coordinate, oriented down the corridor.
  place(z, u, v) {
    worldFromLocal(z, u, v, this._p);
    tangent(z, u, v, this._f);
    this.group.position.copy(this._p);
    this.group.up.set(0, 1, 0);
    this.group.lookAt(this._p.clone().add(this._f));
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }
}

function neonEdges(geo, color, opacity) {
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), mat);
}

function makeLabel(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  drawLabel(tex, name, color);
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(5.0, 1.25, 1);
  return sprite;
}

function drawLabel(tex, name, color) {
  const canvas = tex.image;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const hex = '#' + new THREE.Color(color).getHexString();
  ctx.font = 'bold 34px Rajdhani, Segoe UI, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = String(name || '').slice(0, 16).toUpperCase();
  ctx.shadowColor = hex;
  ctx.shadowBlur = 16;
  ctx.fillStyle = hex;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.globalAlpha = 1;
  tex.needsUpdate = true;
}

// A stable-ish neon colour derived from an id string.
export function colorForId(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  const hue = (h % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.9, 0.6);
}

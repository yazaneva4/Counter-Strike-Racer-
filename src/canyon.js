// The canyon mesh: a rolling window of cross-sections rebuilt every frame from
// the path functions. Two overlaid pieces sell the synthwave-noir look:
//   1. a near-black "glass" surface (catches light + fog), and
//   2. an additive glowing wireframe of fault lines (cyan floor, magenta walls).
// Because the window is snapped to a fixed world grid, features hold still in
// space and simply stream toward you -- no seams, no popping.

import * as THREE from 'three';
import { CFG } from './config.js';
import { centerX, centerY, halfWidth, bank } from './path.js';

const RIB_EVERY = 2; // draw wall/floor ribs every N cross-sections

export class Canyon {
  constructor(scene) {
    this.N = CFG.segments;
    const N = this.N;

    // 4 vertices per cross-section: L-top, L-bot, R-bot, R-top.
    this.positions = new Float32Array(N * 4 * 3);
    const colors = new Float32Array(N * 4 * 3);

    const cyan = new THREE.Color(CFG.colFloor);
    const mag = new THREE.Color(CFG.colWall);
    for (let i = 0; i < N; i++) {
      const b = i * 4;
      setColor(colors, b + 0, mag);  // L-top
      setColor(colors, b + 1, cyan); // L-bot
      setColor(colors, b + 2, cyan); // R-bot
      setColor(colors, b + 3, mag);  // R-top
    }

    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.posAttr = posAttr;

    // ---- Solid surface -------------------------------------------------
    const surfGeo = new THREE.BufferGeometry();
    surfGeo.setAttribute('position', posAttr);
    const surfIdx = [];
    for (let i = 0; i < N - 1; i++) {
      const b = i * 4;
      // left wall
      surfIdx.push(b, b + 1, b + 5, b, b + 5, b + 4);
      // floor
      surfIdx.push(b + 1, b + 2, b + 6, b + 1, b + 6, b + 5);
      // right wall
      surfIdx.push(b + 2, b + 3, b + 7, b + 2, b + 7, b + 6);
    }
    surfGeo.setIndex(surfIdx);
    const surfMat = new THREE.MeshStandardMaterial({
      color: CFG.colSurface,
      metalness: 0.55,
      roughness: 0.42,
      emissive: 0x0a0122,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
    });
    this.surface = new THREE.Mesh(surfGeo, surfMat);
    this.surface.frustumCulled = false;
    scene.add(this.surface);

    // ---- Glowing fault-line grid --------------------------------------
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', posAttr);
    lineGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const lineIdx = [];
    for (let i = 0; i < N - 1; i++) {
      const b = i * 4;
      // longitudinal rails along all four edges
      lineIdx.push(b + 0, b + 4);
      lineIdx.push(b + 1, b + 5);
      lineIdx.push(b + 2, b + 6);
      lineIdx.push(b + 3, b + 7);
      // ribs across the corridor at intervals
      if (i % RIB_EVERY === 0) {
        lineIdx.push(b + 0, b + 1); // left wall rib
        lineIdx.push(b + 3, b + 2); // right wall rib
        lineIdx.push(b + 1, b + 2); // floor rib
      }
    }
    lineGeo.setIndex(lineIdx);
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.grid = new THREE.LineSegments(lineGeo, lineMat);
    this.grid.frustumCulled = false;
    scene.add(this.grid);

    this._gridStart = null;
  }

  // Rebuild the vertex positions for the window centred on the ship.
  update(shipZ) {
    const gridStart = Math.floor((shipZ - CFG.behind) / CFG.seg);
    // Even when the snapped window hasn't advanced, we recompute cheaply.
    this._gridStart = gridStart;
    const pos = this.positions;
    const H = CFG.wallHeight;

    for (let i = 0; i < this.N; i++) {
      const z = (gridStart + i) * CFG.seg;
      const cx = centerX(z);
      const cy = centerY(z);
      const hw = halfWidth(z);
      const b = bank(z);
      const cb = Math.cos(b);
      const sb = Math.sin(b);

      const o = i * 4 * 3;
      // L-top (u=-hw, v=H)
      pos[o + 0] = cx + -hw * cb - H * sb;
      pos[o + 1] = cy + -hw * sb + H * cb;
      pos[o + 2] = z;
      // L-bot (u=-hw, v=0)
      pos[o + 3] = cx + -hw * cb;
      pos[o + 4] = cy + -hw * sb;
      pos[o + 5] = z;
      // R-bot (u=+hw, v=0)
      pos[o + 6] = cx + hw * cb;
      pos[o + 7] = cy + hw * sb;
      pos[o + 8] = z;
      // R-top (u=+hw, v=H)
      pos[o + 9] = cx + hw * cb - H * sb;
      pos[o + 10] = cy + hw * sb + H * cb;
      pos[o + 11] = z;
    }
    this.posAttr.needsUpdate = true;
  }
}

function setColor(arr, i, c) {
  arr[i * 3 + 0] = c.r;
  arr[i * 3 + 1] = c.g;
  arr[i * 3 + 2] = c.b;
}

// The canyon spine.
//
// Everything about the corridor's shape is a smooth, deterministic function of
// the forward distance `z`. Because the shape is continuous (not stitched from
// random chunks) the terrain is perfectly seamless no matter how far you fly,
// and every subsystem -- terrain mesh, ship physics, camera, gates, rift --
// agrees on where the walls are just by calling these functions.

import * as THREE from 'three';
import { CFG } from './config.js';

// Horizontal meander of the canyon centre. Layered sines of different
// frequencies give organic, non-repeating curves.
export function centerX(z) {
  return (
    27 * Math.sin(z * 0.0041) +
    14 * Math.sin(z * 0.0113 + 1.3) +
    6.5 * Math.sin(z * 0.0241 + 4.1)
  );
}

// Vertical undulation -- the climbs and the stomach-dropping dives.
export function centerY(z) {
  return (
    9 * Math.sin(z * 0.0061 + 0.7) +
    5 * Math.sin(z * 0.0152 + 2.4)
  );
}

// Half-width of the canyon. Breathes between wide bays and tight fractures.
export function halfWidth(z) {
  const w =
    CFG.widthBase +
    CFG.widthAmp * Math.sin(z * 0.0079 + 0.5) +
    5 * Math.sin(z * 0.0189 + 3.0);
  return Math.max(CFG.widthMin, w);
}

// Banking angle (roll of the whole cross-section) derived from how hard the
// centre-line is turning, so curves lean into themselves like a race track.
export function bank(z) {
  const h = 6;
  const dCx = (centerX(z + h) - centerX(z - h)) / (2 * h);
  return THREE.MathUtils.clamp(-dCx * 1.15, -0.62, 0.62);
}

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

// Convert a canyon-local coordinate (u = lateral, v = height above floor) at a
// given forward distance `z` into a world-space position, honouring the bank.
export function worldFromLocal(z, u, v, out = new THREE.Vector3()) {
  const b = bank(z);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cx = centerX(z);
  const cy = centerY(z);
  // right = (cos b, sin b), up = (-sin b, cos b)
  out.set(cx + u * cb - v * sb, cy + u * sb + v * cb, z);
  return out;
}

// Local basis vectors at a point (used by the camera to stay "canyon up").
export function localBasis(z, right = _right, up = _up) {
  const b = bank(z);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  right.set(cb, sb, 0);
  up.set(-sb, cb, 0);
  return { right, up };
}

// Forward tangent of the corridor at (z,u,v). Points roughly +Z.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
export function tangent(z, u, v, out = new THREE.Vector3()) {
  const dz = 2;
  worldFromLocal(z - dz, u, v, _a);
  worldFromLocal(z + dz, u, v, _b);
  return out.copy(_b).sub(_a).normalize();
}

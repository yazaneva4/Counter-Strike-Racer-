// The hovership: a low-poly wedge with glowing edges, plus all of the flight
// model -- lateral/vertical momentum, corridor collision, and graze detection.
// Nose is modelled along -Z so a plain lookAt() aims it down the corridor.

import * as THREE from 'three';
import { CFG } from './config.js';
import { halfWidth, worldFromLocal, tangent } from './path.js';

// Keep the visible model and its flight collision footprint in proportion.
const JET_SCALE = 0.42;

export class Ship {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.scale.setScalar(JET_SCALE);
    scene.add(this.group);

    const glow = new THREE.Color(CFG.colShip);

    // Hull: a sharp 4-sided wedge.
    const hullGeo = new THREE.ConeGeometry(2.4, 7.2, 4);
    hullGeo.rotateX(-Math.PI / 2); // nose -> -Z
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d18,
      metalness: 0.85,
      roughness: 0.3,
      emissive: 0x061a2a,
      emissiveIntensity: 0.6,
      flatShading: true,
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    this.group.add(hull);
    this.group.add(edgeGlow(hullGeo, glow, 1.0));

    // Wing layout: a broad, straight centre panel with a matching V-fork on
    // each end. The body stays rectangular; only the outer tips split.
    const wingMat = hullMat.clone();
    const wingGlow = new THREE.Color(CFG.colWall);
    const wingY = -0.48;
    const sparZ = 1.05;
    const wingPanelGeo = new THREE.BoxGeometry(7.4, 0.2, 0.75);
    const wingPanel = new THREE.Mesh(wingPanelGeo, wingMat);
    wingPanel.position.set(0, wingY, sparZ);
    this.group.add(wingPanel);
    this.group.add(edgeGlow(wingPanelGeo, wingGlow, 0.8, wingPanel.position));

    const leftTip = new THREE.Vector3(-3.7, wingY, sparZ);
    const rightTip = new THREE.Vector3(3.7, wingY, sparZ);
    const addWingBeam = (from, to) => addBeam(this.group, from, to, wingMat, wingGlow, 0.8);

    addWingBeam(leftTip, new THREE.Vector3(-5.6, wingY, -0.55));
    addWingBeam(leftTip, new THREE.Vector3(-5.6, wingY, 2.65));
    addWingBeam(rightTip, new THREE.Vector3(5.6, wingY, -0.55));
    addWingBeam(rightTip, new THREE.Vector3(5.6, wingY, 2.65));

    // Tail fin.
    const finGeo = new THREE.BoxGeometry(0.35, 2.6, 2.2);
    const fin = new THREE.Mesh(finGeo, wingMat);
    fin.position.set(0, 1.0, 2.4);
    this.group.add(fin);
    this.group.add(edgeGlow(finGeo, glow, 0.7, fin.position, null));

    // Engine core at the tail + a coloured light that spills onto the walls.
    const engGeo = new THREE.CylinderGeometry(1.1, 1.4, 0.6, 12);
    engGeo.rotateX(Math.PI / 2);
    this.engineMat = new THREE.MeshBasicMaterial({
      color: glow,
      transparent: true,
      opacity: 0.95,
    });
    this.engine = new THREE.Mesh(engGeo, this.engineMat);
    this.engine.position.set(0, 0, 3.5);
    this.group.add(this.engine);

    this.engineLight = new THREE.PointLight(CFG.colShip, 6, 60, 2);
    this.engineLight.position.set(0, 0, 4);
    this.group.add(this.engineLight);

    this._tail = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.z = 0;
    this.u = 0;
    this.v = CFG.wallHeight * 0.42;
    this.velU = 0;
    this.velV = 0;
    this.thrust = 0.5;
    this.alive = true;
  }

  // Integrate one step. `speed` is the current forward m/s. Returns a report of
  // any crash / graze that happened this frame so the game can react.
  update(dt, ax, ay, speed) {
    // Forward travel.
    this.z += speed * dt;

    // Lateral momentum. The chase camera looks down +Z, so world +X is on the
    // LEFT of the screen; negate the input so "steer right" moves right on screen
    // (applies to keyboard, mouse and touch alike).
    this.velU += -ax * CFG.accelLat * dt;
    this.velU -= this.velU * CFG.dampLat * dt;
    this.velU = THREE.MathUtils.clamp(this.velU, -CFG.maxLatVel, CFG.maxLatVel);
    this.u += this.velU * dt;

    // Vertical momentum.
    this.velV += ay * CFG.accelVert * dt;
    this.velV -= this.velV * CFG.dampVert * dt;
    this.velV = THREE.MathUtils.clamp(this.velV, -CFG.maxVertVel, CFG.maxVertVel);
    this.v += this.velV * dt;

    // Collision against the corridor cross-section.
    const hw = halfWidth(this.z);
    const limU = hw - CFG.shipRadius;
    const minV = CFG.floorClear;
    const maxV = CFG.wallHeight - CFG.ceilClear;

    const report = { crash: false, graze: false, gap: Infinity, side: 0 };

    // Ceiling is an open sky -> cap softly, never fatal.
    if (this.v > maxV) { this.v = maxV; if (this.velV > 0) this.velV = 0; }

    // Floor and walls are fatal on contact.
    if (this.v <= minV) { report.crash = true; report.side = 2; }
    if (Math.abs(this.u) >= limU) { report.crash = true; report.side = Math.sign(this.u); }

    // Graze: skimming a surface without touching it.
    const gapL = limU - Math.abs(this.u);
    const gapFloor = this.v - minV;
    report.gap = Math.min(gapL, gapFloor);
    if (!report.crash && report.gap < CFG.grazeDist) {
      report.graze = true;
      report.side = gapL < gapFloor ? Math.sign(this.u) : 2;
    }

    if (report.crash) this.alive = false;
    return report;
  }

  // Place and orient the mesh from the current flight state.
  syncTransform(dt, thrustLevel) {
    worldFromLocal(this.z, this.u, this.v, this._pos);
    tangent(this.z, this.u, this.v, this._fwd);

    this.group.position.copy(this._pos);
    this.group.up.set(0, 1, 0);
    this.group.lookAt(this._pos.clone().add(this._fwd));

    // Bank into turns and pitch into climbs (cosmetic).
    const roll = THREE.MathUtils.clamp(-this.velU * 0.028, -0.7, 0.7);
    const pitch = THREE.MathUtils.clamp(-this.velV * 0.018, -0.45, 0.45);
    this.group.rotateZ(roll);
    this.group.rotateX(pitch);

    // Idle bob for life.
    const bob = Math.sin(performance.now() * 0.006) * 0.15;
    this.group.translateY(bob);

    // Engine visuals track thrust.
    this.thrust += (thrustLevel - this.thrust) * Math.min(1, dt * 8);
    const flick = 0.85 + Math.random() * 0.15;
    this.engineMat.opacity = 0.6 + this.thrust * 0.4 * flick;
    this.engine.scale.setScalar(0.8 + this.thrust * 0.9 * flick);
    this.engineLight.intensity = 3 + this.thrust * 9 * flick;
  }

  worldPos(out = this._pos) { return worldFromLocal(this.z, this.u, this.v, out); }
  forward(out = this._fwd) { return tangent(this.z, this.u, this.v, out); }

  // World position of the engine (for the exhaust trail).
  tailWorld(out = this._tail) {
    return this.group.localToWorld(out.set(0, 0, 4));
  }

  setVisible(v) { this.group.visible = v; }
}

// Build an additive wireframe overlay for a geometry so edges read as neon.
function edgeGlow(geo, color, opacity = 1, position = null) {
  const edges = new THREE.EdgesGeometry(geo);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const seg = new THREE.LineSegments(edges, mat);
  if (position) seg.position.copy(position);
  return seg;
}

// Add one solid neon wing strut between two points in the local XZ plane.
function addBeam(group, from, to, material, glow, glowOpacity) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const geo = new THREE.BoxGeometry(0.22, 0.16, length);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction.normalize(),
  );
  const position = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);

  const beam = new THREE.Mesh(geo, material);
  beam.position.copy(position);
  beam.quaternion.copy(rotation);
  group.add(beam);

  const beamGlow = edgeGlow(geo, glow, glowOpacity);
  beamGlow.position.copy(position);
  beamGlow.quaternion.copy(rotation);
  group.add(beamGlow);
}

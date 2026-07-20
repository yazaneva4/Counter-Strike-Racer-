// The hovership: a detailed neon starfighter -- a faceted violet hull with a
// glowing canopy, long swept wings that fork at the tips, and twin engine
// nacelles that flare magenta -- plus the whole flight model (lateral/vertical
// momentum, corridor collision, graze detection).
//
// Modelling convention: the NOSE points down -Z so a plain lookAt() aims the
// craft along the corridor, and the tail/engines sit at +Z facing the chase
// camera -- exactly where their glow reads best.

import * as THREE from 'three';
import { CFG } from './config.js';
import { halfWidth, worldFromLocal, tangent } from './path.js';

// Palette for the airframe.
const COL_HULL     = 0x1a0f3a; // deep indigo body
const COL_HULL_LIT = 0x2a1360; // lit facets
const COL_CYAN     = CFG.colFloor; // 0x00eaff -- fuselage edge neon
const COL_MAGENTA  = CFG.colWall;  // 0xff2bbf -- wing edge neon
const COL_ENGINE   = 0xff43c8;     // hot magenta exhaust
const COL_CANOPY   = 0xb84dff;     // violet canopy glow

export class Ship {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // A body sub-group we can scale/tune without touching flight transforms.
    this.body = new THREE.Group();
    this.group.add(this.body);

    this.engines = []; // { mesh, mat, plume, plumeMat, light }

    this._buildHull();
    this._buildCanopy();
    this._buildWings();
    this._buildEngines();
    this._buildFins();

    // Overall size in the corridor (kept small so it reads as a nimble dart).
    this.body.scale.setScalar(0.42);

    this._tail = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.reset();
  }

  // ---- Construction ------------------------------------------------------

  _hullMaterial(lit = false) {
    return new THREE.MeshStandardMaterial({
      color: lit ? COL_HULL_LIT : COL_HULL,
      metalness: 0.82,
      roughness: 0.28,
      emissive: 0x140a33,
      emissiveIntensity: 0.55,
      flatShading: true,
    });
  }

  _buildHull() {
    const mat = this._hullMaterial();

    // Forward hull: a long rounded nose spearing down -Z.
    const noseGeo = new THREE.ConeGeometry(1.55, 6.6, 8);
    noseGeo.rotateX(-Math.PI / 2);       // tip -> -Z
    noseGeo.translate(0, 0, -1.7);       // push the point forward
    const nose = new THREE.Mesh(noseGeo, mat);
    this.body.add(nose);
    this.body.add(neon(noseGeo, COL_CYAN, 0.9));

    // Mid body: a rounded barrel that carries the wings and cockpit.
    const midGeo = new THREE.CylinderGeometry(1.55, 1.15, 3.6, 8);
    midGeo.rotateX(Math.PI / 2);
    midGeo.rotateZ(Math.PI / 8);         // flat facet up, matching the nose
    midGeo.translate(0, 0, 2.0);
    const mid = new THREE.Mesh(midGeo, this._hullMaterial(true));
    this.body.add(mid);
    this.body.add(neon(midGeo, COL_CYAN, 0.85));

    // Belly keel: a shallow ridge that gives the underside a spine.
    const keelGeo = new THREE.CylinderGeometry(0.0, 0.9, 5.4, 3);
    keelGeo.rotateX(Math.PI / 2);
    keelGeo.rotateZ(Math.PI);            // point down
    keelGeo.scale(1, 0.5, 1);
    keelGeo.translate(0, -1.15, 0.4);
    const keel = new THREE.Mesh(keelGeo, mat);
    this.body.add(keel);
    this.body.add(neon(keelGeo, COL_MAGENTA, 0.5));

    // Cyan shoulder accents sweeping back from the cockpit toward the wing
    // roots -- the bright cyan panelling either side of the body in the art.
    for (const dir of [1, -1]) {
      const strake = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 3.6),
        new THREE.MeshBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      strake.position.set(dir * 1.0, 0.15, 1.2);
      strake.rotation.y = dir * 0.13;
      this.body.add(strake);
    }
  }

  _buildCanopy() {
    // A violet bubble canopy up FRONT (a cockpit reads as the nose). Kept modest
    // so the glowing engine nozzles at the tail clearly mark the back.
    const geo = new THREE.SphereGeometry(1.1, 12, 8);
    geo.scale(0.8, 0.84, 1.7);
    geo.translate(0, 0.42, -1.0);
    this.canopyMat = new THREE.MeshStandardMaterial({
      color: 0x230d44,
      emissive: COL_CANOPY,
      emissiveIntensity: 0.85,
      metalness: 0.45,
      roughness: 0.12,
      transparent: true,
      opacity: 0.9,
    });
    const canopy = new THREE.Mesh(geo, this.canopyMat);
    this.body.add(canopy);
    this.body.add(neon(geo, COL_MAGENTA, 0.5)); // magenta canopy framing
  }

  _buildWings() {
    // Swept-back wings tapering to a single tip. The rearward sweep (tips point
    // aft, toward the chase camera) makes the craft read as an arrow flying
    // FORWARD -- so it never looks like it's going backwards.
    // Shape space: X = span outboard, Y = chord (+Y becomes +Z = aft).
    const pts = [
      [0.4, -1.0],   // root leading edge (forward)
      [4.5, -0.1], [8.0, 0.9],
      [11.2, 2.0],   // tip: far outboard and swept well aft
      [10.4, 2.6],   // tip trailing
      [7.0, 2.2], [3.5, 1.8], [0.4, 1.5],   // root trailing edge
    ];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.24, bevelEnabled: true, bevelThickness: 0.06,
      bevelSize: 0.06, bevelSegments: 1, steps: 1,
    });
    wingGeo.rotateX(-Math.PI / 2);       // planform into X(span)/Z(chord)
    wingGeo.translate(0, -0.12, 0);      // centre the thickness on Y

    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x241452, metalness: 0.82, roughness: 0.28,
      emissive: 0x1a0940, emissiveIntensity: 0.55, side: THREE.DoubleSide,
      flatShading: true,
    });

    for (const dir of [1, -1]) {
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.scale.x = dir;                // mirror for the left wing
      wing.position.set(dir * 1.1, 0.05, 0.2);
      wing.rotation.z = dir * 0.05;      // nearly flat, just a hint of dihedral
      this.body.add(wing);
      wing.add(neon(wingGeo, COL_MAGENTA, 0.5)); // subtle full outline

      // Magenta neon strip along the swept leading edge, out to the tip.
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(11.6, 0.09, 0.4),
        new THREE.MeshBasicMaterial({ color: COL_MAGENTA, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      top.position.set(dir * 5.6, 0.14, 0.35);
      top.rotation.y = dir * -0.27;   // follow the rearward sweep
      wing.add(top);

      // Cyan neon strip along the underside, parallel to the leading edge.
      const bot = new THREE.Mesh(
        new THREE.BoxGeometry(11.0, 0.09, 0.4),
        new THREE.MeshBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      bot.position.set(dir * 5.4, -0.14, 1.05);
      bot.rotation.y = dir * -0.27;
      wing.add(bot);
    }
  }

  _buildEngines() {
    const nacelleMat = this._hullMaterial(true);

    // Two nacelle pods flanking the tail, each ending in a glowing nozzle.
    for (const dir of [1, -1]) {
      const housingGeo = new THREE.CylinderGeometry(0.8, 0.98, 3.2, 8);
      housingGeo.rotateX(Math.PI / 2);
      const housing = new THREE.Mesh(housingGeo, nacelleMat);
      housing.position.set(dir * 1.3, -0.12, 2.5);
      housing.rotation.z = dir * -0.09;   // bottom splays outward
      this.body.add(housing);
      housing.add(neon(housingGeo, COL_CYAN, 0.7));

      this._addEngine(dir * 1.3, -0.15, 4.2, 0.82, false);
    }

    // A larger central engine.
    this._addEngine(0, -0.32, 4.05, 0.95, true);
  }

  // A rear engine nozzle facing the chase camera: a bright ring around a dark
  // throat with a hot core and a soft flame -- reads unmistakably as the BACK of
  // the craft, so the ship never looks like it's flying backwards.
  _addEngine(x, y, z, r, big) {
    // Dark throat (the hole you look into).
    const throat = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.72, 22),
      new THREE.MeshBasicMaterial({ color: 0x0a0014, transparent: true, opacity: 0.92,
        depthWrite: false, side: THREE.DoubleSide }));
    throat.position.set(x, y, z - 0.06);
    this.body.add(throat);

    // Bright nozzle ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.72, r, 26),
      new THREE.MeshBasicMaterial({ color: COL_ENGINE, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(x, y, z);
    this.body.add(ring);

    // Hot core.
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.42, 18),
      new THREE.MeshBasicMaterial({ color: 0xfff0ff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.set(x, y, z + 0.03);
    this.body.add(core);

    // Soft flame tapering back toward the camera (grows with thrust).
    const flameGeo = new THREE.ConeGeometry(r * 0.85, r * 3.0, 18, 1, true);
    flameGeo.rotateX(Math.PI / 2);            // apex downstream (+Z, toward camera)
    flameGeo.translate(0, 0, r * 1.5);
    const flameMat = new THREE.MeshBasicMaterial({ color: COL_ENGINE, transparent: true,
      opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(x, y, z + 0.05);
    this.body.add(flame);

    const light = new THREE.PointLight(COL_ENGINE, big ? 5 : 4, big ? 55 : 46, 2);
    light.position.set(x, y, z + 0.5);
    this.body.add(light);

    this.engines.push({ ringMat: ring.material, core, flame, flameMat, light });
  }

  _buildFins() {
    const mat = this._hullMaterial();
    // A pair of canted tail fins for a bit more silhouette from behind.
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0); finShape.lineTo(0, 2.1);
    finShape.lineTo(1.5, 2.9); finShape.lineTo(1.9, 2.7);
    finShape.lineTo(0.7, 0); finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.14, bevelEnabled: false, steps: 1,
    });
    finGeo.translate(-0.07, 0, 0);
    for (const dir of [1, -1]) {
      const fin = new THREE.Mesh(finGeo, mat);
      fin.scale.x = dir;
      fin.position.set(dir * 0.55, 0.2, 2.7);
      fin.rotation.z = dir * -0.32;
      this.body.add(fin);
      fin.add(neon(finGeo, COL_CYAN, 0.8));
    }
  }

  // ---- Flight model ------------------------------------------------------

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

    // Engine visuals track thrust: brighter, longer plume when boosting.
    this.thrust += (thrustLevel - this.thrust) * Math.min(1, dt * 8);
    const t = this.thrust;
    for (const e of this.engines) {
      const flick = 0.85 + Math.random() * 0.15;
      e.ringMat.opacity = 0.8 + t * 0.2 * flick;
      e.core.scale.setScalar(0.7 + t * 0.7 * flick);
      e.flameMat.opacity = (0.22 + t * 0.5) * flick;
      e.flame.scale.set(1, 1, 0.55 + t * 1.5 * flick);
      e.light.intensity = 2.5 + t * 7 * flick;
    }
    if (this.canopyMat) this.canopyMat.emissiveIntensity = 0.7 + t * 0.4;
  }

  worldPos(out = this._pos) { return worldFromLocal(this.z, this.u, this.v, out); }
  forward(out = this._fwd) { return tangent(this.z, this.u, this.v, out); }

  // World position of the engines (for the exhaust trail).
  tailWorld(out = this._tail) {
    return this.group.localToWorld(out.set(0, -0.28, 3.4));
  }

  setVisible(v) { this.group.visible = v; }
}

// Build an additive wireframe overlay for a geometry so its edges read as neon.
// Returned as a LineSegments so callers can `.translate*()` it if the source
// geometry wasn't already positioned in the parent's space.
function neon(geo, color, opacity = 1) {
  const edges = new THREE.EdgesGeometry(geo, 24);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.LineSegments(edges, mat);
}

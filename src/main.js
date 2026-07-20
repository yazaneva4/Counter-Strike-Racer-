// RIFTBREAK VELOCITY -- entry point and game loop.
// Wires the subsystems together, owns the state machine (menu / playing / dead),
// the scoring, the boost + rift economy, and the speed-drunk chase camera.

import * as THREE from 'three';
import { CFG } from './config.js';
import { localBasis } from './path.js';
import { Input } from './input.js';
import { Environment } from './environment.js';
import { Canyon } from './canyon.js';
import { Ship } from './ship.js';
import { Gates } from './gates.js';
import { Rift } from './rift.js';
import { Particles } from './particles.js';
import { PostFX } from './postfx.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';

const BEST_KEY = 'riftbreak_best';
const CAM_ORDER = ['third', 'first'];
const CAM_LABEL = { third: '3RD PERSON', first: '1ST PERSON' };

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CFG.fovBase, innerWidth / innerHeight, 0.1, 12000);

    this.env = new Environment(this.scene, this.renderer);
    this.canyon = new Canyon(this.scene);
    this.ship = new Ship(this.scene);
    this.gates = new Gates(this.scene);
    this.rift = new Rift(this.scene);
    this.particles = new Particles(this.scene);
    this.post = new PostFX(this.renderer, this.scene, this.camera);

    this.input = new Input();
    this.hud = new HUD();
    this.audio = new Audio();

    this.gates.onResult = (hit, idx) => this._onGate(hit, idx);

    // Camera smoothing state.
    this.camPos = new THREE.Vector3(0, CFG.camHeight, -CFG.camDist);
    this._look = new THREE.Vector3();
    this._rand = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    this.best = Number(localStorage.getItem(BEST_KEY)) || 0;

    this.state = 'menu';
    this.menuZ = 0;
    this.boostVis = 0;
    this.fovKick = 0;
    this.impulse = 0;
    this.deadTimer = 0;
    this.time = 0;
    this.cameraMode = 'third';

    this._resetRun();
    this.ship.setVisible(true);
    this.hud.showMenu(this.best);
    this.hud.setMuted(this.audio.muted);
    this.hud.setCamMode(this.cameraMode);

    // Tappable mute (handy on touch, where there's no M key).
    if (this.hud.muteIndicator) {
      this.hud.muteIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.init();
        this.hud.setMuted(this.audio.toggleMute());
      });
    }

    // Tappable camera switch (cycles views; handy on touch).
    if (this.hud.camIndicator) {
      this.hud.camIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applyCamAction('cycle');
      });
    }

    addEventListener('resize', () => this._onResize());
    this.last = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _resetRun() {
    this.ship.reset();
    this.gates.reset();
    this.rift.reset(this.ship.z);
    this.particles.reset(this.ship.z);
    this.distance = 0;
    this.style = 0;
    this.multiplier = 1;
    this.chain = 0;
    this.boost = CFG.boostMax;
    this.speed = CFG.startSpeed;
    this.topSpeed = CFG.startSpeed;
    this.gatesHit = 0;
    this.grazeTimer = 0;
    this.danger = 0;
  }

  _startGame() {
    this.audio.init();
    this.audio.resume();
    this.input.consumeAction(); // clear any queued press so we start clean
    this._resetRun();
    this.ship.setVisible(true);
    this.state = 'playing';
    this.hud.hideOverlay();
    this.audio.boost();
    this.fovKick = 6;
  }

  _die(caught) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.deadTimer = 0;
    this.impulse = 3.2;
    // Discard any Space presses queued during the run (boost also uses Space),
    // so the game never auto-restarts without a fresh press.
    this.input.consumeAction();
    this.ship.worldPos(this._look);
    this.particles.crash(this._look);
    this.ship.setVisible(false);
    this.audio.crash();

    const newBest = this.distance > this.best;
    if (newBest) {
      this.best = Math.floor(this.distance);
      try { localStorage.setItem(BEST_KEY, String(this.best)); } catch (e) {}
    }
    this.hud.showGameOver({
      caught,
      distance: this.distance,
      style: this.style,
      topSpeed: this.topSpeed,
      gates: this.gatesHit,
      best: this.best,
      newBest,
    });
  }

  _onGate(hit, idx) {
    if (this.state !== 'playing') return;
    if (hit) {
      this.chain += 1;
      this.gatesHit += 1;
      this.multiplier = Math.min(CFG.multiplierMax, 1 + Math.floor(this.chain / CFG.chainPerMultiplier));
      this.style += CFG.gateScore * this.multiplier;
      this.boost = Math.min(CFG.boostMax, this.boost + CFG.gateBoostRefill);
      this.rift.knockback(CFG.gateKnockback);
      this.fovKick = 5;
      this.impulse = 1.0;
      this.audio.gate(true);
      this.ship.worldPos(this._look);
      this.particles.spawn(this._look.x, this._look.y, this._look.z, 0.3, 1.0, 0.6, 26, 26, 0.5);
      this.hud.popup(this.chain > 1 ? `CHAIN x${this.multiplier}` : 'GATE!', '#39ff8a');
    } else {
      if (this.chain > 2) this.hud.popup('CHAIN LOST', '#ff3b5c');
      this.chain = 0;
      this.multiplier = 1;
      this.audio.gate(false);
    }
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize(innerWidth, innerHeight);
  }

  _loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;

    if (this.input.consumeMute()) {
      this.audio.init();
      this.hud.setMuted(this.audio.toggleMute());
    }

    const camReq = this.input.consumeCamera();
    if (camReq) this._applyCamAction(camReq);

    if (this.state === 'menu') this._updateMenu(dt);
    else if (this.state === 'playing') this._updatePlaying(dt);
    else this._updateDead(dt);

    // The ship is hidden in the cockpit (1st-person) view, and after a crash.
    if (this.state !== 'dead') this.ship.setVisible(this.cameraMode !== 'first');

    // Shared visual updates.
    this.canyon.update(this.ship.z);
    this.gates.update(this.ship.z, this.ship.u, this.ship.v, dt, this.time);
    this.particles.update(dt, this.ship.z, this.speed);
    this.env.update(this.camera, this.time);

    this._updateCamera(dt);

    const speed01 = THREE.MathUtils.clamp((this.speed - CFG.startSpeed) / (CFG.maxSpeed - CFG.startSpeed), 0, 1);
    this.post.update(dt, this.time, speed01, this.boostVis, this.danger);
    this.audio.setEngine(speed01, this.boostVis, this.state !== 'dead');

    this.post.render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _updateMenu(dt) {
    // Attract-mode auto cruise so the title sits over live flight.
    this.speed = CFG.startSpeed * 0.7;
    this.ship.z += this.speed * dt;
    this.ship.u = Math.sin(this.time * 0.4) * 8;
    this.ship.v = CFG.wallHeight * 0.4 + Math.sin(this.time * 0.3) * 4;
    this.ship.velU = Math.cos(this.time * 0.4) * 8;
    this.ship.syncTransform(dt, 0.6);
    this.rift.mesh.visible = false;
    this.rift.light.intensity = 0;
    this.boostVis += (0 - this.boostVis) * Math.min(1, dt * 4);
    this.danger = 0;

    if (this.input.consumeAction()) this._startGame();
  }

  _updatePlaying(dt) {
    this.rift.mesh.visible = true;

    // Boost economy.
    const wantBoost = this.input.isBoost() && this.boost > 0;
    if (wantBoost) this.boost = Math.max(0, this.boost - CFG.boostDrain * dt);
    else this.boost = Math.min(CFG.boostMax, this.boost + CFG.boostRegen * dt);
    this.boostVis += ((wantBoost ? 1 : 0) - this.boostVis) * Math.min(1, dt * 6);

    // Forward speed: ramps with distance, plus boost and a chain bonus.
    const baseSpeed = Math.min(
      CFG.maxSpeed - CFG.boostSpeed,
      CFG.startSpeed + Math.sqrt(Math.max(0, this.distance)) * CFG.speedRamp
    );
    this.speed = THREE.MathUtils.clamp(
      baseSpeed + (wantBoost ? CFG.boostSpeed : 0) + this.multiplier * 1.4,
      0,
      CFG.maxSpeed
    );
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    // Fly.
    const ax = this.input.axisX();
    const ay = this.input.axisY();
    const report = this.ship.update(dt, ax, ay, this.speed);
    this.distance = this.ship.z;
    this.style += this.speed * dt * 0.35 * this.multiplier; // passive distance-style

    if (report.crash) {
      this._die(false);
      this.ship.syncTransform(dt, this.boostVis);
      return;
    }

    // Graze handling (continuous, rate-limited sparks).
    this.grazeTimer -= dt;
    if (report.graze) {
      this.style += CFG.grazeScore * this.multiplier * dt * 2.2;
      if (this.grazeTimer <= 0) {
        this.grazeTimer = CFG.grazeCooldown;
        this.ship.worldPos(this._look);
        this.particles.graze(this._look, report.side);
        this.rift.knockback(CFG.grazeKnockback * 0.35);
        this.impulse = Math.max(this.impulse, 0.5);
      }
    }

    // Rift chase.
    const progress = THREE.MathUtils.clamp(this.distance / CFG.riftRampDist, 0, 1);
    const gap = this.rift.update(dt, this.ship.z, baseSpeed, progress, this.time);
    this.danger = this.rift.danger();
    if (gap <= 0) { this._die(true); this.ship.syncTransform(dt, this.boostVis); return; }

    // Exhaust trail.
    this.ship.syncTransform(dt, 0.55 + this.boostVis * 0.45);
    this.ship.tailWorld(this._look);
    this.particles.trail(this._look, this.boostVis);

    this._pushHud();
  }

  _updateDead(dt) {
    this.deadTimer += dt;
    // Let the wreck coast and the rift keep advancing for drama.
    this.speed *= Math.max(0, 1 - dt * 1.5);
    this.rift.mesh.visible = true;
    const progress = THREE.MathUtils.clamp(this.distance / CFG.riftRampDist, 0, 1);
    this.rift.update(dt, this.ship.z + 2, 40, progress, this.time);
    this.danger = Math.min(1, this.danger + dt * 0.6);
    this.boostVis += (0 - this.boostVis) * Math.min(1, dt * 3);

    if (this.deadTimer > 0.7 && this.input.consumeAction()) this._startGame();
  }

  // Switch camera view. `a` is 'cycle' or an explicit mode name.
  _applyCamAction(a) {
    if (a === 'cycle') {
      const i = CAM_ORDER.indexOf(this.cameraMode);
      this.cameraMode = CAM_ORDER[(i + 1) % CAM_ORDER.length];
    } else if (CAM_ORDER.includes(a)) {
      if (a === this.cameraMode) return;
      this.cameraMode = a;
    } else {
      return;
    }
    this.hud.setCamMode(this.cameraMode);
    this.hud.popup(CAM_LABEL[this.cameraMode], '#00eaff');
  }

  _updateCamera(dt) {
    const shipPos = this.ship.worldPos(this._look).clone();
    const fwd = this.ship.forward().clone();
    const { up } = localBasis(this.ship.z, new THREE.Vector3(), this._up);

    // Per-mode eye position, look target and base FOV.
    let desired, lookTarget, modeFov;
    if (this.cameraMode === 'first') {
      // Cockpit: sit just above the nose and look far down the corridor.
      desired = shipPos.clone().addScaledVector(fwd, CFG.cam1Fwd).addScaledVector(up, CFG.cam1Up);
      lookTarget = shipPos.clone().addScaledVector(fwd, 60).addScaledVector(up, 2.0);
      modeFov = CFG.fovFirst;
    } else {
      // Third person: behind and above (default chase).
      desired = shipPos.clone().addScaledVector(fwd, -CFG.camDist).addScaledVector(up, CFG.camHeight);
      lookTarget = shipPos.clone().addScaledVector(fwd, CFG.camLookAhead).addScaledVector(up, CFG.camLookUp);
      modeFov = CFG.fovBase;
    }

    const k = 1 - Math.exp(-CFG.camLerp * dt);
    this.camPos.lerp(desired, k);

    // Shake from speed / boost / danger / impulses.
    const speed01 = THREE.MathUtils.clamp((this.speed - CFG.startSpeed) / (CFG.maxSpeed - CFG.startSpeed), 0, 1);
    const baseShake = speed01 * CFG.shakeSpeed + this.boostVis * CFG.shakeBoost + this.danger * 0.4;
    this.impulse *= Math.max(0, 1 - dt * 4);
    const shake = baseShake * 0.18 + this.impulse;
    this._rand.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(shake);

    this.camera.position.copy(this.camPos).add(this._rand);
    this.camera.up.copy(up);
    this.camera.lookAt(lookTarget);

    // FOV surge relative to the current mode's base.
    this.fovKick *= Math.max(0, 1 - dt * 3);
    const targetFov = modeFov + speed01 * CFG.fovSpeed + this.boostVis * CFG.fovBoost + this.fovKick;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
  }

  _pushHud() {
    this.hud.setStats({
      distance: this.distance,
      speed: this.speed,
      style: this.style,
      multiplier: this.multiplier,
      chain: this.chain,
      boost01: this.boost / CFG.boostMax,
      danger: this.danger,
    });
  }
}

// Kick everything off once the DOM is ready.
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.__game = new Game();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('overlay');
    if (el) {
      el.className = 'show';
      el.innerHTML = `<div class="panel"><h1>WebGL failed to start</h1>
        <p style="opacity:.7">${err && err.message ? err.message : err}</p></div>`;
    }
  }
});

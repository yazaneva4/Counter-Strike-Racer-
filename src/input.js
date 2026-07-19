// Unified input: keyboard, mouse-steer, and touch all feed the same axes so the
// flight code never has to care where the intent came from.

import * as THREE from 'three';

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.pointerX = 0;      // -1..1, right positive
    this.pointerY = 0;      // -1..1, up positive
    this.pointerActive = false;
    this.pointerBoost = false;
    this.touchBoost = false;
    this._action = false;   // consumable "confirm / launch / restart"
    this._muteToggled = false;

    addEventListener('keydown', (e) => this._onKey(e, true));
    addEventListener('keyup', (e) => this._onKey(e, false));

    addEventListener('mousemove', (e) => {
      this.pointerActive = true;
      this.pointerX = (e.clientX / innerWidth) * 2 - 1;
      this.pointerY = -((e.clientY / innerHeight) * 2 - 1);
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 0) this.pointerBoost = true;
      this._action = true;
    });
    addEventListener('mouseup', () => { this.pointerBoost = false; });

    // Touch: first finger steers, a second finger (or the HUD button) boosts.
    const touchSteer = (e) => {
      if (!e.touches.length) return;
      const t = e.touches[0];
      this.pointerActive = true;
      this.pointerX = (t.clientX / innerWidth) * 2 - 1;
      this.pointerY = -((t.clientY / innerHeight) * 2 - 1);
      this.touchBoost = e.touches.length > 1;
    };
    addEventListener('touchstart', (e) => { this._action = true; touchSteer(e); }, { passive: true });
    addEventListener('touchmove', touchSteer, { passive: true });
    addEventListener('touchend', (e) => {
      this.touchBoost = e.touches.length > 1;
      if (!e.touches.length) this.touchBoost = false;
    });

    addEventListener('blur', () => this.keys.clear());
  }

  _onKey(e, down) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Stop arrows / space from scrolling the page.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (down) {
      if (!this.keys.has(k)) {
        if (k === 'Enter' || k === ' ') this._action = true;
        if (k === 'm') this._muteToggled = true;
      }
      this.keys.add(k);
    } else {
      this.keys.delete(k);
    }
  }

  _has(...ks) { return ks.some((k) => this.keys.has(k)); }

  // Lateral intent, -1 (left) .. 1 (right).
  axisX() {
    let a = 0;
    if (this._has('a', 'ArrowLeft')) a -= 1;
    if (this._has('d', 'ArrowRight')) a += 1;
    if (a === 0 && this.pointerActive) a = clampGain(this.pointerX);
    return THREE.MathUtils.clamp(a, -1, 1);
  }

  // Vertical intent, -1 (down) .. 1 (up).
  axisY() {
    let a = 0;
    if (this._has('w', 'ArrowUp')) a += 1;
    if (this._has('s', 'ArrowDown')) a -= 1;
    if (a === 0 && this.pointerActive) a = clampGain(this.pointerY);
    return THREE.MathUtils.clamp(a, -1, 1);
  }

  isBoost() {
    return this._has(' ', 'Shift') || this.pointerBoost || this.touchBoost;
  }

  // True exactly once per press of Enter / Space / click / tap.
  consumeAction() {
    const a = this._action;
    this._action = false;
    return a;
  }

  consumeMute() {
    const m = this._muteToggled;
    this._muteToggled = false;
    return m;
  }
}

// A little gain + deadzone so you steer fully without pinning the cursor to the
// screen edge, and small jitters near centre are ignored.
function clampGain(v) {
  const dead = 0.05;
  if (Math.abs(v) < dead) return 0;
  return THREE.MathUtils.clamp(v * 1.35, -1, 1);
}

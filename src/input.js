// Unified input: keyboard, mouse-steer, and touch all feed the same axes so the
// flight code never has to care where the intent came from.
//
// Touch scheme (phones/tablets): drag a finger anywhere to steer like a floating
// joystick -- horizontal drag = left/right, vertical drag = climb/dive -- and
// hold the on-screen BOOST pad with a second thumb to accelerate.

import * as THREE from 'three';

const STEER_RADIUS = 84; // px of drag for full deflection

export class Input {
  constructor() {
    this.keys = new Set();
    this.pointerX = 0;      // -1..1, right positive (mouse)
    this.pointerY = 0;      // -1..1, up positive (mouse)
    this.pointerActive = false;
    this.pointerBoost = false;

    this.touchMode = false;
    this.touchBoost = false;
    this.steerId = null;    // identifier of the finger currently steering
    this.tax = 0;           // touch lateral axis
    this.tay = 0;           // touch vertical axis
    this._sx = 0;
    this._sy = 0;

    this._action = false;   // consumable "confirm / launch / restart"
    this._muteToggled = false;
    this._camAction = null; // consumable camera request: 'cycle'|'first'|'second'|'third'

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add('touch');
    }

    addEventListener('keydown', (e) => this._onKey(e, true));
    addEventListener('keyup', (e) => this._onKey(e, false));

    // ---- Mouse (desktop) ----------------------------------------------
    addEventListener('mousemove', (e) => {
      if (this.touchMode) return;
      this.pointerActive = true;
      this.pointerX = (e.clientX / innerWidth) * 2 - 1;
      this.pointerY = -((e.clientY / innerHeight) * 2 - 1);
    });
    addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      if (e.button === 0) this.pointerBoost = true;
      this._action = true;
    });
    addEventListener('mouseup', () => { this.pointerBoost = false; });

    // A tap or click always counts as "confirm" (launch / restart). Taps
    // synthesise a click, so this guarantees launch works on every device even
    // if a synthetic touch event is missed.
    addEventListener('click', () => { this._action = true; });

    // ---- On-screen boost pad ------------------------------------------
    const boostBtn = document.getElementById('boostBtn');
    if (boostBtn) {
      const on = (e) => { e.preventDefault(); this.touchBoost = true; boostBtn.classList.add('down'); };
      const off = (e) => { e.preventDefault(); this.touchBoost = false; boostBtn.classList.remove('down'); };
      boostBtn.addEventListener('touchstart', on, { passive: false });
      boostBtn.addEventListener('touchend', off, { passive: false });
      boostBtn.addEventListener('touchcancel', off, { passive: false });
      // Also works with a mouse for testing.
      boostBtn.addEventListener('mousedown', on);
      addEventListener('mouseup', () => { this.touchBoost = false; boostBtn.classList.remove('down'); });
      this._boostBtn = boostBtn;
    }

    // ---- Touch steering (floating joystick) ---------------------------
    addEventListener('touchstart', (e) => {
      this.touchMode = true;
      this._action = true;
      for (const t of e.changedTouches) {
        if (this._onBoostPad(t)) continue;      // that finger drives the pad
        if (this.steerId === null) {
          this.steerId = t.identifier;
          this._sx = t.clientX;
          this._sy = t.clientY;
          this.tax = 0;
          this.tay = 0;
        }
      }
    }, { passive: true });

    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.steerId) {
          this.tax = THREE.MathUtils.clamp((t.clientX - this._sx) / STEER_RADIUS, -1, 1);
          this.tay = THREE.MathUtils.clamp(-(t.clientY - this._sy) / STEER_RADIUS, -1, 1);
        }
      }
    }, { passive: true });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.steerId) {
          this.steerId = null;
          this.tax = 0;
          this.tay = 0;
        }
      }
    };
    addEventListener('touchend', endTouch, { passive: true });
    addEventListener('touchcancel', endTouch, { passive: true });

    addEventListener('blur', () => { this.keys.clear(); this.touchBoost = false; this.steerId = null; this.tax = this.tay = 0; });
  }

  _onBoostPad(touch) {
    if (!this._boostBtn) return false;
    const r = this._boostBtn.getBoundingClientRect();
    // Only claim the touch if the pad is actually visible/interactive.
    if (r.width === 0 || r.height === 0) return false;
    return (
      touch.clientX >= r.left && touch.clientX <= r.right &&
      touch.clientY >= r.top && touch.clientY <= r.bottom
    );
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
        // Camera: 1 = 1st person, 2 = 2nd person, 3 = 3rd person, C = cycle.
        if (k === '1') this._camAction = 'first';
        if (k === '2') this._camAction = 'second';
        if (k === '3') this._camAction = 'third';
        if (k === 'c' || k === 'v') this._camAction = 'cycle';
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
    if (a === 0 && this.steerId !== null) a = this.tax;
    else if (a === 0 && this.pointerActive && !this.touchMode) a = clampGain(this.pointerX);
    return THREE.MathUtils.clamp(a, -1, 1);
  }

  // Vertical intent, -1 (down) .. 1 (up).
  axisY() {
    let a = 0;
    if (this._has('w', 'ArrowUp')) a += 1;
    if (this._has('s', 'ArrowDown')) a -= 1;
    if (a === 0 && this.steerId !== null) a = this.tay;
    else if (a === 0 && this.pointerActive && !this.touchMode) a = clampGain(this.pointerY);
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

  // Returns a pending camera request ('cycle'|'first'|'second'|'third') once, or null.
  consumeCamera() {
    const c = this._camAction;
    this._camAction = null;
    return c;
  }
}

// A little gain + deadzone so you steer fully without pinning the cursor to the
// screen edge, and small jitters near centre are ignored.
function clampGain(v) {
  const dead = 0.05;
  if (Math.abs(v) < dead) return 0;
  return THREE.MathUtils.clamp(v * 1.35, -1, 1);
}

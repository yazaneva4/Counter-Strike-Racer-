// Unified input: keyboard, mouse-steer, and touch all feed the same axes so the
// flight code never has to care where the intent came from.
//
// Touch scheme (phones/tablets): drag a finger anywhere to steer like a floating
// joystick -- horizontal drag = left/right, vertical drag = climb/dive --
// double-tap anywhere to cycle the camera, hold a finger still to spool up
// boost, or use the dedicated on-screen BOOST pad with a second thumb.

import * as THREE from 'three';

const STEER_RADIUS = 84;      // px of drag for full deflection

const TAP_MAX_MS = 250;       // release within this long to count as a "tap"
const TAP_MAX_MOVE_PX = 18;   // and moved less than this -- otherwise it's a drag
const DOUBLE_TAP_MS = 350;    // max gap between two taps to read as a double-tap
const DOUBLE_TAP_DIST_PX = 60;// and they must land roughly in the same spot

const LONG_PRESS_MS = 380;    // hold a finger still this long to spool up boost
const LONG_PRESS_MOVE_PX = 16;// moving past this before then cancels it (it's a drag)

export class Input {
  constructor() {
    this.keys = new Set();
    this.pointerX = 0;      // -1..1, right positive (mouse)
    this.pointerY = 0;      // -1..1, up positive (mouse)
    this.pointerActive = false;
    this.pointerBoost = false;

    this.touchMode = false;
    this.touchBoost = false;      // dedicated BOOST pad held
    this.longPressBoost = false;  // steering finger held still long enough to boost
    this.steerId = null;    // identifier of the finger currently steering
    this.tax = 0;           // touch lateral axis
    this.tay = 0;           // touch vertical axis
    this._sx = 0;
    this._sy = 0;
    this._steerStartT = 0;
    this._longPressFired = false;
    this._longPressTimer = null;
    this._lastTap = null;   // { t, x, y } of the last qualifying quick tap

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
      if (uiTarget(e.target)) return;   // menu buttons / name field handle themselves
      // Left button: boost + confirm/launch. Right button is handled below.
      if (e.button === 0) { this.pointerBoost = true; this._action = true; }
    });
    addEventListener('mouseup', () => { this.pointerBoost = false; });

    // Right-click cycles the camera view (and never opens the context menu).
    addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.touchMode) this._camAction = 'cycle';
    });

    // A tap or click always counts as "confirm" (launch / restart). Taps
    // synthesise a click, so this guarantees launch works on every device even
    // if a synthetic touch event is missed.
    addEventListener('click', (e) => { if (!uiTarget(e.target)) this._action = true; });

    // ---- On-screen boost pad ------------------------------------------
    const boostBtn = document.getElementById('boostBtn');
    if (boostBtn) {
      // The pad's glow is shared with the long-press-to-boost gesture below, so
      // only clear it once neither source is holding boost any more.
      const on = (e) => { e.preventDefault(); this.touchBoost = true; boostBtn.classList.add('down'); };
      const off = (e) => { e.preventDefault(); this.touchBoost = false; if (!this.longPressBoost) boostBtn.classList.remove('down'); };
      boostBtn.addEventListener('touchstart', on, { passive: false });
      boostBtn.addEventListener('touchend', off, { passive: false });
      boostBtn.addEventListener('touchcancel', off, { passive: false });
      // Also works with a mouse for testing.
      boostBtn.addEventListener('mousedown', on);
      addEventListener('mouseup', () => { this.touchBoost = false; if (!this.longPressBoost) boostBtn.classList.remove('down'); });
      this._boostBtn = boostBtn;
    }

    // ---- Touch steering (floating joystick) ---------------------------
    addEventListener('touchstart', (e) => {
      this.touchMode = true;
      if (!uiTarget(e.target)) this._action = true;   // not when tapping the menu UI
      for (const t of e.changedTouches) {
        if (this._onBoostPad(t)) continue;      // that finger drives the pad
        if (this.steerId === null) {
          this.steerId = t.identifier;
          this._sx = t.clientX;
          this._sy = t.clientY;
          this.tax = 0;
          this.tay = 0;
          this._steerStartT = performance.now();
          this._longPressFired = false;
          clearTimeout(this._longPressTimer);

          // Hold this finger roughly still (not steering) and boost kicks in
          // on its own, so flying one-thumb doesn't require the BOOST pad.
          if (!uiTarget(t.target)) {
            const id = t.identifier;
            this._longPressTimer = setTimeout(() => {
              if (this.steerId !== id) return;
              this._longPressFired = true;
              this.longPressBoost = true;
              if (this._boostBtn) this._boostBtn.classList.add('down');
            }, LONG_PRESS_MS);
          }
        }
      }
    }, { passive: true });

    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.steerId) {
          this.tax = THREE.MathUtils.clamp((t.clientX - this._sx) / STEER_RADIUS, -1, 1);
          this.tay = THREE.MathUtils.clamp(-(t.clientY - this._sy) / STEER_RADIUS, -1, 1);
          // Real steering, not a held-still press -- don't let it turn into a boost.
          if (this._longPressTimer && !this._longPressFired) {
            const moved = Math.hypot(t.clientX - this._sx, t.clientY - this._sy);
            if (moved > LONG_PRESS_MOVE_PX) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
          }
        }
      }
    }, { passive: true });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.steerId) {
          const dur = performance.now() - this._steerStartT;
          const moved = Math.hypot(t.clientX - this._sx, t.clientY - this._sy);

          if (this._longPressTimer) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
          if (this.longPressBoost) {
            this.longPressBoost = false;
            if (this._boostBtn && !this.touchBoost) this._boostBtn.classList.remove('down');
          }

          // A quick, near-stationary release is a tap -- two of those close in
          // time and place read as a double-tap, which cycles the camera view.
          if (!this._longPressFired && dur < TAP_MAX_MS && moved < TAP_MAX_MOVE_PX && !uiTarget(t.target)) {
            const now = performance.now();
            const last = this._lastTap;
            if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(t.clientX - last.x, t.clientY - last.y) < DOUBLE_TAP_DIST_PX) {
              this._camAction = 'cycle';
              this._lastTap = null;
            } else {
              this._lastTap = { t: now, x: t.clientX, y: t.clientY };
            }
          }

          this.steerId = null;
          this.tax = 0;
          this.tay = 0;
        }
      }
    };
    addEventListener('touchend', endTouch, { passive: true });
    addEventListener('touchcancel', endTouch, { passive: true });

    addEventListener('blur', () => {
      this.keys.clear();
      this.touchBoost = false;
      this.longPressBoost = false;
      if (this._longPressTimer) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
      if (this._boostBtn) this._boostBtn.classList.remove('down');
      this.steerId = null;
      this.tax = this.tay = 0;
    });
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
    // Ignore game keys while the player is typing in a text field (name entry).
    if (isFormField(e.target)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Stop arrows / space / tab from scrolling or moving focus.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }
    if (down) {
      if (!this.keys.has(k)) {
        if (k === 'Enter' || k === ' ') this._action = true;
        if (k === 'm') this._muteToggled = true;
        // Camera: Shift+Tab (or Tab) cycles; 1 = 1st person, 3 = 3rd person.
        if (k === 'Tab') this._camAction = 'cycle';
        if (k === '1') this._camAction = 'first';
        if (k === '3') this._camAction = 'third';
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
    return this._has(' ', 'Shift') || this.pointerBoost || this.touchBoost || this.longPressBoost;
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

// A text field the player is typing into -- game keys should be ignored.
function isFormField(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// Interactive HUD/menu chrome -- a click/tap here shouldn't launch or boost.
function uiTarget(t) {
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'LABEL') return true;
  return typeof t.closest === 'function'
    && !!t.closest('#menuBlock, #boostBtn, #muteIndicator, #camIndicator, #leaderboard');
}

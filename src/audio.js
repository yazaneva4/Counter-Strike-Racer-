// Procedural audio via the Web Audio API -- no asset files. An engine drone
// tracks speed, gates blip, boosts whoosh, crashes roar. Everything is wrapped
// defensively so a missing/blocked AudioContext never breaks the game, and it
// stays silent until the first user gesture (browser autoplay policy).

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this._noiseBuf = null;
  }

  // Call from a user gesture (keydown / click / touch).
  init() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(ctx.destination);

      // Engine: two detuned oscillators through a lowpass.
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 600;
      this.filter.Q.value = 6;
      this.engineGain.connect(this.filter);
      this.filter.connect(this.master);

      this.osc1 = ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc2 = ctx.createOscillator();
      this.osc2.type = 'square';
      this.osc1.frequency.value = 60;
      this.osc2.frequency.value = 30;
      this.osc1.connect(this.engineGain);
      this.osc2.connect(this.engineGain);
      this.osc1.start();
      this.osc2.start();

      // Pre-render a noise buffer for whooshes / crashes.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;

      this.ready = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    return this.muted;
  }

  setEngine(speed01, boost, running) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const base = 55 + speed01 * 150 + boost * 60;
    this.osc1.frequency.setTargetAtTime(base, now, 0.08);
    this.osc2.frequency.setTargetAtTime(base * 0.5, now, 0.08);
    this.filter.frequency.setTargetAtTime(500 + speed01 * 2600 + boost * 1500, now, 0.1);
    const g = running ? 0.05 + speed01 * 0.05 + boost * 0.05 : 0.0;
    this.engineGain.gain.setTargetAtTime(g, now, 0.1);
  }

  gate(hit) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(hit ? 660 : 300, now);
    o.frequency.exponentialRampToValueAtTime(hit ? 1320 : 180, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    o.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + 0.24);
  }

  boost() {
    if (!this.ready) return;
    this._noise(0.4, 'bandpass', 400, 3000, 0.25);
  }

  crash() {
    if (!this.ready) return;
    this._noise(1.2, 'lowpass', 2000, 120, 0.6);
    // A descending tone under the roar.
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(30, now + 0.9);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    o.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + 1.15);
  }

  _noise(dur, filterType, fStart, fEnd, gain) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(fStart, now);
    f.frequency.exponentialRampToValueAtTime(fEnd, now + dur);
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + dur);
  }
}

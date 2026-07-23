#!/usr/bin/env node
// RIFTBREAK VELOCITY -- AI Pilot reference client.
//
// A real, independently-running racer: it integrates the SAME flight physics,
// collision and boost economy as a human player (reusing the game's own
// config.js so there is exactly one source of truth for "same power"), makes
// its own steering/boost decisions through a pluggable `decide()` brain, and
// broadcasts its position into a Live Race room over the same Supabase
// Realtime protocol the browser uses. It shows up as a normal named racer --
// no "BOT" tag -- because from every other racer's point of view it's just
// another peer on the wire.
//
// Zero npm dependencies: Node 22 ships native fetch + WebSocket.
//
// Usage:
//   node ai-pilot/pilot.mjs --room ABCD --name AXIOM
//   node ai-pilot/pilot.mjs --dry-run                 (no network -- console telemetry only)
//   node ai-pilot/pilot.mjs --room ABCD --brain ./my-brain.mjs
//
// See ai-pilot/README.md for the full protocol and how to plug in a real brain
// (rule-based, a trained model, or an LLM call per tick).

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { CFG } from '../src/config.js';
import { SUPA_URL, SUPA_KEY, submitScore, cleanName } from '../src/leaderboard.js';

// ---- CLI args ------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}
const ROOM = args.room ? String(args.room).toUpperCase() : '';
const NAME = cleanName(args.name || 'AXIOM') || 'AXIOM';
const DRY_RUN = !!args['dry-run'] || !ROOM;
const SUBMIT = !!args.submit;
const RESPAWN = !!args.respawn;
const TICK_MS = Number(args.tick) > 0 ? Number(args.tick) : 50; // 20 Hz sim
const BIAS = args.bias != null ? clamp(Number(args.bias), -1, 1) : (Math.random() * 2 - 1) * 0.5;

if (!ROOM && !args['dry-run']) {
  console.log('No --room given; running --dry-run (no network, console telemetry only).\n');
}

// ---- Corridor math (mirrors src/path.js's halfWidth exactly) -------------
//
// Collision only ever needs the corridor's HALF-WIDTH at a given distance --
// every other shape function (centerX/centerY/bank) only matters for turning
// (z,u,v) into a world-space point for rendering, and that happens on each
// viewer's own machine from the (z,u,v) we broadcast. So this is the only
// piece of corridor geometry the pilot needs to duplicate.
function halfWidth(z) {
  const w =
    CFG.widthBase +
    CFG.widthAmp * Math.sin(z * 0.0079 + 0.5) +
    5 * Math.sin(z * 0.0189 + 3.0);
  return Math.max(CFG.widthMin, w);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---- Default brain ---------------------------------------------------
//
// A genuinely reactive pilot: it looks ahead along the corridor for the
// tightest upcoming half-width and steers toward the middle of whatever room
// is actually available there (a real safety margin, not a fixed wiggle),
// with a per-run lateral "personality" bias and a light chance to boost when
// it has meter to spare. Override this entirely via --brain (see README).
const LOOKAHEAD = [20, 45, 75, 110];
function defaultBrain(state) {
  let safeHw = state.halfWidthNow;
  for (const d of LOOKAHEAD) safeHw = Math.min(safeHw, halfWidth(state.z + d));
  const margin = Math.max(0, safeHw - CFG.shipRadius - 1.5);
  const targetU = clamp(BIAS * margin, -margin, margin);
  const targetV = CFG.wallHeight * 0.42;

  const ax = clamp((targetU - state.u) * 0.18, -1, 1);
  const ay = clamp((targetV - state.v) * 0.18, -1, 1);
  const boost = state.boostFraction > 0.4 && Math.random() < 0.02;
  return { ax, ay, boost };
}

async function loadBrain() {
  if (!args.brain) return defaultBrain;
  const url = pathToFileURL(resolve(process.cwd(), args.brain)).href;
  const mod = await import(url);
  const decide = mod.decide || mod.default;
  if (typeof decide !== 'function') {
    throw new Error(`${args.brain} must export a "decide(state)" function`);
  }
  console.log(`Loaded custom brain from ${args.brain}`);
  return decide;
}

// ---- Realtime link (mirrors src/realtime.js's Phoenix protocol) ----------
//
// No Ghost/THREE rendering here -- the pilot only needs to SEND its position,
// not draw anyone else's. Peers are tracked in a plain map in case a custom
// brain wants to react to nearby rivals (see state.peers).
class Link {
  constructor(room, id, name) {
    this.topic = 'realtime:csr-room-' + room;
    this.id = id;
    this.name = name;
    this.ws = null;
    this.ref = 0;
    this.joined = false;
    this.peers = new Map(); // id -> { name, z, u, v, speed, lastSeen }
    this._hb = null;
    this._lastSend = 0;
  }

  connect() {
    const wsUrl = SUPA_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + SUPA_KEY + '&vsn=1.0.0';
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener('open', () => this._join());
    this.ws.addEventListener('message', (e) => this._onMessage(e));
    this.ws.addEventListener('close', () => { this.joined = false; if (this._hb) clearInterval(this._hb); });
    this.ws.addEventListener('error', () => {});
  }

  _send(obj) {
    try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); } catch (e) {}
  }

  _join() {
    this._send({
      topic: this.topic, event: 'phx_join', ref: String(++this.ref),
      payload: { config: { broadcast: { self: false, ack: false }, presence: { key: this.id }, private: false } },
    });
    this._send({ topic: this.topic, event: 'access_token', ref: String(++this.ref), payload: { access_token: SUPA_KEY } });
    if (this._hb) clearInterval(this._hb);
    this._hb = setInterval(() => this._send({ topic: 'phoenix', event: 'heartbeat', ref: String(++this.ref), payload: {} }), 25000);
  }

  _onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.topic === this.topic && msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
      this.joined = true;
      console.log(`Joined room ${this.topic.replace('realtime:csr-room-', '')}`);
      return;
    }
    if (msg.topic !== this.topic) return;
    if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'pos') {
      const p = msg.payload.payload;
      if (!p || !p.id || p.id === this.id) return;
      this.peers.set(p.id, { name: p.name, z: +p.z || 0, u: +p.u || 0, v: +p.v || 0, speed: +p.speed || 0, lastSeen: Date.now() });
    }
  }

  broadcast(z, u, v, speed) {
    if (!this.joined) return;
    const now = Date.now();
    if (now - this._lastSend < 100) return;
    this._lastSend = now;
    this._send({
      topic: this.topic, event: 'broadcast', ref: String(++this.ref),
      payload: { type: 'broadcast', event: 'pos', payload: { id: this.id, name: this.name, z, u, v, speed } },
    });
  }

  disconnect() {
    if (this._hb) clearInterval(this._hb);
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
  }
}

// ---- Flight state + physics (mirrors src/ship.js's update() exactly) -----

function freshState() {
  return {
    z: 0, u: 0, v: CFG.wallHeight * 0.42, velU: 0, velV: 0,
    boost: CFG.boostMax, speed: CFG.startSpeed, topSpeed: CFG.startSpeed,
    alive: true, startedAt: Date.now(),
  };
}

// One physics tick: apply the brain's steering + boost intent, integrate with
// the same acceleration/damping/clamp constants as the player's ship, and
// report a crash if one happens.
//
// Note: ship.js negates its lateral input (`velU += -ax * accelLat * dt`)
// purely to map a human's "steer right" key/mouse convention onto the world's
// +u axis for the chase camera. `ax`/`ay` here are a direct control signal
// from decide() (positive ax = push toward +u), not a human input axis, so
// there is no screen-mapping sign flip to reproduce -- the acceleration,
// damping and velocity clamps are otherwise identical to ship.js.
function step(s, dt, ax, ay, wantBoost) {
  // Boost economy -- identical formulas to main.js's player economy.
  if (wantBoost && s.boost > 0) s.boost = Math.max(0, s.boost - CFG.boostDrain * dt);
  else s.boost = Math.min(CFG.boostMax, s.boost + CFG.boostRegen * dt);

  const baseSpeed = Math.min(
    CFG.maxSpeed - CFG.boostSpeed,
    CFG.startSpeed + Math.sqrt(Math.max(0, s.z)) * CFG.speedRamp
  );
  s.speed = clamp(baseSpeed + (wantBoost && s.boost > 0 ? CFG.boostSpeed : 0), 0, CFG.maxSpeed);
  s.topSpeed = Math.max(s.topSpeed, s.speed);
  s.z += s.speed * dt;

  s.velU += ax * CFG.accelLat * dt;
  s.velU -= s.velU * CFG.dampLat * dt;
  s.velU = clamp(s.velU, -CFG.maxLatVel, CFG.maxLatVel);
  s.u += s.velU * dt;

  s.velV += ay * CFG.accelVert * dt;
  s.velV -= s.velV * CFG.dampVert * dt;
  s.velV = clamp(s.velV, -CFG.maxVertVel, CFG.maxVertVel);
  s.v += s.velV * dt;

  const hw = halfWidth(s.z);
  const limU = hw - CFG.shipRadius;
  const minV = CFG.floorClear;
  const maxV = CFG.wallHeight - CFG.ceilClear;
  if (s.v > maxV) { s.v = maxV; if (s.velV > 0) s.velV = 0; }
  if (s.v <= minV || Math.abs(s.u) >= limU) { s.alive = false; return true; }
  return false;
}

// ---- Main loop -------------------------------------------------------

async function main() {
  const decide = await loadBrain();
  const id = 'ai_' + Math.random().toString(36).slice(2, 10);
  const link = (!DRY_RUN) ? new Link(ROOM, id, NAME) : null;
  if (link) link.connect();

  console.log(`RIFTBREAK VELOCITY -- AI Pilot "${NAME}" ${DRY_RUN ? '(dry run, no network)' : `joining room ${ROOM}`}`);

  const dt = TICK_MS / 1000;
  let timer = null;

  process.on('SIGINT', () => { if (timer) clearInterval(timer); if (link) link.disconnect(); process.exit(0); });

  runOnce();

  function runOnce() {
    let s = freshState();
    let lastPrint = 0;

    let ticking = false; // guards against overlapping ticks if decide() is slow (e.g. an LLM call)
    timer = setInterval(async () => {
      if (ticking) return;
      ticking = true;
      const state = {
        z: s.z, u: s.u, v: s.v, velU: s.velU, velV: s.velV,
        speed: s.speed, boostFraction: s.boost / CFG.boostMax,
        halfWidthNow: halfWidth(s.z), peers: link ? link.peers : new Map(),
      };

      let decision;
      try {
        decision = (await decide(state)) || {};
      } catch (err) {
        console.error('Brain error, holding course:', err.message);
        decision = {};
      }
      ticking = false;
      const ax = clamp(Number(decision.ax) || 0, -1, 1);
      const ay = clamp(Number(decision.ay) || 0, -1, 1);
      const wantBoost = !!decision.boost;

      const crashed = step(s, dt, ax, ay, wantBoost);
      if (link) link.broadcast(s.z, s.u, s.v, s.speed);

      const now = Date.now();
      if (now - lastPrint > 1000) {
        lastPrint = now;
        console.log(
          `dist=${Math.floor(s.z)}m  speed=${Math.round(s.speed)}  boost=${Math.round(s.boost)}%` +
          (link ? `  peers=${link.peers.size}` : '')
        );
      }

      if (crashed || s.z >= CFG.raceFinish) {
        clearInterval(timer);
        const finished = s.z >= CFG.raceFinish;
        console.log(finished
          ? `\nFINISHED -- distance=${Math.floor(s.z)}m top_speed=${Math.round(s.topSpeed)}`
          : `\nCRASHED -- distance=${Math.floor(s.z)}m top_speed=${Math.round(s.topSpeed)}`);

        (async () => {
          if (SUBMIT) {
            const ok = await submitScore({
              name: NAME, distance: s.z, style: 0, topSpeed: s.topSpeed, gates: 0, mode: 'race',
            });
            console.log(ok ? 'Score submitted to the leaderboard.' : 'Leaderboard submit failed (offline?).');
          }
          if (RESPAWN) {
            runOnce();
          } else {
            if (link) link.disconnect();
            process.exit(0);
          }
        })();
      }
    }, TICK_MS);
  }
}

// ---- CLI plumbing ------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function printUsage() {
  console.log(`RIFTBREAK VELOCITY -- AI Pilot

Usage:
  node ai-pilot/pilot.mjs --room ABCD --name AXIOM
  node ai-pilot/pilot.mjs --dry-run
  node ai-pilot/pilot.mjs --room ABCD --brain ./my-brain.mjs --submit

Options:
  --room CODE     Live Race room code to join (from HOST/JOIN in the game).
  --name NAME     Display name shown to other racers (default AXIOM).
  --brain PATH    Path to a module exporting decide(state) -> {ax, ay, boost}.
  --bias N        Lateral personality for the default brain, -1..1 (default random).
  --tick MS       Simulation tick in ms (default 50, i.e. 20 Hz).
  --submit        Submit the run to the global leaderboard when it ends.
  --respawn       Automatically start a new run after a crash/finish.
  --dry-run       Skip the network entirely; just print telemetry.
  --help          Show this message.
`);
}

main().catch((err) => { console.error(err); process.exit(1); });

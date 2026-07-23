// Live multiplayer "arena" over Supabase Realtime broadcast (raw WebSocket,
// Phoenix channel protocol -- no SDK to vendor). A room is just a channel named
// by its code, so HOST/JOIN with the same code land in the same race and see
// each other as ghost craft; different codes never see each other. There is no
// matchmaking or authoritative server -- it's a shared arena per room code, and
// everything is wrapped so a blocked socket just means "no rivals online".

import { SUPA_URL, SUPA_KEY } from './leaderboard.js';
import { Ghost, colorForId } from './ghost.js';

const WS_URL = SUPA_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + SUPA_KEY + '&vsn=1.0.0';
const SEND_INTERVAL = 100;   // ms between position broadcasts (~10 Hz)
const STALE_MS = 3500;       // drop players we haven't heard from in this long

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.ws = null;
    this.joined = false;
    this.ref = 0;
    this.id = Math.random().toString(36).slice(2, 10);
    this.name = 'PLAYER';
    this.topic = 'realtime:csr-arena';
    this.players = new Map(); // id -> { name, z, u, v, speed, lastSeen, ghost }
    this._hb = null;
    this._lastSend = 0;
  }

  // `code` scopes this connection to a specific room (host/join share a code).
  connect(name, code) {
    this.name = name || 'PLAYER';
    this.topic = 'realtime:csr-room-' + (code ? String(code).toUpperCase() : 'default');
    if (this.ws) return;
    try {
      this.ws = new WebSocket(WS_URL);
    } catch (e) { this.ws = null; return; }
    this.ws.onopen = () => this._join();
    this.ws.onmessage = (e) => this._onMessage(e);
    this.ws.onerror = () => {};
    this.ws.onclose = () => {
      this.joined = false;
      if (this._hb) { clearInterval(this._hb); this._hb = null; }
    };
  }

  _send(obj) {
    try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); } catch (e) {}
  }

  _join() {
    this._send({
      topic: this.topic, event: 'phx_join', ref: String(++this.ref),
      payload: { config: { broadcast: { self: false, ack: false }, presence: { key: this.id }, private: false } },
    });
    // Authorise the socket (harmless for a public channel).
    this._send({ topic: this.topic, event: 'access_token', ref: String(++this.ref), payload: { access_token: SUPA_KEY } });
    if (this._hb) clearInterval(this._hb);
    this._hb = setInterval(() => this._send({ topic: 'phoenix', event: 'heartbeat', ref: String(++this.ref), payload: {} }), 25000);
  }

  _onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.topic === this.topic && msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
      this.joined = true;
      return;
    }
    if (msg.topic !== this.topic) return;   // ignore any stray cross-room traffic
    if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'pos') {
      const p = msg.payload.payload;
      if (!p || !p.id || p.id === this.id) return;
      let e2 = this.players.get(p.id);
      if (!e2) {
        e2 = { ghost: new Ghost(this.scene, colorForId(p.id), p.name || 'RIVAL') };
        this.players.set(p.id, e2);
      }
      e2.name = p.name; e2.z = +p.z || 0; e2.u = +p.u || 0; e2.v = +p.v || 0;
      e2.speed = +p.speed || 0; e2.lastSeen = performance.now();
      // Lobby/race phase + this peer's lobby deadline (epoch ms), used to keep
      // the whole room on ONE shared countdown. Missing ph = older client;
      // treat as racing so it stays visible.
      e2.phase = p.ph === 'lobby' ? 'lobby' : 'race';
      e2.deadline = +p.dl || 0;
      e2.ghost.setName(p.name || 'RIVAL');
      return;
    }
    // Someone in the room launched the race -- everyone still waiting starts NOW.
    if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'go') {
      const p = msg.payload.payload;
      if (p && p.id === this.id) return;
      if (this.onGo) this.onGo();
    }
  }

  // Broadcast the local ship state (rate-limited internally). Also doubles as
  // the lobby "I'm here" heartbeat -- call it with zeros while waiting.
  // `phase` is 'lobby' or 'race'; `deadline` (epoch ms) is only meaningful in
  // the lobby and lets the room converge on the earliest shared countdown.
  broadcast(z, u, v, speed, phase = 'race', deadline = 0) {
    if (!this.joined) return;
    const now = performance.now();
    if (now - this._lastSend < SEND_INTERVAL) return;
    this._lastSend = now;
    this._send({
      topic: this.topic, event: 'broadcast', ref: String(++this.ref),
      payload: { type: 'broadcast', event: 'pos', payload: { id: this.id, name: this.name, z, u, v, speed, ph: phase, dl: deadline } },
    });
  }

  // Announce "the race starts now" to everyone still in the lobby. Not
  // throttled -- it's a one-shot control message.
  sendGo() {
    this._send({
      topic: this.topic, event: 'broadcast', ref: String(++this.ref),
      payload: { type: 'broadcast', event: 'go', payload: { id: this.id } },
    });
  }

  // The earliest lobby deadline among peers still waiting (0 if none).
  minLobbyDeadline() {
    let min = 0;
    for (const p of this.players.values()) {
      if (p.phase === 'lobby' && p.deadline > 0 && (min === 0 || p.deadline < min)) min = p.deadline;
    }
    return min;
  }

  // True if anyone in the room is already racing.
  raceInProgress() {
    for (const p of this.players.values()) if (p.phase === 'race') return true;
    return false;
  }

  // Position/prune remote ghosts around the player. Peers still in the lobby
  // aren't racing yet, so their ghosts stay hidden.
  update(playerZ) {
    const now = performance.now();
    for (const [id, p] of this.players) {
      if (now - p.lastSeen > STALE_MS) {
        p.ghost.dispose();
        this.players.delete(id);
        continue;
      }
      const near = p.phase !== 'lobby' && p.z > playerZ - 140 && p.z < playerZ + 500;
      p.ghost.setVisible(near);
      if (near) p.ghost.place(p.z, p.u, p.v);
    }
  }

  // Distances of live rivals, for race-position ranking. Peers still in the
  // lobby aren't part of the running race yet.
  positions() {
    const out = [];
    for (const p of this.players.values()) if (p.phase !== 'lobby') out.push(p.z);
    return out;
  }

  count() { return this.players.size; }
  isLive() { return this.joined; }

  disconnect() {
    if (this._hb) { clearInterval(this._hb); this._hb = null; }
    for (const p of this.players.values()) p.ghost.dispose();
    this.players.clear();
    this.joined = false;
    if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
  }
}

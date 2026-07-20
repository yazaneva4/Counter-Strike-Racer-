// Live multiplayer "arena" over Supabase Realtime broadcast (raw WebSocket,
// Phoenix channel protocol -- no SDK to vendor). Everyone in Race mode joins one
// public channel, broadcasts their ship state ~10x/sec, and sees everyone else
// as ghost craft. There is no matchmaking or authoritative server: it's a shared
// arena. All of it is wrapped so a blocked socket just means "no rivals online".

import { SUPA_URL, SUPA_KEY } from './leaderboard.js';
import { Ghost, colorForId } from './ghost.js';

const WS_URL = SUPA_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + SUPA_KEY + '&vsn=1.0.0';
const TOPIC = 'realtime:csr-arena';
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
    this.players = new Map(); // id -> { name, z, u, v, speed, lastSeen, ghost }
    this._hb = null;
    this._lastSend = 0;
  }

  connect(name) {
    this.name = name || 'PLAYER';
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
      topic: TOPIC, event: 'phx_join', ref: String(++this.ref),
      payload: { config: { broadcast: { self: false, ack: false }, presence: { key: this.id }, private: false } },
    });
    // Authorise the socket (harmless for a public channel).
    this._send({ topic: TOPIC, event: 'access_token', ref: String(++this.ref), payload: { access_token: SUPA_KEY } });
    if (this._hb) clearInterval(this._hb);
    this._hb = setInterval(() => this._send({ topic: 'phoenix', event: 'heartbeat', ref: String(++this.ref), payload: {} }), 25000);
  }

  _onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.topic === TOPIC && msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
      this.joined = true;
      return;
    }
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
      e2.ghost.setName(p.name || 'RIVAL');
    }
  }

  // Broadcast the local ship state (rate-limited internally).
  broadcast(z, u, v, speed) {
    if (!this.joined) return;
    const now = performance.now();
    if (now - this._lastSend < SEND_INTERVAL) return;
    this._lastSend = now;
    this._send({
      topic: TOPIC, event: 'broadcast', ref: String(++this.ref),
      payload: { type: 'broadcast', event: 'pos', payload: { id: this.id, name: this.name, z, u, v, speed } },
    });
  }

  // Position/prune remote ghosts around the player.
  update(playerZ) {
    const now = performance.now();
    for (const [id, p] of this.players) {
      if (now - p.lastSeen > STALE_MS) {
        p.ghost.dispose();
        this.players.delete(id);
        continue;
      }
      const near = p.z > playerZ - 140 && p.z < playerZ + 500;
      p.ghost.setVisible(near);
      if (near) p.ghost.place(p.z, p.u, p.v);
    }
  }

  // Distances of live rivals, for race-position ranking.
  positions() {
    const out = [];
    for (const p of this.players.values()) out.push(p.z);
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

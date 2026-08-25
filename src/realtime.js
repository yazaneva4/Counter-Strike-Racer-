// Live multiplayer arena over Supabase Realtime broadcast.
// Every racer shown here is a real connected peer: no bots and no synthetic rivals.

import { SUPA_URL, SUPA_KEY } from './leaderboard.js';
import { Ghost, colorForId } from './ghost.js';

const WS_URL = SUPA_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + SUPA_KEY + '&vsn=1.0.0';
const SEND_INTERVAL = 100;
const STALE_MS = 3500;
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeLobbyCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function freezeLobbyClock() {
  if (window.__csrLobbyClockFrozen) return;
  window.__csrOriginalDateNow = Date.now;
  const fixed = Date.now();
  Date.now = () => fixed;
  window.__csrLobbyClockFrozen = true;
}

function restoreLobbyClock() {
  if (!window.__csrLobbyClockFrozen) return;
  Date.now = window.__csrOriginalDateNow || Date.now;
  window.__csrLobbyClockFrozen = false;
  window.__csrOriginalDateNow = null;
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.ws = null;
    this.joined = false;
    this.ref = 0;
    this.id = Math.random().toString(36).slice(2, 10);
    this.name = 'PLAYER';
    this.topic = 'realtime:csr-arena';
    this.roomCode = '';
    this.hosting = false;
    this.players = new Map();
    this._hb = null;
    this._lastSend = 0;
    this._pendingPresence = new Set();
  }

  connect(name, code) {
    this.name = name || 'PLAYER';
    this.hosting = Boolean(window.__csrHostingLobby);
    const requested = this.hosting && window.__csrHostLobbyCode
      ? String(window.__csrHostLobbyCode).toUpperCase()
      : String(code || '').toUpperCase();
    this.roomCode = requested || makeLobbyCode();
    this.topic = 'realtime:csr-room-' + this.roomCode;

    // The old client has a 60-second fallback deadline in main.js. Freeze the
    // lobby clock so a race can ONLY begin when the four real-player room is full.
    freezeLobbyClock();

    if (this.ws) return;
    try { this.ws = new WebSocket(WS_URL); }
    catch (e) { this.ws = null; return; }

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
      topic: this.topic,
      event: 'phx_join',
      ref: String(++this.ref),
      payload: { config: { broadcast: { self: false, ack: false }, presence: { key: this.id }, private: false } },
    });
    this._send({ topic: this.topic, event: 'access_token', ref: String(++this.ref), payload: { access_token: SUPA_KEY } });
    this._send({
      topic: this.topic,
      event: 'presence',
      ref: String(++this.ref),
      payload: { event: 'track', payload: { id: this.id, name: this.name } },
    });
    if (this._hb) clearInterval(this._hb);
    this._hb = setInterval(() => this._send({ topic: 'phoenix', event: 'heartbeat', ref: String(++this.ref), payload: {} }), 25000);
  }

  _onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.topic !== this.topic) return;

    if (msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
      this.joined = true;
      return;
    }

    if (msg.event === 'presence_state' && msg.payload && msg.payload.presences) {
      const keys = Object.keys(msg.payload.presences);
      for (const key of keys) if (key !== this.id) this._pendingPresence.add(key);
      // A host is never allowed to take over an occupied code. It gets a new
      // room instead, while a JOIN operation intentionally enters the existing room.
      if (this.hosting && this._pendingPresence.size > 0) this._replaceOccupiedHostRoom();
      return;
    }

    if (msg.event === 'presence_diff' && msg.payload) {
      const joins = msg.payload.joins || {};
      const leaves = msg.payload.leaves || {};
      for (const key of Object.keys(joins)) if (key !== this.id) this._pendingPresence.add(key);
      for (const key of Object.keys(leaves)) this._pendingPresence.delete(key);
      return;
    }

    if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'pos') {
      const p = msg.payload.payload;
      if (!p || !p.id || p.id === this.id) return;
      let rival = this.players.get(p.id);
      if (!rival) {
        rival = { ghost: new Ghost(this.scene, colorForId(p.id), p.name || 'RIVAL') };
        this.players.set(p.id, rival);
      }
      rival.name = p.name || 'RIVAL';
      rival.z = +p.z || 0;
      rival.u = +p.u || 0;
      rival.v = +p.v || 0;
      rival.speed = +p.speed || 0;
      rival.lastSeen = performance.now();
      rival.phase = p.ph === 'lobby' ? 'lobby' : 'race';
      rival.ghost.setName(rival.name);
      return;
    }

    if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'go') {
      const p = msg.payload.payload;
      if (p && p.id !== this.id && this.onGo) this.onGo();
    }
  }

  _replaceOccupiedHostRoom() {
    if (!this.hosting || !this.ws) return;
    const oldCode = this.roomCode;
    this.hosting = false;
    try { this.ws.close(); } catch (e) {}
    this.ws = null;
    this.joined = false;
    this._pendingPresence.clear();

    let nextCode = makeLobbyCode();
    while (nextCode === oldCode) nextCode = makeLobbyCode();
    this.roomCode = nextCode;
    this.topic = 'realtime:csr-room-' + nextCode;
    window.__csrActualLobbyCode = nextCode;
    const codeEl = document.getElementById('lobbyCode');
    if (codeEl) codeEl.textContent = nextCode;
    setTimeout(() => this.connect(this.name, nextCode), 0);
  }

  broadcast(z, u, v, speed, phase = 'race', deadline = 0) {
    if (!this.joined) return;
    const now = performance.now();
    if (now - this._lastSend < SEND_INTERVAL) return;
    this._lastSend = now;
    this._send({
      topic: this.topic,
      event: 'broadcast',
      ref: String(++this.ref),
      payload: { type: 'broadcast', event: 'pos', payload: { id: this.id, name: this.name, z, u, v, speed, ph: phase, dl: deadline } },
    });
  }

  sendGo() {
    this._send({ topic: this.topic, event: 'broadcast', ref: String(++this.ref), payload: { type: 'broadcast', event: 'go', payload: { id: this.id } } });
  }

  // main.js still asks for a shared deadline; returning zero prevents it from
  // replacing the frozen lobby clock with another deadline.
  minLobbyDeadline() { return 0; }

  raceInProgress() {
    for (const p of this.players.values()) if (p.phase === 'race') return true;
    return false;
  }

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

    // The lobby is full when three remote real players plus this client are present.
    // Restore normal time immediately before main.js launches the race.
    if (this.players.size >= MAX_PLAYERS - 1) restoreLobbyClock();
  }

  positions() {
    const out = [];
    for (const p of this.players.values()) if (p.phase !== 'lobby') out.push(p.z);
    return out;
  }

  count() { return Math.min(this.players.size, MAX_PLAYERS - 1); }
  isLive() { return this.joined; }

  disconnect() {
    if (this._hb) { clearInterval(this._hb); this._hb = null; }
    for (const p of this.players.values()) p.ghost.dispose();
    this.players.clear();
    this.joined = false;
    this._pendingPresence.clear();
    restoreLobbyClock();
    if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
    window.__csrHostingLobby = false;
    window.__csrHostLobbyCode = '';
  }
}

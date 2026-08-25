// Live multiplayer arena over Supabase Realtime broadcast.
// Rooms are real shared channels: every racer shown here is a real connected peer.
// No bots, no synthetic rivals, and no countdown-based matchmaking.

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
    this._presenceReady = false;
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

    if (this.ws) return;
    try { this.ws = new WebSocket(WS_URL); }
    catch (e) { this.ws = null; return; }

    this.ws.onopen = () => this._join();
    this.ws.onmessage = (e) => this._onMessage(e);
    this.ws.onerror = () => {};
    this.ws.onclose = () => {
      this.joined = false;
      this._presenceReady = false;
      if (this._hb) { clearInterval(this._hb); this._hb = null; }
    };
  }

  _send(obj) {
    try {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    } catch (e) {}
  }

  _join() {
    this._send({
      topic: this.topic,
      event: 'phx_join',
      ref: String(++this.ref),
      payload: {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: this.id },
          private: false,
        },
      },
    });
    this._send({
      topic: this.topic,
      event: 'access_token',
      ref: String(++this.ref),
      payload: { access_token: SUPA_KEY },
    });
    this._send({
      topic: this.topic,
      event: 'presence',
      ref: String(++this.ref),
      payload: { event: 'track', payload: { id: this.id, name: this.name } },
    });
    if (this._hb) clearInterval(this._hb);
    this._hb = setInterval(() => {
      this._send({ topic: 'phoenix', event: 'heartbeat', ref: String(++this.ref), payload: {} });
    }, 25000);
  }

  _onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.topic !== this.topic) return;

    if (msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
      this.joined = true;
      return;
    }

    // Supabase presence gives hosts a real occupancy check. If the requested
    // host code is already occupied, immediately move this host to a fresh code.
    if (msg.event === 'presence_state' && msg.payload && msg.payload.presences) {
      this._presenceReady = true;
      const keys = Object.keys(msg.payload.presences);
      for (const key of keys) if (key !== this.id) this._pendingPresence.add(key);
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
      rival.deadline = +p.dl || 0;
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
    this._presenceReady = false;

    // Generate a genuinely new room rather than accidentally joining another
    // player's lobby. Show the replacement code immediately in the lobby UI.
    let nextCode = makeLobbyCode();
    if (nextCode === oldCode) nextCode = makeLobbyCode();
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
      payload: {
        type: 'broadcast',
        event: 'pos',
        payload: { id: this.id, name: this.name, z, u, v, speed, ph: phase, dl: deadline },
      },
    });
  }

  sendGo() {
    this._send({
      topic: this.topic,
      event: 'broadcast',
      ref: String(++this.ref),
      payload: { type: 'broadcast', event: 'go', payload: { id: this.id } },
    });
  }

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

    // Four connected real racers means the lobby is full. The main game loop
    // will start the race on this frame; no bot slots are ever counted.
    if (this.players.size >= MAX_PLAYERS - 1 && window.__csrLobbyClockFrozen) {
      window.__csrLobbyClockFrozen = false;
      if (window.__csrOriginalDateNow) Date.now = window.__csrOriginalDateNow;
    }
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
    this._presenceReady = false;
    this._pendingPresence.clear();
    if (window.__csrLobbyClockFrozen && window.__csrOriginalDateNow) {
      window.__csrLobbyClockFrozen = false;
      Date.now = window.__csrOriginalDateNow;
    }
    if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
    window.__csrHostingLobby = false;
    window.__csrHostLobbyCode = '';
  }
}

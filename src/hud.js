// HUD: thin controller over the DOM overlay declared in index.html.
export class HUD {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.distance = this.$('distance');
    this.speed = this.$('speed');
    this.style = this.$('style');
    this.mult = this.$('mult');
    this.chain = this.$('chain');
    this.boostBar = this.$('boostBar');
    this.dangerBar = this.$('dangerBar');
    this.dangerWrap = this.$('dangerWrap');
    this.overlay = this.$('overlay');
    this.overlayTitle = this.$('overlayTitle');
    this.overlaySub = this.$('overlaySub');
    this.overlayStats = this.$('overlayStats');
    this.overlayHint = this.$('overlayHint');
    this.popups = this.$('popups');
    this.muteIndicator = this.$('muteIndicator');
    this.camIndicator = this.$('camIndicator');
    this.hudRoot = this.$('hud');

    this.menuName = this.$('menuName');
    this.btnSolo = this.$('btnSolo');
    this.btnLive = this.$('btnLive');
    this.submitStatus = this.$('submitStatus');
    this.leaderboard = this.$('leaderboard');
    this.raceInfo = this.$('raceInfo');
    this.modeBtns = document.querySelector('.modebtns');
    this.lbWrap = document.querySelector('.lb-wrap');

    this.liveSelect = this.$('liveSelect');
    this.btnHost = this.$('btnHost');
    this.hostCode = this.$('hostCode');
    this.joinCode = this.$('joinCode');
    this.btnJoin = this.$('btnJoin');
    this.btnLiveBack = this.$('btnLiveBack');

    this.lobbyPanel = this.$('lobbyPanel');
    this.lobbyCode = this.$('lobbyCode');
    this.lobbyCountNum = this.$('lobbyCountNum');
    this.lobbyTarget = this.$('lobbyTarget');
    this.lobbyTimer = this.$('lobbyTimer');
    this.btnLeaveLobby = this.$('btnLeaveLobby');
  }

  setCamMode(mode) {
    const label = { third: '3RD', first: '1ST' }[mode] || '3RD';
    if (this.camIndicator) this.camIndicator.textContent = 'CAM · ' + label;
  }

  setName(name) { if (this.menuName) this.menuName.value = name || ''; }
  getNameValue() { return this.menuName ? this.menuName.value.trim() : ''; }

  bindMenu({ onName, onCommit, onSolo, onHost, onJoin, onLeaveLobby }) {
    if (this.menuName) {
      this.menuName.addEventListener('input', () => onName && onName(this.menuName.value));
      this.menuName.addEventListener('change', () => onCommit && onCommit(this.menuName.value));
      this.menuName.addEventListener('click', (e) => e.stopPropagation());
      this.menuName.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.menuName.blur(); });
    }
    const go = (fn) => (e) => { e.stopPropagation(); if (this.menuName) this.menuName.blur(); fn && fn(); };
    if (this.btnSolo) this.btnSolo.addEventListener('click', go(onSolo));
    if (this.btnLive) this.btnLive.addEventListener('click', (e) => { e.stopPropagation(); this.showLiveSelect(); });
    if (this.btnLiveBack) this.btnLiveBack.addEventListener('click', (e) => { e.stopPropagation(); this.hideLiveSelect(); });

    if (this.btnHost) this.btnHost.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.menuName) this.menuName.blur();
      const requested = (this.hostCode ? this.hostCode.value : '').trim()
        .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      if (!requested) {
        this.hostCode?.focus();
        return;
      }
      window.__csrHostingLobby = true;
      window.__csrHostLobbyCode = requested;
      onHost && onHost();
    });

    const doJoin = () => {
      window.__csrHostingLobby = false;
      window.__csrHostLobbyCode = '';
      onJoin && onJoin(this.joinCode ? this.joinCode.value : '');
    };
    if (this.btnJoin) this.btnJoin.addEventListener('click', (e) => { e.stopPropagation(); if (this.menuName) this.menuName.blur(); doJoin(); });
    if (this.joinCode) {
      this.joinCode.addEventListener('click', (e) => e.stopPropagation());
      this.joinCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doJoin(); } });
    }
    if (this.hostCode) {
      this.hostCode.addEventListener('click', (e) => e.stopPropagation());
      this.hostCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.btnHost?.click(); } });
    }
    if (this.btnLeaveLobby) this.btnLeaveLobby.addEventListener('click', go(onLeaveLobby));
  }

  showLiveSelect() {
    if (this.modeBtns) this.modeBtns.style.display = 'none';
    if (this.submitStatus) this.submitStatus.style.display = 'none';
    if (this.lbWrap) this.lbWrap.style.display = 'none';
    if (this.liveSelect) this.liveSelect.style.display = 'flex';
    if (this.hostCode) this.hostCode.value = '';
    if (this.joinCode) this.joinCode.value = '';
  }
  hideLiveSelect() {
    if (this.liveSelect) this.liveSelect.style.display = 'none';
    if (this.modeBtns) this.modeBtns.style.display = '';
    if (this.submitStatus) this.submitStatus.style.display = '';
    if (this.lbWrap) this.lbWrap.style.display = '';
  }

  showLobby(code) {
    this.hideLiveSelect();
    this.overlay.className = 'show lobby';
    if (this.menuName && this.menuName.closest('.namerow')) this.menuName.closest('.namerow').style.display = 'none';
    if (this.modeBtns) this.modeBtns.style.display = 'none';
    if (this.submitStatus) this.submitStatus.style.display = 'none';
    if (this.lbWrap) this.lbWrap.style.display = 'none';
    if (this.overlayHint) this.overlayHint.style.display = 'none';
    if (this.lobbyCode) this.lobbyCode.textContent = code || '';
    if (this.lobbyPanel) this.lobbyPanel.style.display = 'flex';
    if (this.lobbyTimer) this.lobbyTimer.parentElement?.remove();
  }
  hideLobby() {
    if (this.lobbyPanel) this.lobbyPanel.style.display = 'none';
    const nameRow = this.menuName && this.menuName.closest('.namerow');
    if (nameRow) nameRow.style.display = '';
    if (this.modeBtns) this.modeBtns.style.display = '';
    if (this.submitStatus) this.submitStatus.style.display = '';
    if (this.lbWrap) this.lbWrap.style.display = '';
    if (this.overlayHint) this.overlayHint.style.display = '';
  }
  updateLobby(count, target) {
    if (this.lobbyCountNum) this.lobbyCountNum.textContent = String(count);
    if (this.lobbyTarget) this.lobbyTarget.textContent = String(target);
  }

  setRace(rank, field, live, toFinish, time) {
    if (!this.raceInfo) return;
    const liveTxt = live > 0 ? ` · <span class="live">${live} LIVE</span>` : '';
    const l2 = (toFinish != null)
      ? `<div class="rl2">${Math.ceil(toFinish).toLocaleString()} m TO FINISH · ${fmtTime(time)}</div>`
      : '';
    this.raceInfo.innerHTML = `<div class="rl1"><span class="rank">P${rank}</span><span class="field">/ ${field}</span>${liveTxt}</div>${l2}`;
    this.raceInfo.classList.add('show');
  }
  hideRace() { if (this.raceInfo) this.raceInfo.classList.remove('show'); }

  setSubmitStatus(text) { if (this.submitStatus) this.submitStatus.textContent = text || ''; }
  renderLeaderboard(scores, myId) {
    if (!this.leaderboard) return;
    if (!scores || scores.length === 0) {
      this.leaderboard.innerHTML = '<div class="lb-empty">No scores yet — set the first!</div>';
      return;
    }
    this.leaderboard.innerHTML = scores.map((s, i) => {
      const isMe = myId && s.player_id === myId;
      const mode = s.mode === 'race' ? '<span class="lb-mode">RACE</span>' : '';
      return `<div class="lb-row${isMe ? ' me' : ''}"><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(s.name)}</span><span class="lb-dist">${Number(s.distance || 0).toLocaleString()}<small>m</small></span>${mode}</div>`;
    }).join('');
  }

  setStats(s) {
    this.distance.textContent = Math.floor(s.distance).toLocaleString();
    this.speed.textContent = Math.round(s.speed);
    this.style.textContent = Math.floor(s.style).toLocaleString();
    this.mult.textContent = 'x' + s.multiplier;
    this.chain.textContent = s.chain > 0 ? s.chain + ' chain' : '';
    this.boostBar.style.width = Math.max(0, Math.min(100, s.boost01 * 100)) + '%';
    const d = Math.max(0, Math.min(1, s.danger));
    this.dangerBar.style.width = d * 100 + '%';
    this.dangerWrap.classList.toggle('critical', d > 0.6);
  }

  popup(text, color = '#00eaff') {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.color = color;
    el.style.textShadow = `0 0 12px ${color}`;
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  showMenu(best) {
    this.hideLobby();
    this.hideLiveSelect();
    this.overlay.className = 'show menu';
    this.overlayTitle.innerHTML = 'COUNTER STRIKE <span class="accent">RACER</span>';
    this.overlaySub.textContent = 'Neon Canyon Hyperracer';
    this.overlayStats.innerHTML = best > 0 ? `<div class="best">YOUR BEST&nbsp;&nbsp;${best.toLocaleString()} m</div>` : '';
    if (this.submitStatus) this.submitStatus.textContent = '';
    this.overlayHint.innerHTML = `<div class="controls ctrl-desktop"><span><b>← →</b> / <b>A D</b> &nbsp;steer</span><span><b>↑ ↓</b> / <b>W S</b> &nbsp;climb / dive</span><span><b>SPACE</b> / <b>SHIFT</b> &nbsp;boost</span><span><b>SHIFT+TAB</b> / <b>right-click</b> &nbsp;camera</span></div><div class="controls ctrl-touch"><span><b>Drag</b> anywhere &nbsp;to steer &amp; fly</span><span><b>Hold</b> still &nbsp;or the BOOST pad to accelerate</span><span><b>Double-tap</b> &nbsp;to switch camera view</span></div><div class="launch">Pick <b>SOLO</b> or <b>LIVE RACE</b><span class="desktop-only"> — or <b>SPACE</b> for Solo</span></div>`;
    this.hudRoot.classList.remove('active');
  }

  showGameOver(r) {
    this.hideLobby();
    this.hideLiveSelect();
    this.overlay.className = 'show over' + (r.finished ? ' finish' : '');
    let firstCell = `<div><span>STYLE</span><b>${Math.floor(r.style).toLocaleString()}</b></div>`;
    if (r.finished) {
      this.overlayTitle.innerHTML = r.position === 1 ? 'RACE <span class="accent">WON</span>' : 'RACE FINISHED';
      this.overlaySub.textContent = `P${r.position} of ${r.field} · ${fmtTime(r.time)}`;
      firstCell = `<div><span>TIME</span><b>${fmtTime(r.time)}</b></div>`;
    } else if (r.mode === 'race') {
      this.overlayTitle.innerHTML = r.caught ? 'CONSUMED BY THE RIFT' : 'CRASHED OUT';
      this.overlaySub.textContent = `You were P${r.rank} of ${r.field}`;
    } else {
      this.overlayTitle.innerHTML = r.caught ? 'CONSUMED BY THE RIFT' : 'RUN OVER';
      this.overlaySub.textContent = r.caught ? 'the collapse caught you' : 'one crash is all it takes';
    }
    this.overlayStats.innerHTML = `<div class="statgrid"><div><span>DISTANCE</span><b>${Math.floor(r.distance).toLocaleString()} m</b></div>${firstCell}<div><span>TOP SPEED</span><b>${Math.round(r.topSpeed)}</b></div><div><span>GATES</span><b>${r.gates}</b></div></div>${r.newBest ? '<div class="best newbest">NEW PERSONAL BEST!</div>' : `<div class="best">YOUR BEST&nbsp;&nbsp;${r.best.toLocaleString()} m</div>`}`;
    this.overlayHint.innerHTML = '<div class="launch"><span class="desktop-only">Press <b>SPACE</b> to fly again, or pick a mode</span><span class="touch-only">Tap a mode to fly again</span></div>';
    this.hudRoot.classList.remove('active');
  }

  hideOverlay() { this.overlay.className = ''; this.hudRoot.classList.add('active'); }

  setMuted(m) {
    this.muteIndicator.classList.toggle('muted', m);
    this.muteIndicator.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
    const icon = this.muteIndicator.querySelector('.mute-icon');
    const txt = this.muteIndicator.querySelector('.mute-txt');
    if (icon) icon.textContent = m ? '\u{1F507}' : '\u{1F50A}';
    if (txt) txt.textContent = m ? 'MUTED' : 'SOUND';
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

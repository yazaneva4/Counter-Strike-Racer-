// HUD: thin controller over the DOM overlay declared in index.html. Keeps all
// text/format logic in one place so the render loop just pushes numbers in.

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

    // Menu / leaderboard / race chrome.
    this.menuName = this.$('menuName');
    this.btnSolo = this.$('btnSolo');
    this.btnRace = this.$('btnRace');
    this.submitStatus = this.$('submitStatus');
    this.leaderboard = this.$('leaderboard');
    this.raceInfo = this.$('raceInfo');
    this.btnGoogle = this.$('btnGoogle');
    this.authUser = this.$('authUser');
    this.btnSignOut = this.$('btnSignOut');
  }

  setCamMode(mode) {
    const label = { third: '3RD', first: '1ST' }[mode] || '3RD';
    if (this.camIndicator) this.camIndicator.textContent = 'CAM · ' + label;
  }

  // ---- Pilot name + mode buttons ---------------------------------------
  setName(name) { if (this.menuName) this.menuName.value = name || ''; }
  getNameValue() { return this.menuName ? this.menuName.value.trim() : ''; }

  bindMenu({ onName, onSolo, onRace, onGoogle, onSignOut }) {
    if (this.menuName) {
      const push = () => onName && onName(this.menuName.value);
      this.menuName.addEventListener('input', push);
      this.menuName.addEventListener('change', push);
      this.menuName.addEventListener('click', (e) => e.stopPropagation());
    }
    const go = (fn) => (e) => { e.stopPropagation(); if (this.menuName) this.menuName.blur(); fn && fn(); };
    if (this.btnSolo) this.btnSolo.addEventListener('click', go(onSolo));
    if (this.btnRace) this.btnRace.addEventListener('click', go(onRace));
    if (this.btnGoogle) this.btnGoogle.addEventListener('click', go(onGoogle));
    if (this.btnSignOut) this.btnSignOut.addEventListener('click', go(onSignOut));
  }

  // Reflect the signed-in Google user (or guest when null).
  setUser(user) {
    const on = !!user;
    if (this.btnGoogle) this.btnGoogle.style.display = on ? 'none' : '';
    if (this.btnSignOut) this.btnSignOut.style.display = on ? '' : 'none';
    if (this.authUser) this.authUser.textContent = on ? `SIGNED IN · ${user.name}` : '';
    if (this.menuName) {
      this.menuName.disabled = on;
      this.menuName.classList.toggle('locked', on);
    }
  }

  // ---- Live race standings ---------------------------------------------
  setRace(rank, field, live, toFinish, time) {
    if (!this.raceInfo) return;
    const liveTxt = live > 0 ? ` &middot; <span class="live">${live} LIVE</span>` : '';
    const l2 = (toFinish != null)
      ? `<div class="rl2">${Math.ceil(toFinish).toLocaleString()} m TO FINISH &middot; ${fmtTime(time)}</div>`
      : '';
    this.raceInfo.innerHTML =
      `<div class="rl1"><span class="rank">P${rank}</span><span class="field">/ ${field}</span>${liveTxt}</div>${l2}`;
    this.raceInfo.classList.add('show');
  }
  hideRace() { if (this.raceInfo) this.raceInfo.classList.remove('show'); }

  // ---- Leaderboard -----------------------------------------------------
  setSubmitStatus(text) { if (this.submitStatus) this.submitStatus.textContent = text || ''; }

  renderLeaderboard(scores, highlight) {
    if (!this.leaderboard) return;
    if (!scores || scores.length === 0) {
      this.leaderboard.innerHTML = '<div class="lb-empty">No scores yet — set the first!</div>';
      return;
    }
    const hi = (highlight || '').toUpperCase();
    let seenMe = false;
    this.leaderboard.innerHTML = scores.map((s, i) => {
      const isMe = !seenMe && s.name && s.name.toUpperCase() === hi;
      if (isMe) seenMe = true;
      const mode = s.mode === 'race' ? '<span class="lb-mode">RACE</span>' : '';
      return `<div class="lb-row${isMe ? ' me' : ''}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${escapeHtml(s.name)}</span>
          <span class="lb-dist">${Number(s.distance || 0).toLocaleString()}<small>m</small></span>
          ${mode}
        </div>`;
    }).join('');
  }

  // ---- Playing HUD -----------------------------------------------------
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

  // ---- Overlays --------------------------------------------------------
  showMenu(best) {
    this.overlay.className = 'show menu';
    this.overlayTitle.innerHTML = 'COUNTER STRIKE <span class="accent">RACER</span>';
    this.overlaySub.textContent = 'Neon Canyon Hyperracer';
    this.overlayStats.innerHTML = best > 0
      ? `<div class="best">YOUR BEST&nbsp;&nbsp;${best.toLocaleString()} m</div>`
      : '';
    if (this.submitStatus) this.submitStatus.textContent = '';
    this.overlayHint.innerHTML =
      `<div class="controls ctrl-desktop">
         <span><b>&#8592; &#8594;</b> / <b>A D</b> &nbsp;steer</span>
         <span><b>&#8593; &#8595;</b> / <b>W S</b> &nbsp;climb / dive</span>
         <span><b>SPACE</b> / <b>SHIFT</b> &nbsp;boost</span>
         <span><b>SHIFT+TAB</b> / <b>right-click</b> &nbsp;camera</span>
       </div>
       <div class="controls ctrl-touch">
         <span><b>Drag</b> anywhere &nbsp;to steer &amp; fly</span>
         <span>hold the <b>BOOST</b> pad &nbsp;to accelerate</span>
         <span>tap <b>CAM</b> &nbsp;to switch view</span>
       </div>
       <div class="launch">Pick <b>SOLO</b> or <b>RACE</b><span class="desktop-only"> — or press <b>SPACE</b></span> to launch</div>`;
    this.hudRoot.classList.remove('active');
  }

  showGameOver(r) {
    this.overlay.className = 'show over' + (r.finished ? ' finish' : '');
    // First stat cell varies: a finished race shows TIME, otherwise STYLE.
    let firstCell = `<div><span>STYLE</span><b>${Math.floor(r.style).toLocaleString()}</b></div>`;
    if (r.finished) {
      this.overlayTitle.innerHTML = r.position === 1
        ? 'RACE <span class="accent">WON</span>' : 'RACE FINISHED';
      this.overlaySub.textContent = `P${r.position} of ${r.field} · ${fmtTime(r.time)}`;
      firstCell = `<div><span>TIME</span><b>${fmtTime(r.time)}</b></div>`;
    } else if (r.mode === 'race') {
      this.overlayTitle.innerHTML = r.caught ? 'CONSUMED BY THE RIFT' : 'CRASHED OUT';
      this.overlaySub.textContent = `You were P${r.rank} of ${r.field}`;
    } else {
      this.overlayTitle.innerHTML = r.caught ? 'CONSUMED BY THE RIFT' : 'RUN OVER';
      this.overlaySub.textContent = r.caught ? 'the collapse caught you' : 'one crash is all it takes';
    }
    this.overlayStats.innerHTML =
      `<div class="statgrid">
         <div><span>DISTANCE</span><b>${Math.floor(r.distance).toLocaleString()} m</b></div>
         ${firstCell}
         <div><span>TOP SPEED</span><b>${Math.round(r.topSpeed)}</b></div>
         <div><span>GATES</span><b>${r.gates}</b></div>
       </div>
       ${r.newBest ? '<div class="best newbest">NEW PERSONAL BEST!</div>' : `<div class="best">YOUR BEST&nbsp;&nbsp;${r.best.toLocaleString()} m</div>`}`;
    this.overlayHint.innerHTML =
      '<div class="launch"><span class="desktop-only">Press <b>SPACE</b> to fly again, or pick a mode</span><span class="touch-only">Tap a mode to fly again</span></div>';
    this.hudRoot.classList.remove('active');
  }

  hideOverlay() {
    this.overlay.className = '';
    this.hudRoot.classList.add('active');
  }

  setMuted(m) {
    this.muteIndicator.textContent = m ? 'MUTED (M)' : 'SOUND (M)';
    this.muteIndicator.classList.toggle('muted', m);
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

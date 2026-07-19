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
    this.hudRoot = this.$('hud');
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
    // Remove after the CSS animation completes.
    setTimeout(() => el.remove(), 1100);
  }

  showMenu(best) {
    this.overlay.className = 'show menu';
    this.overlayTitle.innerHTML = 'RIFTBREAK <span class="accent">VELOCITY</span>';
    this.overlaySub.textContent = 'Counter Strike Racer';
    this.overlayStats.innerHTML = best > 0
      ? `<div class="best">BEST&nbsp;&nbsp;${best.toLocaleString()} m</div>`
      : '';
    this.overlayHint.innerHTML =
      `<div class="controls">
         <span><b>&#8592; &#8594;</b> / <b>A D</b> &nbsp;steer</span>
         <span><b>&#8593; &#8595;</b> / <b>W S</b> &nbsp;climb / dive</span>
         <span><b>SPACE</b> / <b>SHIFT</b> &nbsp;boost</span>
         <span>or <b>move the mouse</b> to fly</span>
       </div>
       <div class="launch">Press <b>SPACE</b> or click to launch</div>`;
    this.hudRoot.classList.remove('active');
  }

  showGameOver(r) {
    this.overlay.className = 'show over';
    this.overlayTitle.innerHTML = r.caught ? 'CONSUMED BY THE RIFT' : 'RUN OVER';
    this.overlaySub.textContent = r.caught ? 'the collapse caught you' : 'one crash is all it takes';
    this.overlayStats.innerHTML =
      `<div class="statgrid">
         <div><span>DISTANCE</span><b>${Math.floor(r.distance).toLocaleString()} m</b></div>
         <div><span>STYLE</span><b>${Math.floor(r.style).toLocaleString()}</b></div>
         <div><span>TOP SPEED</span><b>${Math.round(r.topSpeed)}</b></div>
         <div><span>GATES</span><b>${r.gates}</b></div>
       </div>
       ${r.newBest ? '<div class="best newbest">NEW BEST!</div>' : `<div class="best">BEST&nbsp;&nbsp;${r.best.toLocaleString()} m</div>`}`;
    this.overlayHint.innerHTML = '<div class="launch">Press <b>SPACE</b> or click to fly again</div>';
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

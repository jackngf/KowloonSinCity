export class UI {
  constructor() {
    this.hpFill = document.getElementById('hp-fill');
    this.stamFill = document.getElementById('stam-fill');
    this.wickCount = document.getElementById('wick-count');
    this.soulCount = document.getElementById('soul-count');
    this.weaponLabel = document.getElementById('weapon-label');
    this.bossBar = document.getElementById('boss-bar');
    this.bossHp = document.getElementById('boss-hp-fill');
    this.bossPosture = document.getElementById('boss-posture-fill');
    this.prompt = document.getElementById('prompt');
    this.toast = document.getElementById('toast');
    this.death = document.getElementById('death-overlay');
    this._toastTimer = null;
  }

  updatePlayer(p) {
    this.hpFill.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    this.stamFill.style.width = `${Math.max(0, (p.stamina / p.maxStamina) * 100)}%`;
    this.wickCount.textContent = String(p.wicks);
    this.soulCount.textContent = String(p.souls);
    this.weaponLabel.textContent = `武器：${p.weaponName}`;
  }

  showBoss(show, hpRatio = 1, postureRatio = 0) {
    this.bossBar.classList.toggle('hidden', !show);
    if (show) {
      this.bossHp.style.width = `${Math.max(0, hpRatio * 100)}%`;
      this.bossPosture.style.width = `${Math.max(0, postureRatio * 100)}%`;
    }
  }

  setPrompt(text) {
    if (!text) {
      this.prompt.classList.add('hidden');
      this.prompt.textContent = '';
      return;
    }
    this.prompt.classList.remove('hidden');
    this.prompt.textContent = text;
  }

  toastMsg(msg, ms = 2800) {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  showDeath(show) {
    this.death.classList.toggle('hidden', !show);
  }
}

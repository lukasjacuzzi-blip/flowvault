import { FocusAudioEngine } from './audio.js';
import { HabitTracker } from './habits.js';
import { drawQrToCanvas } from './qr.js';
import { generateSecurePassword, CryptoVault } from './vault.js';

const THEME_KEY = 'flowvault_theme';
const SESSIONS_KEY = 'flowvault_sessions_count';

class FlowVaultApp {
  constructor() {
    this.audio = new FocusAudioEngine();
    this.habits = new HabitTracker();
    this.vault = new CryptoVault();

    this.totalSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;
    this.timerInterval = null;
    this.isRunning = false;
    this.completedSessions = Number(localStorage.getItem(SESSIONS_KEY)) || 0;

    this.qrMode = 'wifi';

    this.cacheDOM();
    this.initTheme();
    this.bindEvents();
    this.updateSessionBadge();
    this.updateTimerUI();
    this.renderHabits();
    this.updateQrCode();
    this.regeneratePassword();
  }

  cacheDOM() {
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.focusSessionBadge = document.getElementById('focusSessionBadge');
    this.navPills = document.querySelectorAll('.nav-pill');
    this.tabViews = document.querySelectorAll('.tab-view');

    // Timer & Sound
    this.presetBtns = document.querySelectorAll('.preset-row .chip-btn');
    this.timerProgressRing = document.getElementById('timerProgressRing');
    this.timerDisplay = document.getElementById('timerDisplay');
    this.timerStateLabel = document.getElementById('timerStateLabel');
    this.timerStartPauseBtn = document.getElementById('timerStartPauseBtn');
    this.timerResetBtn = document.getElementById('timerResetBtn');
    this.soundTiles = document.querySelectorAll('.sound-tile');
    this.soundStatusLabel = document.getElementById('soundStatusLabel');

    // Habits
    this.habitTodayScore = document.getElementById('habitTodayScore');
    this.habitForm = document.getElementById('habitForm');
    this.habitTitleInput = document.getElementById('habitTitleInput');
    this.habitList = document.getElementById('habitList');

    // QR & WiFi
    this.qrModeBtns = document.querySelectorAll('.qr-mode-btn');
    this.qrWifiFields = document.getElementById('qrWifiFields');
    this.qrTextFields = document.getElementById('qrTextFields');
    this.wifiSsid = document.getElementById('wifiSsid');
    this.wifiPass = document.getElementById('wifiPass');
    this.wifiEnc = document.getElementById('wifiEnc');
    this.qrPlainText = document.getElementById('qrPlainText');
    this.qrCanvas = document.getElementById('qrCanvas');
    this.downloadQrBtn = document.getElementById('downloadQrBtn');

    // Vault & Password
    this.pwStrengthBadge = document.getElementById('pwStrengthBadge');
    this.generatedPwOutput = document.getElementById('generatedPwOutput');
    this.copyPwBtn = document.getElementById('copyPwBtn');
    this.regenPwBtn = document.getElementById('regenPwBtn');
    this.pwLengthRange = document.getElementById('pwLengthRange');
    this.pwLengthVal = document.getElementById('pwLengthVal');
    this.pwUpper = document.getElementById('pwUpper');
    this.pwNumbers = document.getElementById('pwNumbers');
    this.pwSymbols = document.getElementById('pwSymbols');

    this.lockVaultBtn = document.getElementById('lockVaultBtn');
    this.vaultUnlockForm = document.getElementById('vaultUnlockForm');
    this.masterPasswordInput = document.getElementById('masterPasswordInput');
    this.vaultErrorMsg = document.getElementById('vaultErrorMsg');
    this.vaultUnlockedArea = document.getElementById('vaultUnlockedArea');
    this.vaultAddForm = document.getElementById('vaultAddForm');
    this.vaultEntryTitle = document.getElementById('vaultEntryTitle');
    this.vaultEntrySecret = document.getElementById('vaultEntrySecret');
    this.vaultEntriesList = document.getElementById('vaultEntriesList');
  }

  /* ==================== THEME & TABS ==================== */

  initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  }

  switchTab(tab) {
    this.navPills.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    this.tabViews.forEach((view) => view.classList.toggle('active', view.id === 'tab-' + tab));
    if (tab === 'qr') this.updateQrCode();
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ==================== POMODORO TIMER & AUDIO ==================== */

  updateSessionBadge() {
    this.focusSessionBadge.textContent = `${this.completedSessions} Sessions`;
  }

  updateTimerUI() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    this.timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const circumference = 603.19;
    const ratio = this.totalSeconds > 0 ? this.remainingSeconds / this.totalSeconds : 0;
    this.timerProgressRing.style.strokeDashoffset = String(circumference * (1 - ratio));
  }

  toggleTimer() {
    if (this.isRunning) {
      clearInterval(this.timerInterval);
      this.isRunning = false;
      this.timerStartPauseBtn.textContent = '▶ Fortsetzen';
      this.timerStateLabel.textContent = 'Pausiert';
      return;
    }

    this.isRunning = true;
    this.timerStartPauseBtn.textContent = '❚❚ Pause';
    this.timerStateLabel.textContent = 'Fokus läuft...';

    this.timerInterval = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        this.updateTimerUI();
      } else {
        clearInterval(this.timerInterval);
        this.isRunning = false;
        this.timerStartPauseBtn.textContent = '▶ Starten';
        this.timerStateLabel.textContent = 'Session abgeschlossen!';
        this.completedSessions++;
        localStorage.setItem(SESSIONS_KEY, String(this.completedSessions));
        this.updateSessionBadge();
        this.audio.playGong();
      }
    }, 1000);
  }

  resetTimer(minutes = null) {
    clearInterval(this.timerInterval);
    this.isRunning = false;
    if (minutes !== null) {
      this.totalSeconds = minutes * 60;
    }
    this.remainingSeconds = this.totalSeconds;
    this.timerStartPauseBtn.textContent = '▶ Starten';
    this.timerStateLabel.textContent = 'Bereit zum Start';
    this.updateTimerUI();
  }

  /* ==================== HABIT TRACKER ==================== */

  renderHabits() {
    const list = this.habits.habits;
    const doneCount = list.filter((h) => this.habits.isDoneToday(h)).length;
    this.habitTodayScore.textContent = `${doneCount} / ${list.length} erledigt`;

    if (list.length === 0) {
      this.habitList.innerHTML = '<div class="glass-card muted-label">Noch keine Gewohnheiten angelegt.</div>';
      return;
    }

    this.habitList.innerHTML = list
      .map((habit) => {
        const done = this.habits.isDoneToday(habit);
        const streak = this.habits.getStreak(habit);
        const days = this.habits.getLast7Days(habit);

        const weekHtml = days
          .map((d) => `<div class="day-pill ${d.hit ? 'hit' : ''}">${d.label}</div>`)
          .join('');

        return `
          <div class="habit-card glass-card ${done ? 'done' : ''}">
            <div class="habit-top">
              <button class="habit-check-btn" data-toggle-habit="${habit.id}">
                <span class="check-circle">${done ? '✓' : ''}</span>
                <span class="habit-name">${this.escapeHtml(habit.title)}</span>
              </button>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="badge-pill">🔥 ${streak} T.</span>
                <button class="del-btn" data-del-habit="${habit.id}" title="Löschen">✕</button>
              </div>
            </div>
            <div class="week-dots">${weekHtml}</div>
          </div>
        `;
      })
      .join('');
  }

  /* ==================== QR & WIFI STUDIO ==================== */

  updateQrCode() {
    let payload = '';
    if (this.qrMode === 'wifi') {
      const ssid = this.wifiSsid.value.trim() || 'WLAN';
      const pass = this.wifiPass.value;
      const enc = this.wifiEnc.value;
      payload = enc === 'nopass'
        ? `WIFI:T:nopass;S:${ssid};;`
        : `WIFI:T:${enc};S:${ssid};P:${pass};;`;
    } else {
      payload = this.qrPlainText.value.trim() || 'https://github.com';
    }
    drawQrToCanvas(this.qrCanvas, payload);
  }

  /* ==================== PASSWORD & VAULT ==================== */

  regeneratePassword() {
    const len = Number(this.pwLengthRange.value);
    this.pwLengthVal.textContent = String(len);

    const pw = generateSecurePassword(len, {
      upper: this.pwUpper.checked,
      numbers: this.pwNumbers.checked,
      symbols: this.pwSymbols.checked
    });
    this.generatedPwOutput.value = pw;

    if (len >= 16 && this.pwSymbols.checked) {
      this.pwStrengthBadge.textContent = 'Sehr stark';
    } else if (len >= 12) {
      this.pwStrengthBadge.textContent = 'Stark';
    } else {
      this.pwStrengthBadge.textContent = 'Mittel';
    }
  }

  renderVaultEntries() {
    if (this.vault.entries.length === 0) {
      this.vaultEntriesList.innerHTML = '<p class="muted-label">Tresor ist noch leer.</p>';
      return;
    }

    this.vaultEntriesList.innerHTML = this.vault.entries
      .map(
        (item) => `
        <div class="vault-item">
          <div style="min-width:0;">
            <strong>${this.escapeHtml(item.title)}</strong>
            <div class="vault-secret">${this.escapeHtml(item.secret)}</div>
📋
✕


`
)
.join('');
}
/* ==================== EVENTS ==================== */
bindEvents() {
this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
this.navPills.forEach((btn) => {
btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
});
// Timer
this.presetBtns.forEach((btn) => {
btn.addEventListener('click', () => {
this.presetBtns.forEach((b) => b.classList.remove('active'));
btn.classList.add('active');
this.resetTimer(Number(btn.dataset.minutes));
});
});
this.timerStartPauseBtn.addEventListener('click', () => this.toggleTimer());
this.timerResetBtn.addEventListener('click', () => this.resetTimer());
// Soundscape
this.soundTiles.forEach((tile) => {
tile.addEventListener('click', () => {
this.soundTiles.forEach((t) => t.classList.remove('active'));
tile.classList.add('active');
const mode = tile.dataset.sound;
this.audio.setMode(mode);
this.soundStatusLabel.textContent = mode === 'off' ? 'Aus' : 'Aktiv';
});
});
// Habits
this.habitForm.addEventListener('submit', (e) => {
e.preventDefault();
this.habits.add(this.habitTitleInput.value);
this.habitTitleInput.value = '';
this.renderHabits();
});
this.habitList.addEventListener('click', (e) => {
const toggleBtn = e.target.closest('[data-toggle-habit]');
if (toggleBtn) {
this.habits.toggleToday(toggleBtn.dataset.toggleHabit);
this.renderHabits();
return;
}
const delBtn = e.target.closest('[data-del-habit]');
if (delBtn) {
this.habits.delete(delBtn.dataset.delHabit);
this.renderHabits();
}
});
// QR Code
this.qrModeBtns.forEach((btn) => {
btn.addEventListener('click', () => {
this.qrModeBtns.forEach((b) => b.classList.remove('active'));
btn.classList.add('active');
this.qrMode = btn.dataset.qrMode;
this.qrWifiFields.classList.toggle('hidden', this.qrMode !== 'wifi');
this.qrTextFields.classList.toggle('hidden', this.qrMode !== 'text');
this.updateQrCode();
});
});
[this.wifiSsid, this.wifiPass, this.wifiEnc, this.qrPlainText].forEach((el) => {
el.addEventListener('input', () => this.updateQrCode());
});
this.downloadQrBtn.addEventListener('click', () => {
const link = document.createElement('a');
link.download = 'flowvault-qrcode.png';
link.href = this.qrCanvas.toDataURL('image/png');
link.click();
});
// Password Generator
[this.pwLengthRange, this.pwUpper, this.pwNumbers, this.pwSymbols].forEach((el) => {
el.addEventListener('input', () => this.regeneratePassword());
});
this.regenPwBtn.addEventListener('click', () => this.regeneratePassword());
this.copyPwBtn.addEventListener('click', async () => {
await navigator.clipboard.writeText(this.generatedPwOutput.value);
this.copyPwBtn.textContent = '✓';
setTimeout(() => (this.copyPwBtn.textContent = '📋'), 1200);
});
// Crypto Vault
this.vaultUnlockForm.addEventListener('submit', async (e) => {
e.preventDefault();
this.vaultErrorMsg.classList.add('hidden');
try {
await this.vault.unlock(this.masterPasswordInput.value);
this.masterPasswordInput.value = '';
this.vaultUnlockForm.classList.add('hidden');
this.vaultUnlockedArea.classList.remove('hidden');
this.lockVaultBtn.classList.remove('hidden');
this.renderVaultEntries();
} catch (err) {
this.vaultErrorMsg.textContent = err.message;
this.vaultErrorMsg.classList.remove('hidden');
}
});
this.lockVaultBtn.addEventListener('click', () => {
this.vault.lock();
this.vaultUnlockedArea.classList.add('hidden');
this.lockVaultBtn.classList.add('hidden');
this.vaultUnlockForm.classList.remove('hidden');
});
this.vaultAddForm.addEventListener('submit', async (e) => {
e.preventDefault();
await this.vault.addEntry(this.vaultEntryTitle.value, this.vaultEntrySecret.value);
this.vaultAddForm.reset();
this.renderVaultEntries();
});
this.vaultEntriesList.addEventListener('click', async (e) => {
const copyBtn = e.target.closest('[data-copy-secret]');
if (copyBtn) {
await navigator.clipboard.writeText(copyBtn.dataset.copySecret);
copyBtn.textContent = '✓';
setTimeout(() => (copyBtn.textContent = '📋'), 1200);
return;
}
const delBtn = e.target.closest('[data-del-vault]');
if (delBtn) {
await this.vault.deleteEntry(delBtn.dataset.delVault);
this.renderVaultEntries();
}
});
}
}
document.addEventListener('DOMContentLoaded', () => {
new FlowVaultApp();
});
if ('serviceWorker' in navigator) {
window.addEventListener('load', () => {
navigator.serviceWorker.register('./sw.js').catch(() => {});
});
}

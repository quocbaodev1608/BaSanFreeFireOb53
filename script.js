
(() => {
  const stopNativeAppLeak = (event) => event.preventDefault();

  document.addEventListener('contextmenu', stopNativeAppLeak, { passive: false });
  document.addEventListener('selectstart', stopNativeAppLeak, { passive: false });
  document.addEventListener('dragstart', stopNativeAppLeak, { passive: false });
  document.addEventListener('copy', stopNativeAppLeak, { passive: false });
  document.addEventListener('cut', stopNativeAppLeak, { passive: false });
  document.addEventListener(
    'keydown',
    (event) => {
      if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'x'].includes(String(event.key).toLowerCase())) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
})();

function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  document.querySelectorAll(`[data-page="${pageId}"]`).forEach(b => b.classList.add('active'));
  if (pageId === 'realtime') initChart();
}



let audioCtx = null;
let notificationHost = null;
let toggleFeedbackSuppressed = false;
let lastNotificationAt = 0;
const notificationCooldown = 650;
const launcherStorageKey = 'ftVipLauncherPositionV1';
let launcherClickSuppressUntil = 0;
const scannerOverlayDurationMs = 3200;
let scannerOverlayHost = null;
let scannerOverlayTimer = 0;
let scannerBoostLevel = 0;

const notificationPools = {
  function: [
    'Precision module synchronized.',
    'Aim assist state updated.',
    'Control profile refreshed.',
    'Combat tuning applied.'
  ],
  settings: [
    'System preference updated.',
    'Configuration layer synchronized.',
    'Device setting applied.',
    'Control preference saved.'
  ],
  shield: [
    'Elite shield synchronized.',
    'Security layer active.',
    'Protection profile adjusted.',
    'Defense module updated.'
  ],
  network: [
    'Network boost standby.',
    'Latency route recalibrated.',
    'Realtime network assist refreshed.',
    'Connection profile adjusted.'
  ],
  action: [
    'Configuration applied successfully.',
    'System optimization initialized.',
    'Performance profile updated.',
    'Realtime analysis refreshed.'
  ],
  popup: [
    'Control center ready.',
    'System panel synchronized.',
    'Advanced tools standing by.',
    'Panel routing complete.'
  ]
};

function getSoundToggle() {
  return document.getElementById('settings-sound-toggle');
}

function getNotificationToggle() {
  return document.getElementById('settings-notification-toggle');
}

function isSoundEnabled() {
  const toggle = getSoundToggle();
  return !!(toggle && toggle.checked);
}

function isNotificationEnabled() {
  const toggle = getNotificationToggle();
  return !!(toggle && toggle.checked);
}

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioCtx = new AudioCtor();
  return audioCtx;
}

function primeAudioContext() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

function playUiSound(kind = 'action', force = false) {
  if (!force && !isSoundEnabled()) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const tones = {
    toggleOn: [
      { type: 'triangle', freq: 760, end: 1040, dur: 0.05, gain: 0.045 },
      { type: 'sine', freq: 1180, end: 980, dur: 0.08, gain: 0.026, delay: 0.012 }
    ],
    toggleOff: [
      { type: 'triangle', freq: 560, end: 420, dur: 0.055, gain: 0.03 },
      { type: 'sine', freq: 380, end: 320, dur: 0.08, gain: 0.018, delay: 0.01 }
    ],
    action: [
      { type: 'triangle', freq: 640, end: 860, dur: 0.06, gain: 0.038 },
      { type: 'sine', freq: 980, end: 1180, dur: 0.09, gain: 0.022, delay: 0.016 }
    ],
    success: [
      { type: 'triangle', freq: 660, end: 880, dur: 0.05, gain: 0.038 },
      { type: 'triangle', freq: 880, end: 1320, dur: 0.085, gain: 0.028, delay: 0.028 }
    ],
    warning: [
      { type: 'square', freq: 460, end: 430, dur: 0.045, gain: 0.02 },
      { type: 'triangle', freq: 620, end: 560, dur: 0.07, gain: 0.022, delay: 0.02 }
    ],
    notification: [
      { type: 'sine', freq: 720, end: 940, dur: 0.06, gain: 0.024 },
      { type: 'triangle', freq: 1040, end: 1120, dur: 0.08, gain: 0.016, delay: 0.02 }
    ],
    ting: [
      { type: 'triangle', freq: 980, end: 1280, dur: 0.05, gain: 0.032 },
      { type: 'sine', freq: 1480, end: 1320, dur: 0.075, gain: 0.018, delay: 0.012 }
    ],
    reset: [
      { type: 'triangle', freq: 620, end: 470, dur: 0.06, gain: 0.028 },
      { type: 'sine', freq: 420, end: 300, dur: 0.09, gain: 0.016, delay: 0.018 }
    ]
  };

  playTonePattern(tones[kind] || tones.action, force);
}

function playTonePattern(pattern, force = false) {
  if (!force && !isSoundEnabled()) return;
  const ctx = ensureAudioContext();
  if (!ctx || !Array.isArray(pattern) || !pattern.length) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.connect(ctx.destination);

  pattern.forEach(tone => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = now + (tone.delay || 0);
    const endAt = startAt + tone.dur;

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, startAt);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, tone.end || tone.freq), endAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(tone.gain, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.connect(gain);
    gain.connect(master);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  });
}

function hashToggleSoundKey(input) {
  let hash = 2166136261;
  const text = String(input || 'toggle').toLowerCase();

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function buildFeatureTogglePattern(title, enabled) {
  const hash = hashToggleSoundKey(title);
  const waves = ['sine', 'triangle', 'square', 'sawtooth'];
  const palette = [294, 330, 349, 392, 440, 494, 523, 587, 659, 698, 784, 880];
  const root = palette[hash % palette.length];
  const overtone = palette[(hash >> 3) % palette.length];
  const waveA = waves[(hash >> 1) % waves.length];
  const waveB = waves[(hash >> 5) % waves.length];
  const delayShift = ((hash >> 7) % 5) * 0.003;
  const gainBase = 0.018 + ((hash >> 9) % 6) * 0.004;

  if (enabled) {
    return [
      { type: waveA, freq: root * 0.96, end: root * 1.18, dur: 0.05, gain: gainBase + 0.014 },
      { type: waveB, freq: overtone * 1.02, end: overtone * 1.24, dur: 0.075, gain: gainBase, delay: 0.012 + delayShift },
      { type: 'sine', freq: root * 1.52, end: root * 1.68, dur: 0.06, gain: gainBase * 0.72, delay: 0.03 + delayShift }
    ];
  }

  return [
    { type: waveB, freq: overtone * 1.06, end: overtone * 0.84, dur: 0.06, gain: gainBase + 0.008 },
    { type: waveA, freq: root * 0.92, end: root * 0.7, dur: 0.08, gain: gainBase * 0.9, delay: 0.014 + delayShift },
    { type: 'sine', freq: root * 0.62, end: root * 0.5, dur: 0.07, gain: gainBase * 0.6, delay: 0.038 + delayShift }
  ];
}

function playFeatureToggleSound(meta, enabled, force = false) {
  const pattern = buildFeatureTogglePattern(meta && meta.title ? meta.title : 'toggle', enabled);
  playTonePattern(pattern, force);
}

function ensureNotificationHost() {
  if (notificationHost) return notificationHost;
  notificationHost = document.getElementById('system-notifications');
  if (notificationHost) return notificationHost;

  notificationHost = document.createElement('div');
  notificationHost.id = 'system-notifications';
  document.body.appendChild(notificationHost);
  return notificationHost;
}

function ensureScannerOverlayHost() {
  if (scannerOverlayHost) return scannerOverlayHost;

  scannerOverlayHost = document.getElementById('scanner-overlay');
  if (scannerOverlayHost) return scannerOverlayHost;

  scannerOverlayHost = document.createElement('div');
  scannerOverlayHost.id = 'scanner-overlay';
  scannerOverlayHost.setAttribute('aria-hidden', 'true');
  scannerOverlayHost.innerHTML = `
    <div class="scanner-panel">
      <div class="scanner-panel-badge">ROBOT ACTIVE</div>
      <div class="scanner-robot-wrap">
        <svg class="scanner-robot-svg" viewBox="0 0 88 88" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="scannerBotGrad" x1="18" y1="14" x2="70" y2="72" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#9dfbd3"/>
              <stop offset="60%" stop-color="#46ff9a"/>
              <stop offset="100%" stop-color="#0dbf67"/>
            </linearGradient>
          </defs>
          <rect x="24" y="24" width="40" height="30" rx="11" fill="rgba(7,24,16,0.92)" stroke="url(#scannerBotGrad)" stroke-width="2"/>
          <path d="M44 14V24" stroke="url(#scannerBotGrad)" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="44" cy="10" r="4" fill="url(#scannerBotGrad)"/>
          <rect x="32" y="34" width="9" height="8" rx="4" fill="#7dffb7"/>
          <rect x="47" y="34" width="9" height="8" rx="4" fill="#7dffb7"/>
          <path d="M36 48C39 51 49 51 52 48" stroke="#7dffb7" stroke-width="2.1" stroke-linecap="round"/>
          <path d="M30 58L25 68" stroke="url(#scannerBotGrad)" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M58 58L63 68" stroke="url(#scannerBotGrad)" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M20 34L13 40" stroke="url(#scannerBotGrad)" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M68 34L75 40" stroke="url(#scannerBotGrad)" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="15" cy="42" r="3" fill="#7dffb7"/>
          <circle cx="73" cy="42" r="3" fill="#7dffb7"/>
        </svg>
        <span class="scanner-spark spark-a"></span>
        <span class="scanner-spark spark-b"></span>
        <span class="scanner-spark spark-c"></span>
      </div>
      <div class="scanner-panel-title">A.I Scanner</div>
      <div class="scanner-panel-text">Robot đang dọn dẹp dữ liệu rác và tối ưu realtime engine...</div>
      <div class="scanner-panel-progress">
        <div class="scanner-panel-progress-fill"></div>
      </div>
    </div>
  `;

  document.body.appendChild(scannerOverlayHost);
  return scannerOverlayHost;
}

function showScannerOverlay() {
  const overlay = ensureScannerOverlayHost();
  const badge = overlay.querySelector('.scanner-panel-badge');
  const text = overlay.querySelector('.scanner-panel-text');

  if (badge) {
    badge.textContent = `ROBOT ACTIVE X${Math.max(1, scannerBoostLevel)}`;
  }

  if (text) {
    text.textContent =
      scannerBoostLevel > 1
        ? `Robot đang dọn dẹp dữ liệu rác và cộng dồn tối ưu realtime engine... Level ${scannerBoostLevel}.`
        : 'Robot đang dọn dẹp dữ liệu rác và tối ưu realtime engine...';
  }

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  window.clearTimeout(scannerOverlayTimer);
  scannerOverlayTimer = window.setTimeout(() => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }, scannerOverlayDurationMs);
}

function getScannerBoostStrength() {
  if (scannerBoostLevel <= 0) return 0;
  return Math.log1p(scannerBoostLevel) * 0.9;
}

function getToastIcon(type) {
  if (type === 'success') {
    return `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#66ff9e" stroke-width="1.4"/><path d="M5 8 L7 10 L11 6" stroke="#66ff9e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (type === 'warning') {
    return `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2 L14 13 H2 Z" stroke="#ffd15c" stroke-width="1.3" fill="rgba(255,209,92,0.08)"/><path d="M8 5.2 V8.8" stroke="#ffd15c" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.2" r="0.9" fill="#ffd15c"/></svg>`;
  }
  if (type === 'info') {
    return `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#7fd0ff" stroke-width="1.4"/><path d="M8 7 V10.4" stroke="#7fd0ff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.8" r="0.9" fill="#7fd0ff"/></svg>`;
  }
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M8 1.8 L13.2 4.8 V11.2 L8 14.2 L2.8 11.2 V4.8 Z" stroke="#ff4455" stroke-width="1.3" fill="rgba(255,68,85,0.08)"/><circle cx="8" cy="8" r="1.8" fill="#ff4455"/></svg>`;
}

function showSystemNotification(type, title, message, options = {}) {
  const force = !!options.force;
  const bypassCooldown = !!options.bypassCooldown;
  if (!force && !isNotificationEnabled()) return;

  const now = Date.now();
  if (!force && !bypassCooldown && now - lastNotificationAt < notificationCooldown) return;
  lastNotificationAt = now;

  const host = ensureNotificationHost();
  const toast = document.createElement('div');
  toast.className = `sys-toast ${type || 'system'}`;

  const timeLabel = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  toast.innerHTML = `
    <div class="sys-toast-icon">${getToastIcon(type)}</div>
    <div class="sys-toast-body">
      <div class="sys-toast-title">${title}</div>
      <div class="sys-toast-message">${message}</div>
      <div class="sys-toast-time">${timeLabel}</div>
    </div>
  `;

  host.appendChild(toast);
  while (host.children.length > 4) {
    host.removeChild(host.firstElementChild);
  }

  const shouldPlaySound = options.withSound !== undefined ? options.withSound : isSoundEnabled();
  if (shouldPlaySound) {
    playUiSound(
      options.soundKind || (type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'notification'),
      !!options.forceSound
    );
  }

  const dismissDelay = options.duration || 3000;
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, dismissDelay);
}

function pickNotificationMessage(poolName) {
  const pool = notificationPools[poolName] || notificationPools.action;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getToggleMeta(checkbox) {
  const funcCard = checkbox.closest('.func-card');
  if (funcCard) {
    const name = funcCard.querySelector('.func-name');
    return { title: name ? name.textContent.trim() : 'Function', type: 'system', pool: 'function' };
  }

  const settingRow = checkbox.closest('.setting-row');
  if (settingRow) {
    const name = settingRow.querySelector('.setting-row-name');
    return { title: name ? name.textContent.trim() : 'Setting', type: 'info', pool: 'settings' };
  }

  const shieldItem = checkbox.closest('.shield-item');
  if (shieldItem) {
    const name = shieldItem.querySelector('.shield-item-name');
    return { title: name ? name.textContent.trim() : 'Shield', type: 'system', pool: 'shield' };
  }

  const rowLabel = checkbox.closest('div[style*="justify-content:space-between"]');
  const name = rowLabel && rowLabel.querySelector('div > div');
  if (name) {
    return { title: name.textContent.trim(), type: 'info', pool: 'network' };
  }

  return { title: 'Control Update', type: 'system', pool: 'action' };
}

function handleToggleFeedback(checkbox, previousSoundEnabled) {
  if (toggleFeedbackSuppressed) return;

  const isSoundToggle = checkbox.id === 'settings-sound-toggle';
  const isNotificationToggle = checkbox.id === 'settings-notification-toggle';
  const meta = getToggleMeta(checkbox);
  const canPlayToggleSound = isSoundToggle ? checkbox.checked : previousSoundEnabled;

  if (canPlayToggleSound) {
    playFeatureToggleSound(meta, checkbox.checked, isSoundToggle && checkbox.checked);
  }

  if (isSoundToggle) {
    showSystemNotification(
      checkbox.checked ? 'success' : 'info',
      'Sound Effects',
      checkbox.checked ? 'Audio response channel enabled.' : 'Audio response channel muted.',
      {
        force: true,
        bypassCooldown: true,
        withSound: false,
        duration: 2600
      }
    );
    return;
  }

  if (checkbox.closest('.func-card')) {
    showSystemNotification(
      checkbox.checked ? meta.type : 'warning',
      meta.title,
      checkbox.checked ? pickNotificationMessage(meta.pool) : `${meta.title} disabled.`,
      {
        bypassCooldown: true,
        duration: 2600,
        withSound: false
      }
    );
    return;
  }

  if (isNotificationToggle) {
    showSystemNotification(
      checkbox.checked ? 'info' : 'warning',
      'System Notification',
      checkbox.checked ? 'Notification stream enabled.' : 'Notification stream paused.',
      {
        force: true,
        bypassCooldown: true,
        withSound: false,
        duration: 2600
      }
    );
    return;
  }

  showSystemNotification(
    checkbox.checked ? meta.type : 'warning',
    meta.title,
    checkbox.checked ? pickNotificationMessage(meta.pool) : `${meta.title} disabled.`,
    {
      bypassCooldown: true,
      duration: 2600,
      withSound: false
    }
  );
}

function initActionFeedback() {
  const popupButtons = document.querySelectorAll('.popup-panel .btn-primary');
  popupButtons.forEach(button => {
    button.addEventListener('click', () => {
      playUiSound('action');
      showSystemNotification('success', 'Control Action', pickNotificationMessage('action'), {
        duration: 2600
      });
    });
  });
}



function toggleFunc(idx, checkbox) {
  const card = document.getElementById('fc-' + idx);
  if (card) {
    if (checkbox.checked) {
      card.classList.add('on');
    } else {
      card.classList.remove('on');
    }
    card.dataset.featureRunning = checkbox.checked ? 'true' : 'false';
  }

  if (window.ftFeatureEngine && typeof window.ftFeatureEngine.toggle === 'function') {
    window.ftFeatureEngine.toggle(idx, checkbox);
  }
}

function syncShieldToggle(checkbox) {
  const item = checkbox.closest('.shield-item');
  if (!item) return;
  const status = item.querySelector('.shield-item-status');
  item.classList.toggle('on', checkbox.checked);
  if (!status) return;
  if (checkbox.checked) {
    status.textContent = 'ACTIVE';
    status.classList.remove('status-off');
    status.classList.add('status-on');
  } else {
    status.textContent = 'OFFLINE';
    status.classList.remove('status-on');
    status.classList.add('status-off');
  }
}

function syncToggleUI(checkbox) {
  const funcCard = checkbox.closest('.func-card');
  if (funcCard) {
    const idx = funcCard.id.replace('fc-', '');
    toggleFunc(idx, checkbox);
  }

  syncShieldToggle(checkbox);
}

function resetFunctionState() {
  toggleFeedbackSuppressed = true;
  document.querySelectorAll('.func-card .toggle input').forEach(checkbox => {
    checkbox.checked = false;
    syncToggleUI(checkbox);
  });
  toggleFeedbackSuppressed = false;
}

function resetPercentageState() {
  document.querySelectorAll('.booster-card .booster-range').forEach((slider, idx) => {
    slider.value = 0;
    updateBooster(idx, 0);
  });

  document.querySelectorAll('.vip-sliders .booster-range').forEach((slider, idx) => {
    slider.value = 0;
    updateVipSlider(idx, 0);
  });
}

function resetConfiguration(showFeedback = true) {
  const hadSound = isSoundEnabled();
  if (showFeedback && hadSound) playUiSound('reset');
  toggleFeedbackSuppressed = true;
  if (window.ftFeatureEngine && typeof window.ftFeatureEngine.stopAll === 'function') {
    window.ftFeatureEngine.stopAll('reset');
  }
  document.querySelectorAll('.toggle input').forEach(checkbox => {
    checkbox.checked = false;
    syncToggleUI(checkbox);
  });
  resetPercentageState();
  toggleFeedbackSuppressed = false;
  if (showFeedback) {
    showSystemNotification('warning', 'Reset Configuration', 'All system controls returned to safe defaults.', {
      force: true,
      withSound: false,
      duration: 3000
    });
  }
}

function initToggleSystem() {
  toggleFeedbackSuppressed = true;
  document.querySelectorAll('.toggle input').forEach(checkbox => {
    checkbox.addEventListener('pointerdown', primeAudioContext, { passive: true });
    checkbox.addEventListener('click', primeAudioContext, { passive: true });
    checkbox.addEventListener('change', () => {
      const previousSoundEnabled =
        checkbox.id === 'settings-sound-toggle'
          ? !checkbox.checked
          : isSoundEnabled();
      syncToggleUI(checkbox);
      handleToggleFeedback(checkbox, previousSoundEnabled);
    });
    syncToggleUI(checkbox);
  });

  resetConfiguration(false);

  const resetBtn = document.querySelector('.reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetConfiguration);
  }
  toggleFeedbackSuppressed = false;
}



function updateBooster(idx, value) {
  const pct = String(parseInt(value, 10) || 0);
  document.getElementById('bp' + idx).textContent = pct;
  document.getElementById('bf' + idx).style.width = pct + '%';
  document.getElementById('sb' + idx).style.width = pct + '%';
  document.getElementById('sp' + idx).textContent = pct + '%';

  const card = document.getElementById('bcard-' + idx);
  if (parseInt(pct, 10) >= 75) {
    card.classList.add('high-boost');
  } else {
    card.classList.remove('high-boost');
  }
}

function applyBoost() {
  const btn = event.currentTarget;
  const origText = btn.innerHTML;
  playUiSound('success');
  showSystemNotification('success', 'VIP Boost Control', pickNotificationMessage('action'), {
    duration: 2800
  });
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7 L6 11 L12 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> BOOSTED!`;
  btn.style.background = 'linear-gradient(135deg, #005500, #00aa00)';
  btn.style.borderColor = '#00cc00';
  setTimeout(() => {
    btn.innerHTML = origText;
    btn.style.background = '';
    btn.style.borderColor = '';
  }, 2000);
}



function updateVipSlider(idx, value) {
  const pct = String(parseInt(value, 10) || 0);
  document.getElementById('vp' + idx + '-pct').textContent = pct + '%';
  document.getElementById('vp' + idx + '-fill').style.width = pct + '%';
}


function loadLauncherPosition() {
  try {
    const raw = localStorage.getItem(launcherStorageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) {
      return null;
    }

    return { left: parsed.left, top: parsed.top };
  } catch (_) {
    return null;
  }
}

function saveLauncherPosition(position) {
  try {
    localStorage.setItem(launcherStorageKey, JSON.stringify(position));
  } catch (_) {}
}

function clampLauncherPosition(launcher, left, top) {
  const margin = 10;
  const rect = launcher.getBoundingClientRect();
  const width = rect.width || launcher.offsetWidth || 52;
  const height = rect.height || launcher.offsetHeight || 52;

  return {
    left: clamp(left, margin, Math.max(margin, window.innerWidth - width - margin)),
    top: clamp(top, margin, Math.max(margin, window.innerHeight - height - margin))
  };
}

function applyLauncherPosition(launcher, position, persist = false) {
  if (!launcher || !position) return;

  const next = clampLauncherPosition(launcher, Number(position.left) || 0, Number(position.top) || 0);
  launcher.classList.add('launcher-free');
  launcher.style.left = next.left + 'px';
  launcher.style.top = next.top + 'px';
  launcher.style.right = 'auto';
  launcher.style.bottom = 'auto';

  if (persist) {
    saveLauncherPosition(next);
  }
}

function pinLauncherToCurrentPosition(launcher) {
  if (!launcher || launcher.classList.contains('launcher-free')) return;
  const rect = launcher.getBoundingClientRect();
  applyLauncherPosition(launcher, { left: rect.left, top: rect.top }, false);
}

function syncLauncherToViewport() {
  const launcher = document.getElementById('launcher');
  if (!launcher || !launcher.classList.contains('launcher-free')) return;

  applyLauncherPosition(
    launcher,
    {
      left: parseFloat(launcher.style.left) || launcher.getBoundingClientRect().left,
      top: parseFloat(launcher.style.top) || launcher.getBoundingClientRect().top
    },
    true
  );
}

function initLauncherControl() {
  const launcher = document.getElementById('launcher');
  const launcherBtn = document.getElementById('launcherBtn');
  if (!launcher || !launcherBtn || launcher.dataset.initDone === 'true') return;

  launcher.dataset.initDone = 'true';

  const savedPosition = loadLauncherPosition();
  if (savedPosition) {
    applyLauncherPosition(launcher, savedPosition, false);
  }

  const drag = {
    active: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0
  };

  launcherBtn.addEventListener('click', (event) => {
    if (Date.now() < launcherClickSuppressUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    openPopup();
  });

  launcherBtn.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    drag.active = true;
    drag.moved = false;
    drag.pointerId = event.pointerId;
    drag.startX = event.clientX;
    drag.startY = event.clientY;

    const rect = launcher.getBoundingClientRect();
    drag.originLeft = rect.left;
    drag.originTop = rect.top;

    if (typeof launcherBtn.setPointerCapture === 'function') {
      launcherBtn.setPointerCapture(event.pointerId);
    }
  });

  launcherBtn.addEventListener('pointermove', (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.moved && Math.hypot(deltaX, deltaY) < 6) {
      return;
    }

    if (!drag.moved) {
      drag.moved = true;
      pinLauncherToCurrentPosition(launcher);
      drag.originLeft = parseFloat(launcher.style.left) || launcher.getBoundingClientRect().left;
      drag.originTop = parseFloat(launcher.style.top) || launcher.getBoundingClientRect().top;
      launcher.classList.add('dragging');
    }

    event.preventDefault();
    applyLauncherPosition(
      launcher,
      {
        left: drag.originLeft + deltaX,
        top: drag.originTop + deltaY
      },
      false
    );
  });

  const finishLauncherDrag = (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;

    if (typeof launcherBtn.releasePointerCapture === 'function') {
      try {
        launcherBtn.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }

    if (drag.moved) {
      launcherClickSuppressUntil = Date.now() + 260;
      saveLauncherPosition({
        left: parseFloat(launcher.style.left) || launcher.getBoundingClientRect().left,
        top: parseFloat(launcher.style.top) || launcher.getBoundingClientRect().top
      });
    }

    launcher.classList.remove('dragging');
    drag.active = false;
    drag.moved = false;
    drag.pointerId = null;
  };

  launcherBtn.addEventListener('pointerup', finishLauncherDrag);
  launcherBtn.addEventListener('pointercancel', finishLauncherDrag);
  window.addEventListener('resize', syncLauncherToViewport, { passive: true });
}



function openPopup() {
  document.getElementById('popup-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  showSystemNotification('system', 'Control Center', pickNotificationMessage('popup'), {
    duration: 2400
  });
}

function closePopup() {
  document.getElementById('popup-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('popup-overlay')) closePopup();
}

function switchPopupTab(idx, btn) {
  document.querySelectorAll('.popup-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.popup-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ppanel-' + idx).classList.add('active');
  playUiSound('action');
}

function triggerAiScanner() {
  playUiSound('success');
  scannerBoostLevel += 1;
  showScannerOverlay();

  const scannerBoost = getScannerBoostStrength();
  const fpsKick = Math.max(1, Math.round(2 + scannerBoost * 1.8));
  const cpuKick = Math.max(1, Math.round(2 + scannerBoost * 1.35));
  const gpuKick = Math.max(1, Math.round(1 + scannerBoost));
  const pingKick = Math.max(1, Math.round(2 + scannerBoost * 1.1));
  const ramKick = Math.max(1, Math.round(1 + scannerBoost * 0.9));
  const tempKick = 0.8 + scannerBoost * 0.55;

  liveData.fps.val = clamp(liveData.fps.val + fpsKick, liveData.fps.min, liveData.fps.max);
  liveData.fps.target = clamp(liveData.fps.target + fpsKick + 3, liveData.fps.min, liveData.fps.max);
  liveData.cpu.val = clamp(liveData.cpu.val - cpuKick, liveData.cpu.min, liveData.cpu.max);
  liveData.cpu.target = clamp(liveData.cpu.target - (cpuKick + 2), liveData.cpu.min, liveData.cpu.max);
  liveData.gpu.val = clamp(liveData.gpu.val - gpuKick, liveData.gpu.min, liveData.gpu.max);
  liveData.gpu.target = clamp(liveData.gpu.target - (gpuKick + 1), liveData.gpu.min, liveData.gpu.max);
  liveData.ping.val = clamp(liveData.ping.val - pingKick, liveData.ping.min, liveData.ping.max);
  liveData.ping.target = clamp(liveData.ping.target - (pingKick + 2), liveData.ping.min, liveData.ping.max);
  liveData.ram.val = clamp(liveData.ram.val + ramKick, liveData.ram.min, liveData.ram.max);
  liveData.ram.target = clamp(liveData.ram.target + (ramKick + 1), liveData.ram.min, liveData.ram.max);
  liveData.temp.val = clamp(liveData.temp.val - tempKick, liveData.temp.min, liveData.temp.max);
  liveData.temp.target = clamp(liveData.temp.target - (tempKick + 0.8), liveData.temp.min, liveData.temp.max);

  updateLiveStats();
}



function triggerOptimize() {
  const btn = document.getElementById('optimizeBtn');
  playUiSound('success');
  showSystemNotification('success', 'Optimize Now', 'System optimization initialized.', {
    duration: 2800
  });
  btn.style.background = 'linear-gradient(135deg, #005500, #00cc00, #00ff44)';
  btn.style.boxShadow = '0 0 40px rgba(0,200,50,0.6), 0 4px 20px rgba(0,0,0,0.5)';
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8 L6 12 L14 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> OPTIMIZED!`;
  const ring = document.getElementById('perfRingFill');
  ring.style.strokeDashoffset = '22';
  document.getElementById('perfPct').textContent = '90%';

  setTimeout(() => {
    btn.style.background = '';
    btn.style.boxShadow = '';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L10 6H15L11 9.5L12.5 15L8 12L3.5 15L5 9.5L1 6H6L8 1Z" fill="white"/></svg> OPTIMIZE NOW`;
    ring.style.strokeDashoffset = '44';
    document.getElementById('perfPct').textContent = '80%';
  }, 3000);
}



function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function buildMetric(base, min, max, step, response = 0.18, retarget = 0.16) {
  return { val: base, target: base, min, max, step, response, retarget };
}

function buildDeviceProfile() {
  const ua = navigator.userAgent || '';
  const width = Math.min(window.innerWidth || screen.width || 390, screen.width || 390);
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isPhone = /Android.+Mobile|iPhone|iPod|Mobile/i.test(ua) || (isTouch && width <= 430);
  const isTablet = /iPad|Tablet/i.test(ua) || (isTouch && width > 430 && width <= 900);
  const type = isTablet ? 'tablet' : isPhone ? 'mobile' : 'desktop';
  const memory = navigator.deviceMemory || (type === 'desktop' ? 8 : type === 'tablet' ? 6 : 4);
  const cores = navigator.hardwareConcurrency || (type === 'desktop' ? 8 : 6);
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = conn && conn.effectiveType ? conn.effectiveType : '4g';
  const isSlowNetwork = /(^2g$|^slow-2g$|^3g$)/i.test(effectiveType);
  const power = clamp((((memory - 2) / 6) + ((cores - 4) / 6)) / 2, 0, 1);

  const profiles = {
    mobile: {
      fps:  { base: 52 + power * 7, min: 42, max: 60, step: 1.2 },
      ping: { base: (isSlowNetwork ? 58 : 34) - power * 4, min: 18, max: isSlowNetwork ? 95 : 68, step: 2.2 },
      cpu:  { base: 44 - power * 4, min: 28, max: 76, step: 2.2 },
      gpu:  { base: 55 + power * 6, min: 36, max: 84, step: 2.6 },
      temp: { base: 37 + (1 - power) * 1.5, min: 33, max: 45, step: 0.45 },
      ram:  { base: 60 - power * 3, min: 44, max: 82, step: 1.8 },
      touch: { base: 14 - power * 3, min: 7, max: 24, step: 1.1 },
      input: { base: 17 - power * 3, min: 8, max: 26, step: 1.2 },
      jitter:{ base: isSlowNetwork ? 7 : 4, min: 1, max: 12, step: 0.9 },
      packet:{ base: isSlowNetwork ? 1 : 0, min: 0, max: 2, step: 0.35 }
    },
    tablet: {
      fps:  { base: 67 + power * 10, min: 50, max: 90, step: 1.6 },
      ping: { base: (isSlowNetwork ? 42 : 26) - power * 3, min: 14, max: isSlowNetwork ? 78 : 54, step: 1.8 },
      cpu:  { base: 40 - power * 4, min: 24, max: 70, step: 2.1 },
      gpu:  { base: 52 + power * 8, min: 34, max: 78, step: 2.3 },
      temp: { base: 35.5 + (1 - power), min: 31, max: 43, step: 0.4 },
      ram:  { base: 55 - power * 4, min: 40, max: 76, step: 1.6 },
      touch: { base: 11 - power * 2.5, min: 6, max: 18, step: 0.8 },
      input: { base: 13 - power * 2.5, min: 7, max: 20, step: 0.9 },
      jitter:{ base: isSlowNetwork ? 5 : 3, min: 1, max: 9, step: 0.7 },
      packet:{ base: isSlowNetwork ? 1 : 0, min: 0, max: 2, step: 0.3 }
    },
    desktop: {
      fps:  { base: 96 + power * 18, min: 72, max: 144, step: 2.8 },
      ping: { base: (isSlowNetwork ? 34 : 20) - power * 2, min: 9, max: isSlowNetwork ? 62 : 42, step: 1.5 },
      cpu:  { base: 32 - power * 3, min: 16, max: 62, step: 1.8 },
      gpu:  { base: 46 + power * 10, min: 24, max: 74, step: 2.2 },
      temp: { base: 33.5 + (1 - power) * 1.2, min: 28, max: 39, step: 0.35 },
      ram:  { base: 47 - power * 3, min: 28, max: 68, step: 1.4 },
      touch: { base: 6, min: 4, max: 10, step: 0.5 },
      input: { base: 7, min: 5, max: 12, step: 0.55 },
      jitter:{ base: isSlowNetwork ? 4 : 2, min: 0, max: 7, step: 0.45 },
      packet:{ base: 0, min: 0, max: 1, step: 0.2 }
    }
  };

  return {
    type,
    width,
    power,
    effectiveType,
    metrics: profiles[type]
  };
}

const deviceProfile = buildDeviceProfile();
const liveData = {
  fps:  buildMetric(deviceProfile.metrics.fps.base,  deviceProfile.metrics.fps.min,  deviceProfile.metrics.fps.max,  deviceProfile.metrics.fps.step, 0.18, 0.12),
  ping: buildMetric(deviceProfile.metrics.ping.base, deviceProfile.metrics.ping.min, deviceProfile.metrics.ping.max, deviceProfile.metrics.ping.step, 0.22, 0.18),
  cpu:  buildMetric(deviceProfile.metrics.cpu.base,  deviceProfile.metrics.cpu.min,  deviceProfile.metrics.cpu.max,  deviceProfile.metrics.cpu.step, 0.16, 0.14),
  gpu:  buildMetric(deviceProfile.metrics.gpu.base,  deviceProfile.metrics.gpu.min,  deviceProfile.metrics.gpu.max,  deviceProfile.metrics.gpu.step, 0.16, 0.14),
  temp: buildMetric(deviceProfile.metrics.temp.base, deviceProfile.metrics.temp.min, deviceProfile.metrics.temp.max, deviceProfile.metrics.temp.step, 0.12, 0.08),
  ram:  buildMetric(deviceProfile.metrics.ram.base,  deviceProfile.metrics.ram.min,  deviceProfile.metrics.ram.max,  deviceProfile.metrics.ram.step, 0.13, 0.12),
  touch: buildMetric(deviceProfile.metrics.touch.base, deviceProfile.metrics.touch.min, deviceProfile.metrics.touch.max, deviceProfile.metrics.touch.step, 0.2, 0.18),
  input: buildMetric(deviceProfile.metrics.input.base, deviceProfile.metrics.input.min, deviceProfile.metrics.input.max, deviceProfile.metrics.input.step, 0.2, 0.18),
  jitter: buildMetric(deviceProfile.metrics.jitter.base, deviceProfile.metrics.jitter.min, deviceProfile.metrics.jitter.max, deviceProfile.metrics.jitter.step, 0.2, 0.18),
  packet: buildMetric(deviceProfile.metrics.packet.base, deviceProfile.metrics.packet.min, deviceProfile.metrics.packet.max, deviceProfile.metrics.packet.step, 0.18, 0.16)
};

function randStep(d) {
  if (Math.abs(d.val - d.target) < d.step || Math.random() < d.retarget) {
    d.target = d.min + Math.random() * (d.max - d.min);
  }
  const drift = (d.target - d.val) * d.response;
  const noise = (Math.random() - 0.5) * d.step;
  d.val = clamp(d.val + drift + noise, d.min, d.max);
  return Math.round(d.val);
}

function animateNum(el, newVal) {
  if (!el) return;
  el.style.transform = 'scale(1.05)';
  el.style.transition = 'transform 0.15s ease';
  el.textContent = newVal;
  setTimeout(() => {
    el.style.transform = 'scale(1)';
  }, 150);
}

function updateLiveStats() {
  const scannerBoost = getScannerBoostStrength();

  if (scannerBoost > 0) {
    liveData.cpu.target = clamp(liveData.cpu.target - (8.5 * scannerBoost), liveData.cpu.min, liveData.cpu.max);
    liveData.gpu.target = clamp(liveData.gpu.target - (4.5 * scannerBoost), liveData.gpu.min, liveData.gpu.max);
  }

  const cpu  = randStep(liveData.cpu);
  const gpu  = randStep(liveData.gpu);
  const ramBaseTarget =
    deviceProfile.metrics.ram.base +
    ((cpu + gpu) * 0.03) -
    (deviceProfile.type === 'mobile' ? 0 : 3) +
    (scannerBoost * 3.8);
  liveData.ram.target = clamp(ramBaseTarget, liveData.ram.min, liveData.ram.max);
  const ram  = randStep(liveData.ram);
  liveData.temp.target = clamp(
    deviceProfile.metrics.temp.base + (cpu * 0.06) + (gpu * 0.03) - (deviceProfile.type === 'desktop' ? 1.2 : 0) - (scannerBoost * 1.9),
    liveData.temp.min,
    liveData.temp.max
  );
  const temp = randStep(liveData.temp);
  liveData.fps.target = clamp(
    deviceProfile.metrics.fps.base + ((liveData.cpu.max - cpu) * 0.18) + ((liveData.gpu.max - gpu) * 0.08) - ((temp - deviceProfile.metrics.temp.base) * 1.6) + (scannerBoost * 9),
    liveData.fps.min,
    liveData.fps.max
  );
  const fps  = randStep(liveData.fps);
  liveData.ping.target = clamp(
    deviceProfile.metrics.ping.base + Math.max(0, (60 - fps) * 0.12) + Math.max(0, (cpu - deviceProfile.metrics.cpu.base) * 0.08) - (scannerBoost * 5.4),
    liveData.ping.min,
    liveData.ping.max
  );
  const ping = randStep(liveData.ping);
  liveData.jitter.target = clamp(deviceProfile.metrics.jitter.base + (ping - deviceProfile.metrics.ping.base) * 0.08, liveData.jitter.min, liveData.jitter.max);
  const jitter = randStep(liveData.jitter);
  liveData.touch.target = clamp(deviceProfile.metrics.touch.base + Math.max(0, (cpu - 40) * 0.05), liveData.touch.min, liveData.touch.max);
  liveData.input.target = clamp(deviceProfile.metrics.input.base + Math.max(0, (gpu - 55) * 0.05), liveData.input.min, liveData.input.max);
  const touch = randStep(liveData.touch);
  const input = randStep(liveData.input);
  liveData.packet.target = clamp((ping > liveData.ping.min + 20 || jitter > liveData.jitter.min + 4) ? 1 : 0, liveData.packet.min, liveData.packet.max);
  const packet = randStep(liveData.packet);
  const packetLoss = Math.max(0, Math.min(2, packet));
  const perfPct = Math.round(clamp(
    58
      + ((fps - liveData.fps.min) / (liveData.fps.max - liveData.fps.min)) * 22
      + ((liveData.ping.max - ping) / (liveData.ping.max - liveData.ping.min)) * 8
      + ((liveData.temp.max - temp) / (liveData.temp.max - liveData.temp.min)) * 6
      + ((liveData.ram.max - ram) / (liveData.ram.max - liveData.ram.min)) * 4,
    deviceProfile.type === 'mobile' ? 62 : 66,
    deviceProfile.type === 'desktop' ? 92 : 88
  ));
  animateNum(document.getElementById('stat-fps'),  fps);
  animateNum(document.getElementById('stat-ping'), ping);
  animateNum(document.getElementById('stat-cpu'),  cpu);
  animateNum(document.getElementById('stat-gpu'),  gpu);
  animateNum(document.getElementById('stat-temp'), temp);
  animateNum(document.getElementById('stat-ram'),  ram);
  animateNum(document.getElementById('rt-fps'),  fps);
  animateNum(document.getElementById('rt-ping'), ping);
  animateNum(document.getElementById('rt-cpu'),  cpu);
  animateNum(document.getElementById('rt-gpu'),  gpu);
  animateNum(document.getElementById('rt-temp'), temp);
  animateNum(document.getElementById('rt-ram'),  ram);
  animateNum(document.getElementById('rt-touch'),  touch);
  animateNum(document.getElementById('rt-input'),  input);
  animateNum(document.getElementById('rt-jitter'), jitter);
  animateNum(document.getElementById('rt-packet'), packetLoss);
  animateNum(document.getElementById('net-ping'),   ping);
  animateNum(document.getElementById('net-jitter'), jitter);
  animateNum(document.getElementById('net-loss'),   packetLoss);
  animateNum(document.getElementById('thermalDeg'), temp);
  const perfRing = document.getElementById('perfRingFill');
  if (perfRing) perfRing.style.strokeDashoffset = String(220 - (perfPct / 100) * 220);
  animateNum(document.getElementById('perfPct'), perfPct + '%');
  pushChartData(fps);
}

setInterval(updateLiveStats, 1600);



const chartData = Array.from({length: 40}, () => clamp(
  liveData.fps.val + (Math.random() - 0.5) * liveData.fps.step * 10,
  liveData.fps.min,
  liveData.fps.max
));
let chartCanvas, chartCtx;
let chartInited = false;
let chartDpr = 1;

function initChart() {
  if (chartInited) return;
  chartCanvas = document.getElementById('fpsChart');
  if (!chartCanvas) return;
  chartCtx = chartCanvas.getContext('2d');
  chartDpr = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = chartCanvas.clientWidth || chartCanvas.offsetWidth || 300;
  const cssHeight = chartCanvas.clientHeight || chartCanvas.offsetHeight || 80;
  chartCanvas.width = Math.round(cssWidth * chartDpr);
  chartCanvas.height = Math.round(cssHeight * chartDpr);
  chartCtx.setTransform(chartDpr, 0, 0, chartDpr, 0, 0);
  chartInited = true;
  drawChart();
}

function pushChartData(val) {
  chartData.push(val);
  if (chartData.length > 40) chartData.shift();
  if (chartInited) drawChart();
}

function getChartBounds() {
  const values = chartData.concat([Math.round(liveData.fps.val)]);
  const low = Math.min(...values, liveData.fps.min);
  const high = Math.max(...values, liveData.fps.max);
  const padding = Math.max(4, Math.round((high - low) * 0.12));
  const min = Math.max(0, low - padding);
  const max = Math.max(min + 10, high + padding);
  return { min, max };
}

function drawChart() {
  if (!chartCtx) return;
  const w = chartCanvas.width / chartDpr;
  const h = chartCanvas.height / chartDpr;
  const pad = { top: 6, bot: 6, left: 4, right: 4 };
  const dw = w - pad.left - pad.right;
  const dh = h - pad.top - pad.bot;
  const n = chartData.length;
  const { min, max } = getChartBounds();

  chartCtx.clearRect(0, 0, w, h);
  chartCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  chartCtx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pad.top + (dh / 3) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(pad.left, y);
    chartCtx.lineTo(w - pad.right, y);
    chartCtx.stroke();
  }
  const grad = chartCtx.createLinearGradient(0, pad.top, 0, h - pad.bot);
  grad.addColorStop(0, 'rgba(232,0,30,0.25)');
  grad.addColorStop(1, 'rgba(232,0,30,0.01)');

  chartCtx.beginPath();
  chartData.forEach((v, i) => {
    const x = pad.left + (i / (n - 1)) * dw;
    const y = pad.top + dh - ((v - min) / (max - min)) * dh;
    i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
  });
  chartCtx.lineTo(pad.left + dw, h - pad.bot);
  chartCtx.lineTo(pad.left, h - pad.bot);
  chartCtx.closePath();
  chartCtx.fillStyle = grad;
  chartCtx.fill();
  chartCtx.beginPath();
  chartData.forEach((v, i) => {
    const x = pad.left + (i / (n - 1)) * dw;
    const y = pad.top + dh - ((v - min) / (max - min)) * dh;
    i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
  });
  chartCtx.strokeStyle = '#e8001e';
  chartCtx.lineWidth = 1.5;
  chartCtx.lineJoin = 'round';
  chartCtx.stroke();
  chartCtx.beginPath();
  chartData.forEach((v, i) => {
    const x = pad.left + (i / (n - 1)) * dw;
    const y = pad.top + dh - ((v - min) / (max - min)) * dh;
    i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
  });
  chartCtx.strokeStyle = 'rgba(255,100,100,0.3)';
  chartCtx.lineWidth = 4;
  chartCtx.stroke();
  const lv = chartData[n - 1];
  const lx = pad.left + dw;
  const ly = pad.top + dh - ((lv - min) / (max - min)) * dh;
  chartCtx.beginPath();
  chartCtx.arc(lx, ly, 3, 0, Math.PI * 2);
  chartCtx.fillStyle = '#ff4455';
  chartCtx.shadowColor = '#e8001e';
  chartCtx.shadowBlur = 8;
  chartCtx.fill();
  chartCtx.shadowBlur = 0;
}
window.addEventListener('load', () => {
  initToggleSystem();
  initActionFeedback();
  initLauncherControl();
  updateLiveStats();
  window.addEventListener('resize', () => {
    if (chartCanvas) {
      chartInited = false;
      initChart();
    }
  });
});

window.addEventListener('beforeunload', () => resetConfiguration(false));
window.addEventListener('pagehide', () => resetConfiguration(false));


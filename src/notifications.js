// =============================================
// AI Launch Tracker — Notifications Module
// Browser notifications + EmailJS integration
// =============================================

const SETTINGS_KEY = 'ai_launch_tracker_settings';
const NOTIFIED_KEY = 'ai_launch_tracker_notified';

// =============================================
// Settings Management
// =============================================
export function getSettings() {
  const defaults = {
    browserNotifications: false,
    emailNotifications: false,
    email: '',
    emailFrequency: 'daily',
    emailjsService: '',
    emailjsTemplate: '',
    emailjsKey: '',
    keywords: 'AI, GPT, LLM, OpenAI, Claude, Gemini, launch, release, new model'
  };

  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) };
    }
  } catch {}

  return defaults;
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// =============================================
// Browser Notifications
// =============================================
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return { granted: false, reason: 'Browser does not support notifications' };
  }

  if (Notification.permission === 'granted') {
    return { granted: true };
  }

  if (Notification.permission === 'denied') {
    return { granted: false, reason: 'Notifications were previously denied. Please enable them in browser settings.' };
  }

  const permission = await Notification.requestPermission();
  return {
    granted: permission === 'granted',
    reason: permission !== 'granted' ? 'Permission was not granted' : undefined
  };
}

export function sendBrowserNotification(title, body, url) {
  if (Notification.permission !== 'granted') return;

  const notif = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `ai-launch-${Date.now()}`,
    requireInteraction: false,
    silent: false
  });

  notif.onclick = () => {
    window.focus();
    if (url) window.open(url, '_blank');
    notif.close();
  };

  // Auto-close after 8 seconds
  setTimeout(() => notif.close(), 8000);
}

// =============================================
// Check for new items & notify
// =============================================
export function checkAndNotify(newsItems) {
  const settings = getSettings();
  if (!settings.browserNotifications) return [];

  // Get previously notified IDs
  let notifiedIds = [];
  try {
    notifiedIds = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]');
  } catch {}

  const newItems = newsItems.filter(item => !notifiedIds.includes(item.id));

  if (newItems.length > 0) {
    // On first load, don't blast notifications — just mark as seen
    if (notifiedIds.length === 0) {
      const allIds = newsItems.map(i => i.id);
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify(allIds));
      return [];
    }

    // Send browser notification for top 3 new items
    const topNew = newItems.slice(0, 3);
    topNew.forEach(item => {
      sendBrowserNotification(
        `🚀 ${item.title}`,
        `${item.source} • ${item.category}`,
        item.url
      );
    });

    if (newItems.length > 3) {
      sendBrowserNotification(
        `🔥 ${newItems.length} New AI Launches`,
        'Check AI Launch Tracker for all the latest updates',
        window.location.href
      );
    }

    // Update notified list (keep last 500)
    const updatedIds = [...notifiedIds, ...newItems.map(i => i.id)].slice(-500);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(updatedIds));
  }

  return newItems;
}

// =============================================
// EmailJS Integration
// =============================================
export async function sendEmailNotification(newsItems) {
  const settings = getSettings();

  if (!settings.emailNotifications) return false;
  if (!settings.emailjsService || !settings.emailjsTemplate || !settings.emailjsKey) {
    console.warn('EmailJS not configured');
    return false;
  }

  // Load EmailJS SDK if not loaded
  if (!window.emailjs) {
    await loadEmailJS();
  }

  if (!window.emailjs) {
    console.error('Failed to load EmailJS SDK');
    return false;
  }

  try {
    window.emailjs.init(settings.emailjsKey);

    const itemsList = newsItems.slice(0, 10).map(item =>
      `• ${item.title} (${item.source}) — ${item.url}`
    ).join('\n');

    await window.emailjs.send(settings.emailjsService, settings.emailjsTemplate, {
      to_email: settings.email,
      subject: `🚀 AI Launch Tracker — ${newsItems.length} New Launches`,
      message: `Hi!\n\nHere are the latest AI launches:\n\n${itemsList}\n\n— AI Launch Tracker`,
      from_name: 'AI Launch Tracker'
    });

    return true;
  } catch (err) {
    console.error('EmailJS send error:', err);
    return false;
  }
}

async function loadEmailJS() {
  return new Promise((resolve) => {
    if (window.emailjs) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload = resolve;
    script.onerror = resolve; // still resolve, we check window.emailjs
    document.head.appendChild(script);
  });
}

// =============================================
// Toast Notifications (in-app)
// =============================================
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${getToastIcon(type)}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getToastIcon(type) {
  switch (type) {
    case 'success': return '✅';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    default: return 'ℹ️';
  }
}

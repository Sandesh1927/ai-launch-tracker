// =============================================
// AI Launch Tracker — Main Entry Point
// =============================================

import { fetchAllNews, timeAgo, clearCache } from './news-fetcher.js';
import {
  getSettings, saveSettings,
  requestNotificationPermission,
  checkAndNotify, showToast,
  sendEmailNotification
} from './notifications.js';
import { fetchYouTubeVideos, getAIYouTubeChannels, formatViews, clearYTCache } from './youtube.js';

// =============================================
// State
// =============================================
let allNews = [];
let filteredNews = [];
let allVideos = [];
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';
let refreshInterval = null;
let deferredPrompt; // For PWA install

// =============================================
// DOM Elements
// =============================================
const $ = id => document.getElementById(id);

const els = {
  // Navigation
  navTabs: document.querySelectorAll('.nav-tab'),
  sectionNews: $('section-news'),
  sectionYoutube: $('section-youtube'),

  // News Elements
  newsGrid: $('news-grid'),
  loading: $('loading-container'),
  empty: $('empty-state'),
  searchInput: $('search-input'),
  sortSelect: $('sort-select'),

  // YouTube Elements
  ytGrid: $('yt-grid'),
  ytLoading: $('yt-loading'),
  ytEmpty: $('yt-empty'),
  channelsScroll: $('channels-scroll'),
  btnRetryYt: $('btn-retry-yt'),

  // Stats
  statTotal: $('stat-total'),
  statToday: $('stat-today'),
  statWeek: $('stat-week'),
  statSources: $('stat-sources'),
  lastUpdated: $('last-updated'),

  // Modals & Header Actions
  notifBadge: $('notif-badge'),
  btnRefresh: $('btn-refresh'),
  btnShare: $('btn-share'),
  btnSettings: $('btn-settings'),
  btnNotifications: $('btn-notifications'),

  // Install Banner
  installBanner: $('install-banner'),
  btnInstall: $('btn-install'),
  btnDismissInstall: $('btn-dismiss-install'),

  // Share Modal
  shareModal: $('share-modal'),
  shareModalClose: $('share-modal-close'),
  shareUrl: $('share-url'),
  btnCopyUrl: $('btn-copy-url'),
  shareWhatsapp: $('share-whatsapp'),
  shareTwitter: $('share-twitter'),
  shareTelegram: $('share-telegram'),
  shareLinkedin: $('share-linkedin'),

  // Settings Modal
  settingsModal: $('settings-modal'),
  modalClose: $('modal-close'),
  toggleBrowserNotif: $('toggle-browser-notif'),
  toggleEmailNotif: $('toggle-email-notif'),
  notifStatus: $('notif-status'),
  emailInput: $('email-input'),
  emailFrequency: $('email-frequency'),
  emailjsService: $('emailjs-service'),
  emailjsTemplate: $('emailjs-template'),
  emailjsKey: $('emailjs-key'),
  keywordsInput: $('keywords-input'),
  btnSaveSettings: $('btn-save-settings'),
  emailjsSetup: $('emailjs-setup')
};

// =============================================
// Initialization
// =============================================
async function init() {
  console.log('🚀 AI Launch Tracker initializing...');

  // Setup PWA functionality
  initPWA();

  // Load settings into UI
  loadSettingsUI();

  // Init share links
  initShareLinks();

  // Bind events
  bindEvents();

  // Fetch initial data
  await loadNews();

  // Render YouTube Channels immediately
  renderYouTubeChannels();

  // Set up auto-refresh
  refreshInterval = setInterval(() => {
    loadNews(true);
    loadYouTube(true);
  }, 5 * 60 * 1000); // 5 mins

  console.log('✅ AI Launch Tracker ready!');
}

// =============================================
// PWA & Service Worker
// =============================================
function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered!', reg))
      .catch(err => console.error('SW failed:', err));

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'REFRESH_NEWS') {
        loadNews(true);
      }
    });
  }

  // Handle PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Check if dismissed recently
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (!dismissed || Date.now() - parseInt(dismissed) > 7 * 24 * 60 * 60 * 1000) {
      els.installBanner.style.display = 'block';
    }
  });

  // App successfully installed
  window.addEventListener('appinstalled', () => {
    els.installBanner.style.display = 'none';
    deferredPrompt = null;
    showToast('App installed successfully!', 'success');
  });
}

// =============================================
// Data Loading (News)
// =============================================
async function loadNews(isRefresh = false) {
  if (!isRefresh) {
    els.loading.style.display = 'flex';
    els.newsGrid.style.display = 'none';
    els.empty.style.display = 'none';
  }

  try {
    const settings = getSettings();
    const customKeywords = settings.keywords
      ? settings.keywords.split(',').map(k => k.trim()).filter(Boolean)
      : [];

    if (isRefresh) clearCache();

    allNews = await fetchAllNews(customKeywords);

    // Notifications
    const newItems = checkAndNotify(allNews);
    if (newItems.length > 0 && isRefresh) {
      showToast(`🔥 ${newItems.length} new AI launches found!`, 'success');
    }

    // Update UI
    updateStats();
    applyFiltersAndRender();
    updateLastSyncTime();

  } catch (err) {
    console.error('Data error:', err);
    if (!isRefresh) showToast('Failed to load tracking data.', 'error');
  } finally {
    els.loading.style.display = 'none';
  }
}

// =============================================
// Data Loading (YouTube)
// =============================================
let youtubeLoaded = false;
async function loadYouTube(isRefresh = false) {
  if (youtubeLoaded && !isRefresh) return;
  
  if (!isRefresh) {
    els.ytLoading.style.display = 'flex';
    els.ytGrid.style.display = 'none';
    els.ytEmpty.style.display = 'none';
  }

  try {
    if (isRefresh) clearYTCache();
    
    allVideos = await fetchYouTubeVideos();
    
    els.ytLoading.style.display = 'none';
    
    if (allVideos.length > 0) {
      els.ytGrid.style.display = 'grid';
      renderVideos(allVideos);
      youtubeLoaded = true;
    } else {
      els.ytEmpty.style.display = 'block';
    }
  } catch (err) {
    console.error('YT Fetch error:', err);
    els.ytLoading.style.display = 'none';
    els.ytEmpty.style.display = 'block';
  }
}

// =============================================
// UI Rendering
// =============================================
function applyFiltersAndRender() {
  filteredNews = allNews.filter(item => {
    const matchesFilter = currentFilter === 'all' || item.category === currentFilter;
    const matchesSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  filteredNews.sort((a, b) => {
    switch (currentSort) {
      case 'oldest': return a.timestamp - b.timestamp;
      case 'score': return b.score - a.score;
      default: return b.timestamp - a.timestamp;
    }
  });

  renderNews(filteredNews);
}

function renderNews(items) {
  if (items.length === 0) {
    els.newsGrid.style.display = 'none';
    els.empty.style.display = 'block';
    return;
  }

  els.empty.style.display = 'none';
  els.newsGrid.style.display = 'grid';

  els.newsGrid.innerHTML = items.map((item, index) => `
    <article class="news-card" style="animation-delay: ${index * 0.05}s;" data-url="${item.url}">
      <div class="card-header">
        <span class="card-category category-${item.category}">
          ${getCategoryEmoji(item.category)} ${item.category}
        </span>
        <span class="card-score">
          <svg viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          ${item.score}
        </span>
      </div>
      <h3 class="card-title">${escapeHtml(item.title)}</h3>
      <p class="card-description">${escapeHtml(item.description)}</p>
      <div class="card-footer">
        <span class="card-source">
          <span class="source-icon">${item.sourceIcon}</span>
          ${item.source}
        </span>
        <span class="card-time">${timeAgo(item.timestamp)}</span>
        <a href="${item.url}" target="_blank" rel="noopener" class="card-link" onclick="event.stopPropagation();">
          Open
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
        </a>
      </div>
    </article>
  `).join('');

  els.newsGrid.querySelectorAll('.news-card').forEach(card => {
    card.addEventListener('click', () => {
      window.open(card.dataset.url, '_blank');
    });
  });
}

function renderYouTubeChannels() {
  const channels = getAIYouTubeChannels();
  els.channelsScroll.innerHTML = channels.map(c => `
    <a href="${c.url}" target="_blank" rel="noopener" class="channel-card">
      <div class="channel-name">${c.name}</div>
      <div class="channel-desc">${c.desc}</div>
    </a>
  `).join('');
}

function renderVideos(videos) {
  els.ytGrid.innerHTML = videos.map((v, i) => `
    <article class="yt-card" style="animation-delay: ${i * 0.05}s;" data-url="${v.url}">
      <div class="yt-thumb">
        <img src="${v.thumbnail}" alt="${escapeHtml(v.title)}" loading="lazy">
        <span class="yt-duration">${v.duration}</span>
        <div class="yt-play-overlay">
          <div class="yt-play-btn">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>
      <div class="yt-info">
        <h3 class="yt-title">${escapeHtml(v.title)}</h3>
        <div class="yt-channel">${escapeHtml(v.channel)}</div>
        <div class="yt-meta">
          ${formatViews(v.views)} • ${timeAgo(v.published)}
        </div>
      </div>
    </article>
  `).join('');

  els.ytGrid.querySelectorAll('.yt-card').forEach(card => {
    card.addEventListener('click', () => {
      window.open(card.dataset.url, '_blank');
    });
  });
}

function updateStats() {
  const now = Date.now() / 1000;
  const today = allNews.filter(n => n.timestamp > now - 86400).length;
  const week = allNews.filter(n => n.timestamp > now - 604800).length;
  const sources = new Set(allNews.map(n => n.source));

  animateNumber(els.statTotal, allNews.length);
  animateNumber(els.statToday, today);
  animateNumber(els.statWeek, week);
  animateNumber(els.statSources, sources.size);
}

function animateNumber(el, target) {
  const start = parseInt(el.textContent) || 0;
  const duration = 800, startTime = performance.now();
  function update(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function updateLastSyncTime() {
  els.lastUpdated.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// =============================================
// Helper: Share Links & Modals
// =============================================
function initShareLinks() {
  const url = window.location.href;
  const text = encodeURIComponent('Tracking all the latest AI product launches and news on AI Tracker! 🚀🧠');
  
  els.shareUrl.value = url;
  els.shareWhatsapp.href = `https://api.whatsapp.com/send?text=${text}%20${encodeURIComponent(url)}`;
  els.shareTwitter.href = `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`;
  els.shareTelegram.href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`;
  els.shareLinkedin.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

// =============================================
// Event Bindings
// =============================================
function bindEvents() {
  // Navigation Tabs
  els.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      els.navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const target = tab.dataset.section;
      if (target === 'news') {
        els.sectionNews.style.display = 'block';
        els.sectionYoutube.style.display = 'none';
      } else {
        els.sectionNews.style.display = 'none';
        els.sectionYoutube.style.display = 'block';
        if (!youtubeLoaded) loadYouTube();
      }
    });
  });

  // Header Actions
  els.btnRefresh.addEventListener('click', () => {
    showToast('Refreshing news and videos...');
    loadNews(true);
    if (youtubeLoaded) loadYouTube(true);
  });
  
  els.btnShare.addEventListener('click', () => {
    els.shareModal.style.display = 'flex';
  });
  
  els.btnCopyUrl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.shareUrl.value);
      els.btnCopyUrl.textContent = 'Copied!';
      setTimeout(() => els.btnCopyUrl.textContent = 'Copy', 2000);
      showToast('Link copied to clipboard!', 'success');
    } catch {
      els.shareUrl.select();
      document.execCommand('copy');
    }
  });
  
  els.shareModalClose.addEventListener('click', () => els.shareModal.style.display = 'none');
  els.shareModal.addEventListener('click', e => {
    if (e.target === els.shareModal) els.shareModal.style.display = 'none';
  });

  // PWA Install Banner
  els.btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        els.installBanner.style.display = 'none';
      }
      deferredPrompt = null;
    }
  });

  els.btnDismissInstall.addEventListener('click', () => {
    els.installBanner.style.display = 'none';
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
  });

  // Search & Filter (News)
  let searchTimeout;
  els.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value;
      if (els.sectionYoutube.style.display === 'block') {
         // Auto-switch back to news if searching
         document.querySelector('[data-section="news"]').click();
      }
      applyFiltersAndRender();
    }, 300);
  });

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      applyFiltersAndRender();
    });
  });

  els.sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    applyFiltersAndRender();
  });

  els.btnRetryYt.addEventListener('click', () => loadYouTube(true));

  // Settings Modal
  els.btnSettings.addEventListener('click', () => els.settingsModal.style.display = 'flex');
  els.btnNotifications.addEventListener('click', () => els.settingsModal.style.display = 'flex');
  els.modalClose.addEventListener('click', () => els.settingsModal.style.display = 'none');
  els.settingsModal.addEventListener('click', e => {
    if (e.target === els.settingsModal) els.settingsModal.style.display = 'none';
  });

  els.toggleBrowserNotif.addEventListener('change', async () => {
    if (els.toggleBrowserNotif.checked) {
      const { granted, reason } = await requestNotificationPermission();
      if (!granted) {
        els.toggleBrowserNotif.checked = false;
        els.notifStatus.textContent = `❌ ${reason}`;
        showToast(reason, 'warning');
      } else {
        els.notifStatus.textContent = '✅ Browser notifications enabled';
        showToast('Browser notifications enabled!', 'success');
      }
    } else {
      els.notifStatus.textContent = '';
    }
  });

  els.toggleEmailNotif.addEventListener('change', () => {
    els.emailjsSetup.style.display = els.toggleEmailNotif.checked ? 'block' : 'none';
  });

  els.btnSaveSettings.addEventListener('click', () => {
    saveSettings({
      browserNotifications: els.toggleBrowserNotif.checked,
      emailNotifications: els.toggleEmailNotif.checked,
      email: els.emailInput.value,
      emailFrequency: els.emailFrequency.value,
      emailjsService: els.emailjsService.value,
      emailjsTemplate: els.emailjsTemplate.value,
      emailjsKey: els.emailjsKey.value,
      keywords: els.keywordsInput.value
    });
    showToast('Settings saved!', 'success');
    els.settingsModal.style.display = 'none';
    clearCache();
    loadNews(true);
  });

  // Hotkeys
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      els.settingsModal.style.display = 'none';
      els.shareModal.style.display = 'none';
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement !== els.searchInput) {
      e.preventDefault();
      els.searchInput.focus();
    }
  });
}

function loadSettingsUI() {
  const settings = getSettings();
  els.toggleBrowserNotif.checked = settings.browserNotifications;
  els.toggleEmailNotif.checked = settings.emailNotifications;
  els.emailInput.value = settings.email;
  els.emailFrequency.value = settings.emailFrequency;
  els.emailjsService.value = settings.emailjsService;
  els.emailjsTemplate.value = settings.emailjsTemplate;
  els.emailjsKey.value = settings.emailjsKey;
  els.keywordsInput.value = settings.keywords;
  els.emailjsSetup.style.display = settings.emailNotifications ? 'block' : 'none';

  if (settings.browserNotifications && Notification.permission === 'granted') {
    els.notifStatus.textContent = '✅ Browser notifications enabled';
  }
}

function getCategoryEmoji(cat) {
  const emojis = { launch: '🚀', model: '🧠', tool: '🛠️', research: '📄', funding: '💰' };
  return emojis[cat] || '📰';
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);

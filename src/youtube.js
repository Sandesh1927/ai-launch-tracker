// =============================================
// AI Launch Tracker — YouTube Module
// Fetches AI-related YouTube videos
// =============================================

const YT_CACHE_KEY = 'ai_launch_tracker_yt_cache';
const YT_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// YouTube search queries for AI content
const AI_SEARCH_QUERIES = [
  'AI launch 2026',
  'new AI tool release',
  'artificial intelligence latest news',
  'AI model announcement',
  'OpenAI news today',
  'AI product demo',
  'machine learning breakthrough',
  'AI startup launch',
  'LLM new release',
  'generative AI update'
];

// =============================================
// Fetch YouTube Videos via Invidious API (no key needed)
// =============================================
const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks'
];

async function tryInvidiousInstance(instance, query) {
  const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=upload_date&date=month&page=1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function searchInvidious(query) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const results = await tryInvidiousInstance(instance, query);
      if (Array.isArray(results) && results.length > 0) {
        return results
          .filter(v => v.type === 'video')
          .slice(0, 5)
          .map(v => ({
            id: v.videoId,
            title: v.title,
            channel: v.author || 'Unknown',
            channelUrl: v.authorUrl ? `https://youtube.com${v.authorUrl}` : '#',
            thumbnail: v.videoThumbnails?.[4]?.url ||
                       v.videoThumbnails?.[0]?.url ||
                       `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
            url: `https://youtube.com/watch?v=${v.videoId}`,
            views: v.viewCount || 0,
            published: v.published || 0,
            duration: formatDuration(v.lengthSeconds || 0),
            description: (v.description || '').substring(0, 150)
          }));
      }
    } catch (err) {
      console.warn(`Invidious ${instance} failed for "${query}":`, err.message);
    }
  }
  return [];
}

// Fallback: fetch directly from YouTube page  
async function fetchYouTubeRSS(query) {
  try {
    // Use a CORS proxy for YouTube RSS
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=CAISBAgCEAE%253D`
    )}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const html = await res.text();

    // Extract video data from YouTube HTML
    const videoIds = [];
    const regex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (!videoIds.includes(match[1])) {
        videoIds.push(match[1]);
      }
      if (videoIds.length >= 8) break;
    }

    return videoIds.map(id => ({
      id,
      title: '',
      channel: '',
      channelUrl: '#',
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      url: `https://youtube.com/watch?v=${id}`,
      views: 0,
      published: Date.now() / 1000,
      duration: '',
      description: ''
    }));
  } catch {
    return [];
  }
}

// =============================================
// Main fetch function
// =============================================
export async function fetchYouTubeVideos() {
  // Check cache
  const cached = getCachedVideos();
  if (cached) return cached;

  console.log('🎥 Fetching AI YouTube videos...');

  // Pick 3 random queries
  const shuffled = AI_SEARCH_QUERIES.sort(() => Math.random() - 0.5);
  const selectedQueries = shuffled.slice(0, 3);

  const allResults = [];

  for (const query of selectedQueries) {
    const results = await searchInvidious(query);
    allResults.push(...results);

    if (allResults.length >= 12) break;
  }

  // Deduplicate by video ID
  const seen = new Set();
  const unique = allResults.filter(v => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  // Cache results
  cacheVideos(unique);

  return unique;
}

// =============================================
// Curated YouTube channels for AI news
// =============================================
export function getAIYouTubeChannels() {
  return [
    { name: 'Two Minute Papers', url: 'https://youtube.com/@TwoMinutePapers', desc: 'AI research explained visually' },
    { name: 'Yannic Kilcher', url: 'https://youtube.com/@YannicKilcher', desc: 'Deep dives into AI papers' },
    { name: 'AI Explained', url: 'https://youtube.com/@aiexplained-official', desc: 'AI news & analysis' },
    { name: 'Matt Wolfe', url: 'https://youtube.com/@maboroshi', desc: 'AI tools & launches weekly' },
    { name: 'The AI Advantage', url: 'https://youtube.com/@theaiadvantage', desc: 'Practical AI tutorials' },
    { name: 'Fireship', url: 'https://youtube.com/@Fireship', desc: 'Fast-paced tech & AI news' },
    { name: 'Wes Roth', url: 'https://youtube.com/@WesRoth', desc: 'Daily AI news coverage' },
    { name: 'Matthew Berman', url: 'https://youtube.com/@MatthewBerman', desc: 'AI tool reviews & news' }
  ];
}

// =============================================
// Utilities
// =============================================
function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatViews(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function getCachedVideos() {
  try {
    const cached = localStorage.getItem(YT_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > YT_CACHE_DURATION) {
      localStorage.removeItem(YT_CACHE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function cacheVideos(data) {
  try {
    localStorage.setItem(YT_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

export function clearYTCache() {
  localStorage.removeItem(YT_CACHE_KEY);
}

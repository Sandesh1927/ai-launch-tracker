// =============================================
// AI Launch Tracker — News Fetcher Module
// Aggregates AI news from multiple sources
// =============================================

const AI_KEYWORDS = [
  'AI', 'artificial intelligence', 'GPT', 'LLM', 'machine learning',
  'OpenAI', 'Claude', 'Anthropic', 'Google AI', 'Gemini', 'Meta AI',
  'Llama', 'neural network', 'deep learning', 'transformer',
  'diffusion', 'Midjourney', 'Stable Diffusion', 'DALL-E', 'Sora',
  'ChatGPT', 'copilot', 'AI agent', 'AGI', 'foundation model',
  'generative AI', 'gen AI', 'NLP', 'computer vision', 'robotics',
  'autonomous', 'fine-tuning', 'inference', 'AI startup',
  'OpenCrew', 'Hugging Face', 'Mistral', 'Cohere', 'Perplexity',
  'AI model', 'large language model', 'multimodal', 'embedding',
  'RAG', 'retrieval augmented', 'AI launch', 'AI tool', 'AI platform'
];

const CACHE_KEY = 'ai_launch_tracker_cache';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Categorize a news item based on title + text
function categorize(title, text = '') {
  const combined = `${title} ${text}`.toLowerCase();

  if (/launch|release|announc|unveil|introduc|debut|ship|roll.?out|now available|open.?source/i.test(combined)) {
    return 'launch';
  }
  if (/gpt|llm|model|param|billion|weights|checkpoint|fine.?tun|benchmark/i.test(combined)) {
    return 'model';
  }
  if (/tool|sdk|api|framework|library|platform|plugin|extension|app/i.test(combined)) {
    return 'tool';
  }
  if (/paper|research|study|arxiv|breakthrough|discover|experiment/i.test(combined)) {
    return 'research';
  }
  if (/fund|invest|rais|valuat|\$\d|billion|million|series [a-d]|ipo|acquisition|acquir/i.test(combined)) {
    return 'funding';
  }
  return 'launch'; // default AI-related to launch
}

// Check if content is AI-related
function isAIRelated(title, text = '', customKeywords = []) {
  const combined = `${title} ${text}`.toLowerCase();
  const allKeywords = [...AI_KEYWORDS, ...customKeywords];
  return allKeywords.some(kw => combined.includes(kw.toLowerCase()));
}

// Format time ago
function timeAgo(timestamp) {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric'
  });
}

// =============================================
// Source: Hacker News API
// =============================================
async function fetchHackerNews() {
  try {
    // Get top, new, and best stories
    const [topRes, newRes, bestRes] = await Promise.all([
      fetch('https://hacker-news.firebaseio.com/v0/topstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/newstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/beststories.json')
    ]);

    const topIds = await topRes.json();
    const newIds = await newRes.json();
    const bestIds = await bestRes.json();

    // Combine and deduplicate, take first 150
    const allIds = [...new Set([...topIds.slice(0, 60), ...newIds.slice(0, 60), ...bestIds.slice(0, 60)])];

    // Fetch story details in batches
    const batchSize = 30;
    const stories = [];

    for (let i = 0; i < Math.min(allIds.length, 120); i += batchSize) {
      const batch = allIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(id =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
            .then(r => r.json())
            .catch(() => null)
        )
      );
      stories.push(...batchResults.filter(Boolean));
    }

    return stories
      .filter(s => s && s.title && s.type === 'story')
      .filter(s => isAIRelated(s.title, s.text || ''))
      .map(s => ({
        id: `hn-${s.id}`,
        title: s.title,
        description: s.text
          ? s.text.replace(/<[^>]*>/g, '').substring(0, 200) + '...'
          : `Discussion on Hacker News with ${s.score || 0} points`,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        discussionUrl: `https://news.ycombinator.com/item?id=${s.id}`,
        score: s.score || 0,
        timestamp: s.time,
        source: 'Hacker News',
        sourceIcon: 'HN',
        category: categorize(s.title, s.text || ''),
        comments: s.descendants || 0
      }));
  } catch (err) {
    console.error('HackerNews fetch error:', err);
    return [];
  }
}

// =============================================
// Source: Reddit (r/MachineLearning, r/artificial)
// =============================================
async function fetchReddit() {
  const subreddits = ['MachineLearning', 'artificial', 'OpenAI', 'LocalLLaMA', 'singularity'];
  const results = [];

  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`, {
        headers: { 'User-Agent': 'AI-Launch-Tracker/1.0' }
      });
      const data = await res.json();

      if (data?.data?.children) {
        const posts = data.data.children
          .filter(p => p.data && !p.data.stickied)
          .filter(p => isAIRelated(p.data.title, p.data.selftext || ''))
          .map(p => ({
            id: `reddit-${p.data.id}`,
            title: p.data.title,
            description: p.data.selftext
              ? p.data.selftext.substring(0, 200) + '...'
              : `Reddit discussion on r/${sub}`,
            url: p.data.url?.startsWith('http')
              ? p.data.url
              : `https://reddit.com${p.data.permalink}`,
            discussionUrl: `https://reddit.com${p.data.permalink}`,
            score: p.data.score || 0,
            timestamp: p.data.created_utc,
            source: `r/${sub}`,
            sourceIcon: 'R',
            category: categorize(p.data.title, p.data.selftext || ''),
            comments: p.data.num_comments || 0
          }));
        results.push(...posts);
      }
    } catch (err) {
      console.error(`Reddit r/${sub} fetch error:`, err);
    }
  }

  return results;
}

// =============================================
// Aggregate all sources
// =============================================
export async function fetchAllNews(customKeywords = []) {
  // Check cache first
  const cached = getCachedNews();
  if (cached) {
    return filterByCustomKeywords(cached, customKeywords);
  }

  // Fetch from all sources in parallel
  const [hnNews, redditNews] = await Promise.allSettled([
    fetchHackerNews(),
    fetchReddit()
  ]);

  const allNews = [
    ...(hnNews.status === 'fulfilled' ? hnNews.value : []),
    ...(redditNews.status === 'fulfilled' ? redditNews.value : [])
  ];

  // Deduplicate by similar titles
  const uniqueNews = deduplicateNews(allNews);

  // Sort by timestamp (newest first)
  uniqueNews.sort((a, b) => b.timestamp - a.timestamp);

  // Cache results
  cacheNews(uniqueNews);

  return filterByCustomKeywords(uniqueNews, customKeywords);
}

function filterByCustomKeywords(news, customKeywords) {
  if (!customKeywords || customKeywords.length === 0) return news;
  return news.filter(item =>
    isAIRelated(item.title, item.description, customKeywords)
  );
}

function deduplicateNews(news) {
  const seen = new Map();
  return news.filter(item => {
    // Normalize title for comparison
    const key = item.title.toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 60);

    if (seen.has(key)) {
      // Keep the one with higher score
      const existing = seen.get(key);
      if (item.score > existing.score) {
        seen.set(key, item);
        return true;
      }
      return false;
    }
    seen.set(key, item);
    return true;
  });
}

// =============================================
// Cache Management
// =============================================
function getCachedNews() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function cacheNews(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch {
    // Storage full, ignore
  }
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}

export { timeAgo, isAIRelated, categorize };

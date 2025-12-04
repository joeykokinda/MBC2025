// BACKGROUND SERVICE WORKER
// This file runs in the background and handles:
// - Opening the side panel when extension icon is clicked
// - Fetching real markets from Polymarket Gamma API
// - Sending market data to the side panel UI
// - Message passing between content script and side panel

const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const GAMMA_EVENTS_URL = 'https://gamma-api.polymarket.com/events';
const GAMMA_TAGS_URL = 'https://gamma-api.polymarket.com/tags';
const DEFAULT_MARKET_LIMIT = 6;
const MAX_KEYWORDS = 8;
const STOPWORDS = new Set([
  'the','and','for','with','that','this','from','have','will','your','about',
  'https','http','com','www','are','was','but','not','you','has','had','its',
  'into','more','over','when','what','why','who','how','can','all','just','they',
  'their','them','get','got','out','his','her','him','she','our','also','use',
  'using','used','been','than','then','were','any','new','one','two','three',
  'via','amp','too','may','off','per','why','did','does','had','ever','such',
  'those','these','there','here','our','ours','very','much','like','make','made',
  'still','each','even','many','most','some','more','less','rt','img','video',
  'home','hour','hours','ago','minute','minutes','second','seconds','view','views',
  'tweet','tweets','tweeted','repost','reposts','reply','replies','like','likes',
  'follow','follows','following','followers','profile','people','click','link'
]);

const tabContexts = new Map();
let lastActiveTabId = null;
let lastScrapableTabId = null;
let cachedTags = [];
let lastTagFetch = 0;
const TAG_CACHE_TTL = 1000 * 60 * 10; // 10 minutes
const tagSlugCache = new Map();
const TAG_SLUG_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

// Calculate statistics from markets array
function calculateStats(markets) {
  if (!markets || markets.length === 0) {
    return {
      totalMarkets: 0,
      avgYesOdds: 0,
      avgNoOdds: 0,
      totalVolume: 0
    };
  }

  const yesOdds = markets
    .map(m => parseFloat(m.outcomes?.[0]?.price || 0))
    .filter(odds => odds > 0);
  
  const noOdds = markets
    .map(m => parseFloat(m.outcomes?.[1]?.price || 0))
    .filter(odds => odds > 0);

  const volumes = markets
    .map(m => parseFloat(m.volume || 0))
    .filter(v => v > 0);

  return {
    totalMarkets: markets.length,
    avgYesOdds: yesOdds.length > 0 ? yesOdds.reduce((a, b) => a + b, 0) / yesOdds.length : 0,
    avgNoOdds: noOdds.length > 0 ? noOdds.reduce((a, b) => a + b, 0) / noOdds.length : 0,
    totalVolume: volumes.reduce((a, b) => a + b, 0)
  };
}

function getEmptyStats() {
  return {
    totalMarkets: 0,
    avgYesOdds: 0,
    avgNoOdds: 0,
    totalVolume: 0
  };
}

function normalizeToken(token) {
  if (!token) return '';
  const cleaned = token
    .trim()
    .replace(/^[#@$]+/, '')
    .replace(/[^a-zA-Z0-9+-]/g, '')
    .toLowerCase();
  if (cleaned.length < 2) return '';
  if (STOPWORDS.has(cleaned)) return '';
  return cleaned;
}

function extractKeywordsFromPage(pageData) {
  if (!pageData) return [];

  const scores = new Map();
  const limitedText = (pageData.text || '').slice(0, 6000);
  const title = pageData.title || '';

  function addToken(token, weight = 1) {
    const normalized = normalizeToken(token);
    if (!normalized) return;
    const current = scores.get(normalized) || 0;
    scores.set(normalized, current + weight);
  }

  function processChunk(chunk, weight) {
    if (!chunk) return;
    const specials = chunk.match(/([#@$][A-Za-z0-9_]+)/g);
    specials?.forEach((special) => addToken(special, weight + 1));

    const words = chunk.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g);
    words?.forEach((word) => addToken(word, weight));
  }

  processChunk(title, 3);
  processChunk(limitedText, 1);

  const sorted = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYWORDS)
    .map(([token]) => token);

  console.debug('[PolyFinder] Keyword extraction', {
    title: pageData.title || '',
    textPreview: (pageData.text || '').slice(0, 200),
    keywords: sorted
  });

  return sorted;
}

function buildMarketUrl(market) {
  const marketId = market.id || '';
  const marketSlug = market.slug || '';
  const eventSlug = market.events?.[0]?.slug || '';

  if (eventSlug && marketSlug && marketId) {
    return `https://polymarket.com/event/${eventSlug}/${marketSlug}?tid=${marketId}`;
  }
  if (marketSlug && marketId) {
    return `https://polymarket.com/event/${marketSlug}?tid=${marketId}`;
  }
  return '#';
}

function parseOutcomePrices(market) {
  if (Array.isArray(market.outcomePrices)) {
    return market.outcomePrices.map((price) => parseFloat(price) || 0).slice(0, 2);
  }

  if (typeof market.outcomePrices === 'string') {
    try {
      const parsed = JSON.parse(market.outcomePrices);
      if (Array.isArray(parsed)) {
        return parsed.map((price) => parseFloat(price) || 0).slice(0, 2);
      }
    } catch (err) {
      console.error('Error parsing outcomePrices:', err);
    }
  }

  return [0, 0];
}

function mapMarketResponse(market) {
  const prices = parseOutcomePrices(market);
  return {
    id: market.id || '',
    question: market.question || 'Unknown Market',
    outcomes: [
      { price: prices[0].toString() },
      { price: prices[1].toString() }
    ],
    volume: market.volumeNum || market.volume || 0,
    url: buildMarketUrl(market)
  };
}

async function fetchMarketsFromAPI(searchQuery = '', limit = DEFAULT_MARKET_LIMIT, extraParams = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: '0',
    closed: 'false',
    active: 'true',
    order: 'volumeNum',
    ascending: 'false'
  });

  if (searchQuery) {
    params.set('search', searchQuery);
  }

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const url = `${GAMMA_API_URL}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Gamma API request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(mapMarketResponse);
}

function mergeMarkets(primary, secondary) {
  const merged = [...primary];
  const seen = new Set(primary.map((market) => market.id));
  secondary.forEach((market) => {
    if (!seen.has(market.id)) {
      merged.push(market);
      seen.add(market.id);
    }
  });
  return merged;
}

async function fetchMarketsWithFallback(primaryQuery, fallbackQueries = []) {
  let markets = [];
  let errorMessage = null;
  const attempted = new Set();

  async function attempt(query) {
    if (!query) return [];
    const normalized = query.toLowerCase();
    if (attempted.has(normalized)) return [];
    attempted.add(normalized);

    try {
      return await fetchMarketsFromAPI(query);
    } catch (err) {
      console.error('Error fetching markets for query:', query, err);
      errorMessage = 'Unable to fetch markets from Polymarket';
      return [];
    }
  }

  if (primaryQuery) {
    markets = await attempt(primaryQuery);
  }

  for (const fallback of fallbackQueries) {
    if (markets.length >= DEFAULT_MARKET_LIMIT) break;
    const fallbackResults = await attempt(fallback);
    markets = mergeMarkets(markets, fallbackResults);
  }

  return {
    markets: markets.slice(0, DEFAULT_MARKET_LIMIT),
    errorMessage
  };
}

async function getAvailableTags() {
  const now = Date.now();
  if (cachedTags.length > 0 && now - lastTagFetch < TAG_CACHE_TTL) {
    return cachedTags;
  }

  try {
    const response = await fetch(GAMMA_TAGS_URL);
    if (!response.ok) {
      throw new Error(`Tags request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      cachedTags = data;
      lastTagFetch = now;
      return cachedTags;
    }
  } catch (err) {
    console.error('Error fetching tags list:', err);
  }

  return cachedTags;
}

async function fetchMarketsFromTagSlug(slug) {
  if (!slug) return [];

  const normalizedSlug = slug.toLowerCase();
  const cacheEntry = tagSlugCache.get(normalizedSlug);
  const now = Date.now();
  if (cacheEntry && now - cacheEntry.timestamp < TAG_SLUG_CACHE_TTL) {
    return cacheEntry.markets;
  }

  const params = new URLSearchParams({
    tag_slug: normalizedSlug,
    closed: 'false',
    limit: String(DEFAULT_MARKET_LIMIT),
    offset: '0'
  });

  try {
    const response = await fetch(`${GAMMA_EVENTS_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Events request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    const markets = [];
    data.forEach((event) => {
      if (Array.isArray(event.markets)) {
        event.markets.forEach((market) => {
          markets.push(mapMarketResponse(market));
        });
      }
    });

    tagSlugCache.set(normalizedSlug, { markets, timestamp: now });
    return markets;
  } catch (err) {
    console.error('Error fetching markets for tag slug:', normalizedSlug, err);
    return [];
  }
}

function matchTagsForKeywords(keywords = [], tags = []) {
  if (!Array.isArray(tags) || tags.length === 0 || !Array.isArray(keywords)) {
    return [];
  }

  const normalizedKeywords = keywords
    .map((kw) => kw?.toLowerCase().trim())
    .filter(Boolean);

  const matched = [];
  const seenIds = new Set();

  for (const keyword of normalizedKeywords) {
    for (const tag of tags) {
      const tagId = tag.id;
      if (!tagId || seenIds.has(tagId)) continue;

      const label = tag.label?.toLowerCase() || '';
      const slug = tag.slug?.toLowerCase() || '';

      if (!label && !slug) continue;

      const labelMatch = label.includes(keyword) || keyword.includes(label);
      const slugMatch = slug.includes(keyword) || keyword.includes(slug);

      if (labelMatch || slugMatch) {
        matched.push(tag);
        seenIds.add(tagId);
        if (matched.length >= 5) {
          return matched;
        }
      }
    }
  }

  return matched;
}

async function fetchMarketsByTags(keywords = []) {
  const tags = await getAvailableTags();
  const matchedTags = matchTagsForKeywords(keywords, tags);

  const slugCandidates = new Set();
  matchedTags.forEach((tag) => {
    if (tag.slug) slugCandidates.add(tag.slug.toLowerCase());
  });
  keywords.forEach((kw) => {
    if (kw) slugCandidates.add(kw.toLowerCase());
  });

  if (slugCandidates.size === 0) {
    return { markets: [], matchedSlugs: [], errorMessage: null };
  }

  let errorMessage = null;
  let aggregated = [];

  console.debug('[PolyFinder] Tag slug candidates', Array.from(slugCandidates));

  for (const slug of slugCandidates) {
    if (aggregated.length >= DEFAULT_MARKET_LIMIT) break;
    const tagMarkets = await fetchMarketsFromTagSlug(slug);
    if (tagMarkets.length === 0) {
      continue;
    }
    aggregated = mergeMarkets(aggregated, tagMarkets);
  }

  if (aggregated.length === 0) {
    errorMessage = 'No tag-based markets found';
  }

  return {
    markets: aggregated,
    matchedSlugs: Array.from(slugCandidates),
    errorMessage
  };
}

async function fetchMarketsForKeywords(keywords = []) {
  const tagResult = await fetchMarketsByTags(keywords);
  let markets = tagResult.markets;
  let errorMessage = tagResult.errorMessage;

  if (markets.length === 0) {
    try {
      const trending = await fetchMarketsFromAPI('');
      markets = mergeMarkets(markets, trending);
    } catch (err) {
      console.error('Error fetching fallback trending markets:', err);
      errorMessage = errorMessage || 'Unable to fetch fallback markets';
    }
  }

  return {
    markets: markets.slice(0, DEFAULT_MARKET_LIMIT),
    errorMessage
  };
}

function buildQueriesFromKeywords(keywords = []) {
  if (!keywords.length) {
    return { primaryQuery: '', fallbackQueries: [] };
  }

  return {
    primaryQuery: keywords[0] || '',
    fallbackQueries: keywords.slice(1)
  };
}

function sendMarketsPayload(tabId, context) {
  chrome.runtime.sendMessage({
    action: 'MARKETS_READY',
    payload: {
      markets: context.markets || [],
      keywords: context.keywords || [],
      stats: context.stats || getEmptyStats(),
      pageTitle: context.pageData?.title || '',
      error: context.error || null
    }
  });
}

async function updateMarketsForTab(tabId) {
  const context = tabContexts.get(tabId);
  if (!context || !context.pageData) {
    chrome.runtime.sendMessage({
      action: 'MARKETS_READY',
      payload: {
        markets: [],
        keywords: [],
        stats: getEmptyStats(),
        pageTitle: '',
        error: 'No page content available yet'
      }
    });
    return;
  }

  console.debug('[PolyFinder] Fetch markets', {
    tabId,
    keywordCount: context.keywords.length,
    keywords: context.keywords
  });
  const { markets, errorMessage } = await fetchMarketsForKeywords(context.keywords);
  const stats = calculateStats(markets);

  const updatedContext = {
    ...context,
    markets,
    stats,
    error: errorMessage,
    lastFetched: Date.now()
  };

  tabContexts.set(tabId, updatedContext);
  sendMarketsPayload(tabId, updatedContext);
}

async function handleNewPageData(tabId, pageData) {
  if (!pageData) return;
  const keywords = extractKeywordsFromPage(pageData);

  lastScrapableTabId = tabId;

  tabContexts.set(tabId, {
    pageData,
    keywords,
    markets: [],
    stats: getEmptyStats(),
    lastFetched: 0,
    error: null
  });

  await updateMarketsForTab(tabId);
}

function isScrapableTab(tab) {
  return tab && typeof tab.url === 'string' && /^https?:\/\//i.test(tab.url);
}

function getTabById(tabId) {
  return new Promise((resolve) => {
    if (typeof tabId !== 'number') {
      resolve(null);
      return;
    }
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
  });
}

async function getScrapableTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isScrapableTab(activeTab)) {
    return activeTab;
  }

  if (lastScrapableTabId) {
    const cached = await getTabById(lastScrapableTabId);
    if (isScrapableTab(cached)) {
      return cached;
    }
  }

  const windowTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const fallback = windowTabs.find(isScrapableTab);
  return fallback || null;
}

function requestScrapeFromTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_PAGE' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('SCRAPE_PAGE failed:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function handleManualFetchRequest() {
  const targetTab = await getScrapableTab();
  if (!targetTab) {
    chrome.runtime.sendMessage({
      action: 'MARKETS_READY',
      payload: {
        markets: [],
        keywords: [],
        stats: getEmptyStats(),
        pageTitle: '',
        error: 'No compatible page detected to analyze'
      }
    });
    return;
  }

  const tabId = targetTab.id;
  lastActiveTabId = tabId;

  const scraped = await requestScrapeFromTab(tabId);
  if (scraped && scraped.text) {
    await handleNewPageData(tabId, scraped);
    return;
  }

  const context = tabContexts.get(tabId);
  if (context && context.pageData) {
    await updateMarketsForTab(tabId);
    return;
  }

  chrome.runtime.sendMessage({
    action: 'MARKETS_READY',
    payload: {
      markets: [],
      keywords: [],
      stats: getEmptyStats(),
      pageTitle: '',
      error: 'Unable to analyze the current page'
    }
  });
}

// SETUP: Runs when extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('PolyFinder Extension installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Open side panel when user clicks extension icon in toolbar
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// MESSAGE HANDLER: Receives messages from side panel
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === 'FETCH_MARKETS') {
    handleManualFetchRequest();
  }

  if (msg.action === 'PAGE_LOADED' && sender.tab?.id) {
    lastActiveTabId = sender.tab.id;
    lastScrapableTabId = sender.tab.id;
    handleNewPageData(sender.tab.id, msg.payload);
  }

  return true;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  lastActiveTabId = tabId;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabContexts.delete(tabId);
});

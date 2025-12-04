// BACKGROUND SERVICE WORKER
// This file runs in the background and handles:
// - Opening the side panel when extension icon is clicked
// - Fetching real markets from Polymarket Gamma API
// - Sending market data to the side panel UI
// - Message passing between content script and side panel

const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
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

async function fetchMarketsFromAPI(searchQuery = '', limit = DEFAULT_MARKET_LIMIT) {
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
    if (markets.length >= 3) break;
    const fallbackResults = await attempt(fallback);
    markets = mergeMarkets(markets, fallbackResults);
  }

  if (markets.length === 0) {
    try {
      const trending = await fetchMarketsFromAPI('');
      markets = mergeMarkets(markets, trending);
    } catch (err) {
      console.error('Error fetching fallback trending markets:', err);
      errorMessage = 'Unable to fetch fallback markets';
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

  const primaryTokens = keywords.slice(0, 4);
  const fallbackTokens = keywords.slice(0, 3);

  return {
    primaryQuery: primaryTokens.join(' '),
    fallbackQueries: fallbackTokens
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

  const { primaryQuery, fallbackQueries } = buildQueriesFromKeywords(context.keywords);
  console.debug('[PolyFinder] Fetch markets', {
    tabId,
    primaryQuery,
    fallbackQueries,
    keywordCount: context.keywords.length
  });
  const { markets, errorMessage } = await fetchMarketsWithFallback(primaryQuery, fallbackQueries);
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

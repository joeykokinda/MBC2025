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
const BASE_STOPWORDS = new Set([
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
  'follow','follows','following','followers','profile','people','click','link',
  'to','its','it\'s','im','amp','a','an','in','on','of','is','as','at','by','be','s'
]);
const TWITTER_STOPWORDS = new Set([
  'dm','me','tmrw','lol','omg','pls','plz','til','fwiw','imo','imho','amp',
  'idk','ok','oke','thx','thanks','yo','u','ur','ya','lmk','gonna','gotta',
  'bro','bros','dude','homie','fam','retweet','rt','qrt','qt','tweet','tweets',
  'vid','video','videos','watch','super','lol','thanks','new','thread','link',
  'is','a','an','in','out','into','up','down','back','front','here','there'
]);
const SHORT_KEYWORD_EXCEPTIONS = new Set(['ai','btc','eth','usa','fed','gdp','uk','eu','sec']);
const SOFT_STOPWORDS = new Set([
  'breaking','update','updates','live','today','tonight','thread','watch','latest',
  'news','story','video','videos','happening','person','sharing','retweet',
  'retweeted','super','great','awesome','btw','wow'
]);
const DOMAIN_BOOST_TOKENS = new Set([
  'trump','biden','election','vote','primary','senate','house','congress','poll',
  'referendum','ballot','supreme','court','bitcoin','btc','ethereum','eth','solana',
  'sol','crypto','token','coin','inflation','cpi','rate','rates','fed','fomc',
  'hike','cut','stock','stocks','market','markets','equity','equities','etf','bond',
  'bonds','yield','yields','recession','gdp'
]);
const DOMAIN_BOOST_BONUS = 2;
const ENABLE_BIGRAMS = true;
const BIGRAM_BONUS = 0.5;
const SECONDARY_LIMIT = 8;
const NUMERIC_TOKEN_REGEX = /^\d+(\.\d+)?%?$/;

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

function normalizeToken(token, {
  stripPrefixes = true,
  stopwordSet = BASE_STOPWORDS,
  minLength = 2
} = {}) {
  if (!token) return '';
  let cleaned = token.trim();
  if (stripPrefixes) {
    cleaned = cleaned.replace(/^[#@$]+/, '');
  }
  cleaned = cleaned.replace(/[^a-zA-Z0-9+.%\-]/g, '');
  cleaned = cleaned.toLowerCase();
  if (!cleaned) return '';
  if (
    cleaned.length < minLength &&
    !NUMERIC_TOKEN_REGEX.test(cleaned) &&
    !SHORT_KEYWORD_EXCEPTIONS.has(cleaned)
  ) {
    return '';
  }
  if (stopwordSet.has(cleaned) || SOFT_STOPWORDS.has(cleaned)) {
    return '';
  }
  return cleaned;
}

function addScore(map, token, value) {
  if (!token || !value) return;
  map.set(token, (map.get(token) || 0) + value);
}

function extractKeywordsFromPage(pageData) {
  if (!pageData) {
    return {
      keywords: [],
      hashtags: [],
      cashtags: [],
      mentions: []
    };
  }

  const isTwitterSource = pageData.source === 'twitter';
  const stopwordSet = isTwitterSource
    ? new Set([...BASE_STOPWORDS, ...TWITTER_STOPWORDS])
    : BASE_STOPWORDS;
  const minLength = isTwitterSource ? 3 : 2;

  const unigramScores = new Map();
  const boostedTokens = new Set();
  const bigramScores = new Map();
  const hashtagScores = new Map();
  const cashtagScores = new Map();
  const mentionScores = new Map();
  const orderedTokens = [];
  let totalTokens = 0;
  let processedTokens = 0;

  const limitedText = (pageData.text || '').slice(0, 6000);
  const title = pageData.title || '';

  function processChunk(chunk, weight) {
    if (!chunk) return;
    const tokens = chunk.match(/[#@$]?[A-Za-z0-9][A-Za-z0-9+_%\.-]*/g) || [];
    tokens.forEach((rawToken) => {
      totalTokens += 1;
      if (!rawToken) return;

      let tokenType = 'word';
      if (/^#[A-Za-z0-9_]+$/.test(rawToken)) {
        tokenType = 'hashtag';
      } else if (/^\$[A-Za-z0-9_]+$/.test(rawToken)) {
        tokenType = 'cashtag';
      } else if (/^@[A-Za-z0-9_]+$/.test(rawToken)) {
        tokenType = 'mention';
      }

      const normalized = normalizeToken(
        tokenType === 'word' ? rawToken : rawToken.slice(1),
        {
          stripPrefixes: false,
          stopwordSet,
          minLength: tokenType === 'cashtag' || tokenType === 'hashtag' ? 2 : minLength
        }
      );
      if (!normalized) {
        return;
      }

      if (tokenType === 'cashtag' && !/[a-z]/i.test(normalized)) {
        return;
      }

      let tokenWeight = weight;
      if (tokenType === 'hashtag' || tokenType === 'cashtag') {
        tokenWeight += 1;
      }
      if (DOMAIN_BOOST_TOKENS.has(normalized) && !boostedTokens.has(normalized)) {
        tokenWeight += DOMAIN_BOOST_BONUS;
        boostedTokens.add(normalized);
      }

      addScore(unigramScores, normalized, tokenWeight);
      processedTokens += 1;

      if (tokenType === 'hashtag') {
        addScore(hashtagScores, normalized, tokenWeight);
      } else if (tokenType === 'cashtag') {
        addScore(cashtagScores, normalized, tokenWeight);
      } else if (tokenType === 'mention') {
        addScore(mentionScores, normalized, tokenWeight);
      }

      orderedTokens.push(normalized);
      if (ENABLE_BIGRAMS && orderedTokens.length >= 2) {
        const previous = orderedTokens[orderedTokens.length - 2];
        const bigram = `${previous} ${normalized}`;
        addScore(bigramScores, bigram, tokenWeight + BIGRAM_BONUS);
      }
    });
  }

  processChunk(title, 3);
  processChunk(limitedText, 1);

  const keywordCandidates = [];
  unigramScores.forEach((score, token) => {
    keywordCandidates.push({ token, score, type: 'unigram' });
  });
  if (ENABLE_BIGRAMS) {
    bigramScores.forEach((score, token) => {
      keywordCandidates.push({ token, score, type: 'bigram' });
    });
  }

  keywordCandidates.sort((a, b) => b.score - a.score);
  const keywords = keywordCandidates.slice(0, MAX_KEYWORDS).map((entry) => entry.token);

  const sortMap = (map, limit = SECONDARY_LIMIT) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([token]) => token);

  const metrics = {
    titleLength: title.length,
    bodyLength: limitedText.length,
    totalTokens,
    processedTokens,
    uniqueUnigrams: unigramScores.size,
    uniqueBigrams: bigramScores.size,
    hashtagCount: hashtagScores.size,
    cashtagCount: cashtagScores.size,
    mentionCount: mentionScores.size
  };

  console.debug('[PolyFinder] Keyword metrics', metrics);
  console.debug('[PolyFinder] Keyword extraction', {
    title: pageData.title || '',
    textPreview: (pageData.text || '').slice(0, 200),
    keywords,
    hashtags: sortMap(hashtagScores),
    cashtags: sortMap(cashtagScores)
  });

  return {
    keywords,
    hashtags: sortMap(hashtagScores),
    cashtags: sortMap(cashtagScores),
    mentions: sortMap(mentionScores),
    metrics
  };
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

async function fetchMarketsByTags(keywordData = {}) {
  const {
    keywords = [],
    hashtags = [],
    cashtags = [],
    mentions = []
  } = keywordData || {};
  const tags = await getAvailableTags();
  const tagMatcherInput = [
    ...keywords,
    ...hashtags,
    ...cashtags,
    ...mentions
  ];
  const matchedTags = matchTagsForKeywords(tagMatcherInput, tags);

  const slugCandidates = new Set();
  matchedTags.forEach((tag) => {
    if (tag.slug) slugCandidates.add(tag.slug.toLowerCase());
  });
  [...keywords, ...hashtags, ...cashtags].forEach((kw) => {
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

async function fetchMarketsForKeywords(keywordData = { keywords: [] }) {
  const tagResult = await fetchMarketsByTags(keywordData);
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

function sendMarketsPayload(tabId, context) {
  chrome.runtime.sendMessage({
    action: 'MARKETS_READY',
    payload: {
      markets: context.markets || [],
      keywords: context.keywordData?.keywords || context.keywords || [],
      hashtags: context.keywordData?.hashtags || context.hashtags || [],
      cashtags: context.keywordData?.cashtags || context.cashtags || [],
      mentions: context.keywordData?.mentions || context.mentions || [],
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
        hashtags: [],
        cashtags: [],
        mentions: [],
        stats: getEmptyStats(),
        pageTitle: '',
        error: 'No page content available yet'
      }
    });
    return;
  }

  const keywordData = context.keywordData || {
    keywords: context.keywords || [],
    hashtags: context.hashtags || [],
    cashtags: context.cashtags || [],
    mentions: context.mentions || []
  };

  console.debug('[PolyFinder] Fetch markets', {
    tabId,
    keywordCount: keywordData.keywords.length,
    keywords: keywordData.keywords
  });
  const { markets, errorMessage } = await fetchMarketsForKeywords(keywordData);
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
  const keywordData = extractKeywordsFromPage(pageData);

  lastScrapableTabId = tabId;

  tabContexts.set(tabId, {
    pageData,
    keywordData,
    keywords: keywordData.keywords,
    hashtags: keywordData.hashtags,
    cashtags: keywordData.cashtags,
    mentions: keywordData.mentions,
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
        hashtags: [],
        cashtags: [],
        mentions: [],
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
      hashtags: [],
      cashtags: [],
      mentions: [],
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

  if (msg.action === 'CLEAR_CACHE') {
    console.log('[PolyFinder Background] Clearing cache');
    tabContexts.clear();
    tagSlugCache.clear();
    lastTagFetch = 0;
    cachedTags = [];
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

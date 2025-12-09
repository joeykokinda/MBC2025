
const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const GAMMA_SEARCH_URL = 'https://gamma-api.polymarket.com/public-search';

const BUILDER_CODE = '0x64896354abcb1a591c20f7bafbd894e24ba82ddf';

function addBuilderParam(url) {
  if (!url || url === '#' || !BUILDER_CODE || BUILDER_CODE === 'YOUR_BUILDER_ADDRESS_HERE') {
    return url;
  }
  
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}builder=${encodeURIComponent(BUILDER_CODE)}`;
}

const HARDCODED_MARKETS = {
  'mbc': {
    id: 'mbc-2025-research-competition-winner',
    question: 'MBC 2025: Research Competition Winner',
    url: addBuilderParam('https://polymarket.com/event/mbc-2025-research-competition-winner?tid=1764922526638'),
    volume: 3574,
    options: [
      { name: '$Hype (University of Alabama)', price: '0.35' },
      { name: '$ENA (University of Chicago)', price: '0.34' },
      { name: '$M (University of Waterloo)', price: '0.18' },
      { name: '$MetaDAO (University of Texas at Austin)', price: '0.17' }
    ],
    displayType: 'grouped'
  },
  'midwest blockchain': {
    id: 'mbc-2025-research-competition-winner',
    question: 'MBC 2025: Research Competition Winner',
    url: addBuilderParam('https://polymarket.com/event/mbc-2025-research-competition-winner?tid=1764922526638'),
    volume: 3574,
    options: [
      { name: '$Hype (University of Alabama)', price: '0.35' },
      { name: '$ENA (University of Chicago)', price: '0.34' },
      { name: '$M (University of Waterloo)', price: '0.18' },
      { name: '$MetaDAO (University of Texas at Austin)', price: '0.17' }
    ],
    displayType: 'grouped'
  },
  'midwest blockchain conference': {
    id: 'mbc-2025-research-competition-winner',
    question: 'MBC 2025: Research Competition Winner',
    url: addBuilderParam('https://polymarket.com/event/mbc-2025-research-competition-winner?tid=1764922526638'),
    volume: 3574,
    options: [
      { name: '$Hype (University of Alabama)', price: '0.35' },
      { name: '$ENA (University of Chicago)', price: '0.34' },
      { name: '$M (University of Waterloo)', price: '0.18' },
      { name: '$MetaDAO (University of Texas at Austin)', price: '0.17' }
    ],
    displayType: 'grouped'
  }
};

const BLACKLISTED_TERMS = [
  '0xb',
  'oxb',
  '0xbclub',
  'defi app trading competition'
];

function isMarketBlacklisted(market) {
  if (!market) return false;
  
  const question = (market.question || '').toLowerCase();
  const description = (market.description || '').toLowerCase();
  const id = (market.id || '').toLowerCase();
  
  for (const term of BLACKLISTED_TERMS) {
    const termLower = term.toLowerCase();
    if (question.includes(termLower) || description.includes(termLower) || id.includes(termLower)) {
      console.log(`[Jaeger] Blacklisted market: "${market.question}" (contains "${term}")`);
      return true;
    }
  }
  
  return false;
}

// Constants
const CACHE_TTL_MS = 300000; // 5 minutes
const TEXT_LIMIT = 20000; // 20,000 characters
const MAX_CACHE_SIZE = 500; // Maximum entries in searchCache
const MAX_TWEET_MARKETS_SIZE = 100; // Maximum entries in tweetMarkets
const MAX_KEYWORDS_TO_SEARCH = 3;
const MAX_MARKETS_TO_DISPLAY = 10;
const MAX_TOP_MARKETS = 50;
const MAX_CHILD_MARKETS = 5;
const MIN_TEXT_LENGTH = 10;
const MIN_PAGE_TEXT_LENGTH = 50;
const SCORING_WEIGHTS = {
  VOLUME: 0.6,
  ACTIVE_MARKET_BONUS: 1000
};
const RELEVANCE_SCORING = {
  QUESTION_MULTIPLIER: 10,
  OUTCOME_MULTIPLIER: 7,
  DESCRIPTION_MULTIPLIER: 3
};

let allKeywords = [];
let keywordSet = new Set();
let searchCache = new Map();
let tweetMarkets = new Map();

async function loadKeywords() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/keywords.txt'));
    const text = await response.text();
    // CRITICAL FIX: Handle Windows (\r\n) and Unix (\n) line endings
    // On Windows, split('\n') leaves \r at the end of keywords, breaking matching
    allKeywords = text
      .split(/\r?\n/)  // Split on \n OR \r\n (Windows line endings)
      .map(k => k.trim())  // Remove \r and any whitespace
      .filter(k => k.length > 0);  // Remove empty lines
    keywordSet = new Set(allKeywords.map(k => k.toLowerCase()));
    console.log(`[Jaeger] Loaded ${allKeywords.length} keywords`);
  } catch (error) {
    console.error('[Jaeger] Error loading keywords:', error);
    allKeywords = [];
    keywordSet = new Set();
  }
}

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

function findMatchingKeywords(text) {
  if (!text || text.length === 0) {
    return [];
  }
  
  const textLower = text.toLowerCase();
  const words = tokenize(text);
  const hits = [];
  
  if (textLower.includes('mbc')) {
    hits.push('MBC');
  }
  
  // Match single-word keywords
  for (const word of words) {
    if (keywordSet.has(word)) {
      hits.push(word);
    }
  }
  
  // Match multi-word keywords (phrases) - ensure trimmed
  for (const keyword of allKeywords) {
    const keywordLower = keyword.toLowerCase().trim();  // Ensure trimmed
    if (keywordLower.includes(' ') && textLower.includes(keywordLower)) {
      hits.push(keyword.trim());  // Ensure trimmed when adding
    }
  }
  
  const uniqueHits = [...new Set(hits)];
  console.log(`[Jaeger] Matched ${uniqueHits.length} keywords from text`);
  return uniqueHits;
}

loadKeywords();

function buildPolymarketUrl(market = {}, event = null) {
  const conditionId = market.conditionId || market.condition_id || '';
  const marketId = market.id || '';
  const marketSlug = market.slug || '';
  const eventSlug = event?.slug || market.events?.[0]?.slug || event?.ticker || '';

  let url = '';

  if (eventSlug && marketSlug && marketId) {
    url = `https://polymarket.com/event/${eventSlug}/${marketSlug}?tid=${marketId}`;
  } else if (eventSlug && conditionId) {
    url = `https://polymarket.com/event/${eventSlug}?_c=${conditionId}`;
  } else if (marketSlug && marketId) {
    url = `https://polymarket.com/event/${marketSlug}?tid=${marketId}`;
  } else if (eventSlug) {
    url = `https://polymarket.com/event/${eventSlug}`;
  } else if (conditionId) {
    url = `https://polymarket.com/?_c=${conditionId}`;
  } else {
    return '#';
  }

  return addBuilderParam(url);
}

function parseOutcomePrices(market = {}) {
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

  if (Array.isArray(market.outcomes)) {
    return market.outcomes
      .map((price) => parseFloat(price) || 0)
      .slice(0, 2);
  }

  return [0, 0];
}

function mapMarketOption(market = {}) {
  const [yesPrice, rawNoPrice] = parseOutcomePrices(market);
  const noPrice = rawNoPrice > 0 ? rawNoPrice : Math.max(0, 1 - yesPrice);
  const label = market.groupItemTitle || market.group_item_title || market.ticker || market.question;
  return {
    id: market.id || '',
    label: label || market.question || 'Option',
    question: market.question,
    yesPrice,
    noPrice,
    volume: parseFloat(market.volumeNum || market.volume || 0) || 0
  };
}

function buildBinaryDisplayMarket(market = {}, event = null) {
  if (!market) return null;
  const [yesPrice, rawNoPrice] = parseOutcomePrices(market);
  const noPrice = rawNoPrice > 0 ? rawNoPrice : Math.max(0, 1 - yesPrice);
  const volume = parseFloat(market.volumeNum || market.volume || 0) || 0;

  return {
    id: market.id || market.question || '',
    question: event?.title || market.question || 'Unknown Market',
    slug: event?.slug || market.slug,
    url: buildPolymarketUrl(market, event),
    volume,
    outcomes: [
      { price: yesPrice.toString() },
      { price: noPrice.toString() }
    ],
    displayType: 'binary'
  };
}

function buildGroupedDisplayMarket(event = {}, markets = []) {
  if (!Array.isArray(markets) || markets.length === 0) {
    return null;
  }

  if (!event || markets.length === 1) {
    return buildBinaryDisplayMarket(markets[0], event);
  }

  const options = markets
    .map(mapMarketOption)
    .filter((option) => option && option.id);

  if (options.length === 0) {
    return buildBinaryDisplayMarket(markets[0], event);
  }

  const volume = options.reduce((sum, option) => sum + (option.volume || 0), 0);

  return {
    id: event.id || event.slug || options[0].id,
    question: event.title || event.name || options[0].question || 'Unknown Event',
    slug: event.slug,
    url: buildPolymarketUrl({}, event),
    volume,
    options,
    displayType: 'grouped'
  };
}

function convertMarketsToDisplay(markets = []) {
  if (!Array.isArray(markets)) return [];

  // Deduplicate markets by ID first to prevent showing the same market twice
  const uniqueMarketsMap = new Map();
  markets.forEach((market) => {
    if (!market || isMarketBlacklisted(market)) return;
    const marketId = market.id || market.question || '';
    if (marketId && !uniqueMarketsMap.has(marketId)) {
      uniqueMarketsMap.set(marketId, market);
    }
  });
  const deduplicatedMarkets = Array.from(uniqueMarketsMap.values());

  const eventGroups = new Map();
  const order = [];

  deduplicatedMarkets.forEach((market) => {
    const event = Array.isArray(market.events) ? market.events[0] : null;
    const eventKey = event?.slug || event?.id || null;

    if (event && eventKey) {
      if (!eventGroups.has(eventKey)) {
        eventGroups.set(eventKey, { event, markets: [] });
        order.push({ type: 'event', key: eventKey });
      }
      eventGroups.get(eventKey).markets.push(market);
    } else {
      order.push({ type: 'single', market });
    }
  });

  const results = [];
  order.forEach((entry) => {
    if (entry.type === 'event') {
      const group = eventGroups.get(entry.key);
      if (!group) return;
      const display = buildGroupedDisplayMarket(group.event, group.markets);
      if (display) {
        results.push(display);
      }
    } else if (entry.type === 'single') {
      const display = buildGroupedDisplayMarket(null, [entry.market]);
      if (display) {
        results.push(display);
      }
    }
  });

  return results;
}

function scoreEvent(event) {
  if (!event || !event.markets) return 0;
  
  const totalVolume = event.markets.reduce((sum, m) => sum + (m.volume || 0), 0);
  const activeMarkets = event.markets.filter(m => m.active && !m.closed).length;
  
  return (totalVolume * SCORING_WEIGHTS.VOLUME) + (activeMarkets * SCORING_WEIGHTS.ACTIVE_MARKET_BONUS);
}

function pickBestEvent(events) {
  if (!events || events.length === 0) return null;
  
  const activeEvents = events.filter(e => e.active && !e.closed);
  if (activeEvents.length === 0) return null;
  
  const scored = activeEvents.map(event => ({
    event,
    score: scoreEvent(event),
    bestMarket: event.markets
      ?.filter(m => m.active && !m.closed)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))[0]
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  return scored[0] || null;
}

async function searchPolymarketByKeyword(keyword) {
  const cacheKey = keyword.toLowerCase();
  const now = Date.now();
  
  if (HARDCODED_MARKETS[cacheKey]) {
    console.log(`[Jaeger] Using hardcoded market for "${keyword}"`);
    const hardcodedMarket = HARDCODED_MARKETS[cacheKey];
    return {
      keyword,
      event: { 
        title: hardcodedMarket.question,
        slug: hardcodedMarket.id,
        active: true,
        closed: false
      },
      bestMarket: {
        id: hardcodedMarket.id,
        question: hardcodedMarket.question,
        volumeNum: hardcodedMarket.volume,
        volume: hardcodedMarket.volume,
        active: true,
        closed: false,
        outcomePrices: JSON.stringify(hardcodedMarket.options),
        url: hardcodedMarket.url,
        slug: hardcodedMarket.id
      },
      childMarkets: []
    };
  }
  
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[Jaeger] Using cached results for "${keyword}"`);
      return cached.result;
    }
  }
  
  try {
    const url = `${GAMMA_SEARCH_URL}?q=${encodeURIComponent(keyword)}&events_status=active&limit_per_type=5&keep_closed_markets=0&optimized=true`;
    const response = await fetch(url);
    const data = await response.json();
    
    const filteredEvents = (data.events || []).map(event => ({
      ...event,
      markets: (event.markets || []).filter(m => !isMarketBlacklisted(m))
    })).filter(event => event.markets && event.markets.length > 0);
    
    const bestEventData = pickBestEvent(filteredEvents);
    
    const result = bestEventData ? {
      keyword,
      event: bestEventData.event,
      bestMarket: bestEventData.bestMarket,
      childMarkets: bestEventData.event.markets?.filter(m => m.active && !m.closed && !isMarketBlacklisted(m)).slice(0, MAX_CHILD_MARKETS) || []
    } : null;
    
    // Enforce cache size limit
    if (searchCache.size >= MAX_CACHE_SIZE) {
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }
    searchCache.set(cacheKey, { result, timestamp: now });
    
    return result;
  } catch (error) {
    console.error(`[Jaeger] Error searching for "${keyword}":`, error);
    return null;
  }
}


function formatMarketData(market) {
  const [yesPrice, noPriceRaw] = parseOutcomePrices(market);
  const noPrice = noPriceRaw > 0 ? noPriceRaw : Math.max(0, 1 - yesPrice);

  return {
    id: market.id || '',
    question: market.question || 'Unknown Market',
    outcomes: [
      { price: yesPrice.toString() },
      { price: noPrice.toString() }
    ],
    volume: market.volumeNum || market.volume || 0,
    url: market.url || buildPolymarketUrl(market, null)
  };
}

async function searchMarketsByKeywords(keywordsInput) {
  try {
    const keywords = Array.isArray(keywordsInput) ? keywordsInput : [keywordsInput];
    
    if (keywords.length === 0) {
      console.log(`[Jaeger] No keywords to search`);
      return [];
    }
    
    console.log(`[Jaeger] Searching with ${keywords.length} keywords: [${keywords.slice(0, 5).join(', ')}...]`);
    
    const hardcodedResults = [];
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      if (HARDCODED_MARKETS[keywordLower]) {
        console.log(`[Jaeger] Found hardcoded market for keyword: "${keyword}"`);
        hardcodedResults.push(HARDCODED_MARKETS[keywordLower]);
      }
    }
    
    if (hardcodedResults.length > 0) {
      console.log(`[Jaeger] Returning ${hardcodedResults.length} hardcoded market(s)`);
      return hardcodedResults;
    }
    
    const url = `${GAMMA_API_URL}?limit=1000&offset=0&closed=false&active=true`;
    const response = await fetch(url);
    const allMarkets = await response.json();
    
    console.log(`[Jaeger] Fetched ${allMarkets.length} active markets, scoring relevance...`);
    
    if (!Array.isArray(allMarkets) || allMarkets.length === 0) {
      return [];
    }
    
    const scoredMarkets = allMarkets
      .filter(market => !isMarketBlacklisted(market))
      .map(market => {
        const question = (market.question || '').toLowerCase();
        const description = (market.description || '').toLowerCase();
        
        let outcomesText = '';
        if (market.outcomePrices) {
          try {
            const outcomes = JSON.parse(market.outcomePrices);
            outcomesText = outcomes.map(o => (o.name || '').toLowerCase()).join(' ');
          } catch (e) {
            outcomesText = '';
          }
        } else if (market.outcomes && Array.isArray(market.outcomes)) {
          outcomesText = market.outcomes.map(o => (o || '').toLowerCase()).join(' ');
        }
        
        let score = 0;
        let matchedKeywords = [];
        
        for (const keyword of keywords) {
          const keywordLower = keyword.toLowerCase();
          
          const questionMatches = (question.match(new RegExp(keywordLower, 'gi')) || []).length;
          const outcomeMatches = (outcomesText.match(new RegExp(keywordLower, 'gi')) || []).length;
          const descMatches = (description.match(new RegExp(keywordLower, 'gi')) || []).length;
          
          if (questionMatches > 0 || outcomeMatches > 0 || descMatches > 0) {
            matchedKeywords.push(keyword);
            
            score += questionMatches * RELEVANCE_SCORING.QUESTION_MULTIPLIER * keyword.length;
            score += outcomeMatches * RELEVANCE_SCORING.OUTCOME_MULTIPLIER * keyword.length;
            score += descMatches * RELEVANCE_SCORING.DESCRIPTION_MULTIPLIER * keyword.length;
          }
        }
        
        return {
          market,
          score,
          matchedKeywords,
          volume: market.volumeNum || 0
        };
      });
    
    const matched = scoredMarkets.filter(m => m.score > 0);
    
    console.log(`[Jaeger] Found ${matched.length} markets matching keywords`);
    
    const sorted = matched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.volume - a.volume;
    });
    
    if (sorted.length > 0) {
      console.log(`[Jaeger] Top ${Math.min(5, sorted.length)} matches (by relevance):`);
      sorted.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i+1}. [Score: ${m.score}] ${m.market.question} (matched: ${m.matchedKeywords.slice(0, 3).join(', ')})`);
      });
    } else {
      console.log(`[Jaeger] No markets found matching any keywords`);
    }

    const topMarkets = sorted.slice(0, MAX_TOP_MARKETS).map((m) => m.market);
    return convertMarketsToDisplay(topMarkets).slice(0, MAX_MARKETS_TO_DISPLAY);
  } catch (error) {
    console.error('[Jaeger API] Error searching markets:', error);
    return [];
  }
}

async function fetchRealMarkets() {
  // No default markets - return empty array
  // MBC market is handled via hardcoded keyword matching, not as a default
  return [];
}

// Fetch markets and send to side panel
// Note: No default markets - returns empty array
// MBC market is handled via hardcoded keyword matching, not as a default
async function fetchAndSendMarkets() {
  const markets = await fetchRealMarkets();
  
  // Only send if we have markets (should be empty now, but keeping logic for safety)
  if (markets.length === 0) {
    console.log('[Jaeger] No default markets to send');
    chrome.runtime.sendMessage({
      action: 'MARKETS_READY',
      payload: {
        markets: []
      }
    });
    return;
  }
  
  // Deduplicate markets by ID before sending to sidebar
  const uniqueMarketsMap = new Map();
  markets.forEach(market => {
    if (market && market.id && !uniqueMarketsMap.has(market.id)) {
      uniqueMarketsMap.set(market.id, market);
    }
  });
  const uniqueMarkets = Array.from(uniqueMarketsMap.values());
  
  chrome.runtime.sendMessage({
    action: 'MARKETS_READY',
    payload: {
      markets: uniqueMarkets
    }
  });
}

// SETUP: Runs when extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Jaeger Extension installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Open side panel when user clicks extension icon in toolbar
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

async function extractKeywordsFromText(text) {
  console.log(`[Jaeger Keywords] Matching text against ${allKeywords.length} keywords`);
  const matches = findMatchingKeywords(text);
  
  if (matches.length > 0) {
    console.log(`[Jaeger Keywords] Found matches: [${matches.join(', ')}]`);
  } else {
    console.log(`[Jaeger Keywords] No keyword matches found`);
  }
  
  return matches;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'CHECK_TWEET') {
    const { text, tweetId } = msg;
    
    if (!text || text.length < MIN_TEXT_LENGTH) {
      sendResponse({ markets: [] });
      return true;
    }
    
    const hits = findMatchingKeywords(text);
    
    if (hits.length === 0) {
      sendResponse({ markets: [] });
      return true;
    }
    
    console.log(`[Jaeger] Tweet matched keywords: [${hits.join(', ')}]`);
    
    Promise.all(hits.slice(0, MAX_KEYWORDS_TO_SEARCH).map(keyword => searchPolymarketByKeyword(keyword)))
      .then(results => {
        const validResults = results.filter(r => r !== null);
        
        const marketsByKeyword = validResults.map(r => ({
          keyword: r.keyword,
          event: r.event,
          primaryMarket: r.bestMarket,
          childMarkets: r.childMarkets
        }));
        
        const timestamp = Date.now();
        validResults.forEach(r => {
          if (r.bestMarket) {
            // Enforce tweetMarkets size limit
            if (tweetMarkets.size >= MAX_TWEET_MARKETS_SIZE) {
              const oldestKey = Array.from(tweetMarkets.entries())
                .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0))[0]?.[0];
              if (oldestKey) tweetMarkets.delete(oldestKey);
            }
            const marketWithTimestamp = {
              ...formatMarketData(r.bestMarket),
              timestamp,
              keyword: r.keyword
            };
            tweetMarkets.set(r.bestMarket.id, marketWithTimestamp);
          }
        });
        
        const allTweetMarkets = Array.from(tweetMarkets.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 20);
        
        if (allTweetMarkets.length > 0) {
          chrome.runtime.sendMessage({
            action: 'MARKETS_READY',
            payload: {
              markets: allTweetMarkets.slice(0, MAX_MARKETS_TO_DISPLAY)
            }
          });
        }
        
        sendResponse({ 
          success: true,
          keywords: hits,
          marketsByKeyword 
        });
      })
      .catch(error => {
        console.error('[Jaeger] Error processing CHECK_TWEET:', error);
        sendResponse({ success: false, markets: [] });
      });
    
    return true;
  }
  
  if (msg.action === 'CLEAR_CACHE') {
    console.log('[Jaeger Background] Clearing tweet cache...');
    searchCache.clear();
    tweetMarkets.clear();
    return true;
  }
  
  if (msg.action === 'PAGE_LOADED') {
    const { text, title, url, source, individualTweets } = msg.payload || {};
    const isTwitter = source === 'twitter' || (url && (url.includes('twitter.com') || url.includes('x.com')));
    
    if (!text || text.length < MIN_PAGE_TEXT_LENGTH) {
      console.log('[Jaeger] PAGE_LOADED ignored - insufficient text');
      return true;
    }
    
    console.log(`[Jaeger] PAGE_LOADED from: ${url}${isTwitter ? ' (Twitter)' : ''}`);
    console.log(`[Jaeger] Processing ${text.length} characters of text...`);
    
    let matchedKeywords = [];
    
    // For Twitter, extract keywords from individual tweets for better granularity
    const keywordExtractionPromise = isTwitter && individualTweets && individualTweets.length > 0
      ? Promise.all(individualTweets.slice(0, 10).map(tweetText => extractKeywordsFromText(tweetText)))
          .then(keywordArrays => {
            // Combine and deduplicate keywords from all tweets
            const allKeywords = keywordArrays.flat();
            return [...new Set(allKeywords)];
          })
      : extractKeywordsFromText(text);
    
    keywordExtractionPromise.then(keywords => {
      matchedKeywords = keywords;
      console.log(`[Jaeger] Matched keywords: [${keywords.join(', ')}]`);
      
      if (keywords.length === 0) {
        console.log('[Jaeger] No keywords matched - checking tweetMarkets');
        // On Twitter, check if we have tweetMarkets to use
        if (isTwitter && tweetMarkets.size > 0) {
          const allTweetMarkets = Array.from(tweetMarkets.values())
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, MAX_MARKETS_TO_DISPLAY);
          
          console.log(`[Jaeger] Using ${allTweetMarkets.length} markets from tweetMarkets`);
          chrome.runtime.sendMessage({
            action: 'MARKETS_READY',
            payload: {
              markets: allTweetMarkets
            }
          });
          return null;
        }
        // No default markets - send empty array
        console.log('[Jaeger] No keywords matched and no tweetMarkets - sending empty markets');
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: { markets: [] }
        });
        return null;
      }
      
      return searchMarketsByKeywords(keywords);
    }).then(markets => {
      if (!markets || markets.length === 0) {
        console.log('[Jaeger] No markets found - checking tweetMarkets');
        // On Twitter, merge with tweetMarkets if available
        if (isTwitter && tweetMarkets.size > 0) {
          const allTweetMarkets = Array.from(tweetMarkets.values())
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, MAX_MARKETS_TO_DISPLAY);
          
          console.log(`[Jaeger] Using ${allTweetMarkets.length} markets from tweetMarkets`);
          chrome.runtime.sendMessage({
            action: 'MARKETS_READY',
            payload: {
              markets: allTweetMarkets
            }
          });
          return;
        }
        // No default markets - send empty array
        console.log('[Jaeger] No markets found and no tweetMarkets - sending empty markets');
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: { markets: [] }
        });
        return;
      }
      
      // On Twitter, merge page-level markets with tweetMarkets, prioritizing tweetMarkets
      let finalMarkets = markets;
      if (isTwitter && tweetMarkets.size > 0) {
        const tweetMarketsArray = Array.from(tweetMarkets.values())
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        // Create a map to deduplicate
        const marketsMap = new Map();
        
        // First add tweetMarkets (higher priority)
        tweetMarketsArray.forEach(market => {
          if (market && market.id) {
            marketsMap.set(market.id, market);
          }
        });
        
        // Then add page-level markets (fill gaps)
        markets.forEach(market => {
          if (market && market.id && !marketsMap.has(market.id)) {
            marketsMap.set(market.id, market);
          }
        });
        
        finalMarkets = Array.from(marketsMap.values())
          .sort((a, b) => {
            // Prioritize tweetMarkets (those with timestamps)
            const aIsTweet = a.timestamp ? 1 : 0;
            const bIsTweet = b.timestamp ? 1 : 0;
            if (aIsTweet !== bIsTweet) return bIsTweet - aIsTweet;
            // Then by timestamp if both are tweet markets
            if (aIsTweet && bIsTweet) {
              return (b.timestamp || 0) - (a.timestamp || 0);
            }
            return 0;
          })
          .slice(0, MAX_MARKETS_TO_DISPLAY);
        
        console.log(`[Jaeger] Merged ${tweetMarketsArray.length} tweetMarkets with ${markets.length} page markets = ${finalMarkets.length} total`);
      }
      
      // Deduplicate markets by ID before sending to sidebar
      const uniqueMarketsMap = new Map();
      finalMarkets.forEach(market => {
        if (market && market.id && !uniqueMarketsMap.has(market.id)) {
          uniqueMarketsMap.set(market.id, market);
        }
      });
      const uniqueMarkets = Array.from(uniqueMarketsMap.values());
      
      chrome.runtime.sendMessage({
        action: 'MARKETS_READY',
        payload: {
          markets: uniqueMarkets.slice(0, MAX_MARKETS_TO_DISPLAY)
        }
      });
      
      console.log(`[Jaeger] Sent ${uniqueMarkets.length} markets to sidebar`);
    }).catch(error => {
      console.error('[Jaeger] Error processing PAGE_LOADED:', error);
      // On error, try to use tweetMarkets if on Twitter
      if (isTwitter && tweetMarkets.size > 0) {
        const allTweetMarkets = Array.from(tweetMarkets.values())
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .slice(0, MAX_MARKETS_TO_DISPLAY);
        
        console.log(`[Jaeger] Error occurred, using ${allTweetMarkets.length} markets from tweetMarkets`);
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: {
            markets: allTweetMarkets
          }
        });
      } else {
        // No default markets - send empty array on error
        console.log('[Jaeger] Error occurred, no tweetMarkets available - sending empty markets');
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: { markets: [] }
        });
      }
    });
    
    return true;
  }
  
  if (msg.action === 'FETCH_MARKETS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        console.log('[Jaeger] No active tab found');
        return;
      }
      
      const isTwitter = tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com');
      
      if (isTwitter) {
        console.log('[Jaeger] On Twitter, triggering scrape...');
        
        chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
        
        let fallbackTimeout = setTimeout(() => {
          console.log('[Jaeger] Scrape took too long, no markets to show');
          chrome.runtime.sendMessage({
            action: 'MARKETS_READY',
            payload: { markets: [] }
          });
        }, 5000);
        
        chrome.tabs.sendMessage(tabs[0].id, { action: 'SCRAPE_PAGE' }, (response) => {
          if (chrome.runtime.lastError) {
            clearTimeout(fallbackTimeout);
            console.log('[Jaeger] Error triggering scrape, no markets to show');
            chrome.runtime.sendMessage({
              action: 'MARKETS_READY',
              payload: { markets: [] }
            });
          } else if (response && response.text) {
            // Scrape succeeded, PAGE_LOADED will handle it
            clearTimeout(fallbackTimeout);
          }
        });
      } else {
        // For non-Twitter pages, trigger immediate scrape for better timing
        console.log('[Jaeger] Not on Twitter, triggering immediate scrape...');
        chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
        
        chrome.tabs.sendMessage(tabs[0].id, { action: 'SCRAPE_PAGE' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[Jaeger] Error triggering scrape:', chrome.runtime.lastError.message);
            chrome.runtime.sendMessage({
              action: 'MARKETS_READY',
              payload: { markets: [] }
            });
          } else if (response) {
            // Process the scrape immediately as PAGE_LOADED would
            const { text, title, url, source, individualTweets } = response;
            const hasText = text && text.length >= MIN_PAGE_TEXT_LENGTH;
            
            if (!hasText) {
              console.log('[Jaeger] Scraped page has insufficient text');
              chrome.runtime.sendMessage({
                action: 'MARKETS_READY',
                payload: { markets: [] }
              });
              return;
            }
            
            // Process like PAGE_LOADED but synchronously
            extractKeywordsFromText(text).then(keywords => {
              if (keywords.length === 0) {
                console.log('[Jaeger] No keywords matched from immediate scrape');
                chrome.runtime.sendMessage({
                  action: 'MARKETS_READY',
                  payload: { markets: [] }
                });
                return null;
              }
              
              return searchMarketsByKeywords(keywords);
            }).then(markets => {
              if (!markets || markets.length === 0) {
                console.log('[Jaeger] No markets found from immediate scrape');
                chrome.runtime.sendMessage({
                  action: 'MARKETS_READY',
                  payload: { markets: [] }
                });
                return;
              }
              
              // Deduplicate and send
              const uniqueMarketsMap = new Map();
              markets.forEach(market => {
                if (market && market.id && !uniqueMarketsMap.has(market.id)) {
                  uniqueMarketsMap.set(market.id, market);
                }
              });
              const uniqueMarkets = Array.from(uniqueMarketsMap.values());
              
              chrome.runtime.sendMessage({
                action: 'MARKETS_READY',
                payload: {
                  markets: uniqueMarkets.slice(0, MAX_MARKETS_TO_DISPLAY)
                }
              });
              
              console.log(`[Jaeger] Sent ${uniqueMarkets.length} markets from immediate scrape`);
            }).catch(error => {
              console.error('[Jaeger] Error processing immediate scrape:', error);
              chrome.runtime.sendMessage({
                action: 'MARKETS_READY',
                payload: { markets: [] }
              });
            });
          }
        });
      }
    });
    return true;
  }
  
  if (msg.action === 'TWEETS_SCRAPED' || msg.action === 'PROCESS_TWEETS_TO_MARKETS') {
    const { tweets } = msg.payload || {};
    
    chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
    
    Promise.all(tweets.map(async (tweet) => {
      console.log(`\n[Jaeger] Processing tweet: "${tweet.text.substring(0, 80)}..."`);
      
      const keywords = await extractKeywordsFromText(tweet.text);
      console.log(`[Jaeger] Keywords for this tweet:`, keywords);
      
      const markets = await searchMarketsByKeywords(keywords);
      console.log(`[Jaeger] Found ${markets.length} markets for this tweet\n`);
      
      return {
        tweet: tweet.text,
        sender: tweet.sender,
        keywords: keywords,
        markets: markets
      };
    }))
      .then((results) => {
        console.log('\n========================================');
        console.log(`[Jaeger] COMPLETED: Processed ${results.length} tweets`);
        console.log('========================================');
        
        const allMarkets = [];
        
        results.forEach((r, idx) => {
          console.log(`\nRESULT ${idx + 1}:`);
          console.log(`Tweet: "${r.tweet.substring(0, 100)}..."`);
          console.log(`Keywords: [${r.keywords.join(', ')}]`);
          console.log(`Markets found: ${r.markets.length}`);
          
          allMarkets.push(...r.markets);
          
          if (r.markets.length > 0) {
            r.markets.forEach((m, i) => {
              console.log(`  ${i+1}. ${m.question}`);
              console.log(`     ${m.url}`);
            });
          } else {
            console.log('  (No relevant markets found)');
          }
        });
        
        console.log('\n========================================');
        
        if (allMarkets.length > 0) {
          const uniqueMarkets = Array.from(new Map(allMarkets.map(m => [m.id, m])).values());
          const displayMarkets = uniqueMarkets.slice(0, MAX_MARKETS_TO_DISPLAY);
          
          console.log(`\nSENDING TO SIDEBAR:`);
          console.log(`Total unique markets: ${uniqueMarkets.length}`);
          console.log(`Displaying top ${displayMarkets.length} markets:`);
          displayMarkets.forEach((m, i) => {
            console.log(`  ${i+1}. ${m.question}`);
          });
          
          chrome.runtime.sendMessage({
            action: 'MARKETS_READY',
            payload: {
              markets: displayMarkets
            }
          });
          
          console.log(`Markets sent to sidebar successfully!`);
        } else {
          console.log('\nNo markets found - keeping existing markets in sidebar');
        }
        
        sendResponse({ success: true, results: results, totalMarkets: allMarkets.length });
      })
      .catch((error) => {
        console.error('[Jaeger Background] Error processing tweets to markets:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }

  return false;
});

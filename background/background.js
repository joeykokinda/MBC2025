
const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const GAMMA_SEARCH_URL = 'https://gamma-api.polymarket.com/public-search';

let lastProcessedTweets = new Set();
let processingInProgress = false;
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

function buildEventUrl(event = {}) {
  const slug = event.slug || event.ticker || '';
  if (!slug) return '#';
  return `https://polymarket.com/event/${slug}`;
}

function buildDisplayMarketUrl(market = {}, event = null) {
  const conditionId = market.conditionId || market.condition_id || '';
  const slug = event?.slug || market.slug || '';

  if (slug && conditionId) {
    return `https://polymarket.com/event/${slug}?_c=${conditionId}`;
  }
  if (slug) {
    return `https://polymarket.com/event/${slug}`;
  }
  if (conditionId) {
    return `https://polymarket.com/?_c=${conditionId}`;
  }
  return '#';
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
    url: buildDisplayMarketUrl(market, event),
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
    url: buildEventUrl(event),
    volume,
    options,
    displayType: 'grouped'
  };
}

function convertMarketsToDisplay(markets = []) {
  if (!Array.isArray(markets)) return [];

  const eventGroups = new Map();
  const order = [];

  markets.forEach((market) => {
    if (!market) return;
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
  const totalLiquidity = event.markets.reduce((sum, m) => sum + (m.liquidity || 0), 0);
  const activeMarkets = event.markets.filter(m => m.active && !m.closed).length;
  
  return (totalVolume * 0.6) + (totalLiquidity * 0.3) + (activeMarkets * 1000);
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
  
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (now - cached.timestamp < 300000) {
      console.log(`[Jaeger] Using cached results for "${keyword}"`);
      return cached.result;
    }
  }
  
  try {
    const url = `${GAMMA_SEARCH_URL}?q=${encodeURIComponent(keyword)}&events_status=active&limit_per_type=5&keep_closed_markets=0&optimized=true`;
    const response = await fetch(url);
    const data = await response.json();
    
    const bestEventData = pickBestEvent(data.events || []);
    
    const result = bestEventData ? {
      keyword,
      event: bestEventData.event,
      bestMarket: bestEventData.bestMarket,
      childMarkets: bestEventData.event.markets?.filter(m => m.active && !m.closed).slice(0, 5) || []
    } : null;
    
    searchCache.set(cacheKey, { result, timestamp: now });
    
    return result;
  } catch (error) {
    console.error(`[Jaeger] Error searching for "${keyword}":`, error);
    return null;
  }
}

function buildPolymarketUrl(market) {
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
    url: buildPolymarketUrl(market)
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
    
    const url = `${GAMMA_API_URL}?limit=1000&offset=0&closed=false&active=true`;
    const response = await fetch(url);
    const allMarkets = await response.json();
    
    console.log(`[Jaeger] Fetched ${allMarkets.length} active markets, scoring relevance...`);
    
    if (!Array.isArray(allMarkets) || allMarkets.length === 0) {
      return [];
    }
    
    const scoredMarkets = allMarkets.map(market => {
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
          
          score += questionMatches * 10 * keyword.length;
          score += outcomeMatches * 7 * keyword.length;
          score += descMatches * 3 * keyword.length;
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

    const topMarkets = sorted.slice(0, 50).map((m) => m.market);
    return convertMarketsToDisplay(topMarkets).slice(0, 10);
  } catch (error) {
    console.error('[Jaeger API] Error searching markets:', error);
    return [];
  }
}

async function fetchRealMarkets() {
  try {
    const url = `${GAMMA_API_URL}?limit=3&offset=0&closed=false&active=true&order=volumeNum&ascending=false`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    return convertMarketsToDisplay(data.slice(0, 20)).slice(0, 6);
  } catch (error) {
    console.error('Error fetching markets:', error);
    return [];
  }
}

// Calculate statistics from markets array
function calculateStats(markets) {
  if (!Array.isArray(markets) || markets.length === 0) {
    return {
      totalMarkets: 0,
      avgYesOdds: 0,
      avgNoOdds: 0,
      totalVolume: 0
    };
  }

  const optionData = [];
  let totalVolume = 0;

  markets.forEach((market) => {
    const marketVolume = parseFloat(market.volume || 0) || 0;
    if (marketVolume > 0) {
      totalVolume += marketVolume;
    }

    if (Array.isArray(market.options) && market.options.length > 0) {
      market.options.forEach((option) => {
        const yesPrice = option?.yesPrice || 0;
        const noPrice = option?.noPrice > 0 ? option.noPrice : Math.max(0, 1 - yesPrice);
        optionData.push({ yesPrice, noPrice });
      });
    } else {
      const yesPrice = parseFloat(market.outcomes?.[0]?.price || 0) || 0;
      const noPriceValue = parseFloat(market.outcomes?.[1]?.price);
      const noPrice = Number.isFinite(noPriceValue) && noPriceValue > 0
        ? noPriceValue
        : Math.max(0, 1 - yesPrice);
      optionData.push({ yesPrice, noPrice });
    }
  });

  const yesOdds = optionData
    .map((option) => option.yesPrice || 0)
    .filter((odds) => odds > 0);

  const noOdds = optionData
    .map((option) => option.noPrice || Math.max(0, 1 - (option.yesPrice || 0)))
    .filter((odds) => odds > 0);

  return {
    totalMarkets: markets.length,
    avgYesOdds: yesOdds.length > 0
      ? yesOdds.reduce((a, b) => a + b, 0) / yesOdds.length
      : 0,
    avgNoOdds: noOdds.length > 0
      ? noOdds.reduce((a, b) => a + b, 0) / noOdds.length
      : 0,
    totalVolume
  };
}

// Fetch markets and send to side panel
async function fetchAndSendMarkets() {
  const markets = await fetchRealMarkets();
  const stats = calculateStats(markets);
  
  chrome.runtime.sendMessage({
    action: 'MARKETS_READY',
    payload: {
      markets: markets,
      keywords: [],
      stats: stats,
      pageTitle: 'Top markets by volume',
      noTweets: false
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

async function processScrapedTweets(tweets, url, timestamp) {
  console.log('========================================');
  console.log(`[Jaeger Background] RECEIVED ${tweets.length} TWEETS`);
  console.log(`[Jaeger Background] From URL: ${url}`);
  console.log('========================================');
  
  const tweetTexts = tweets.map(tweet => ({
    text: tweet.text,
    sender: tweet.sender,
    url: url,
    timestamp: timestamp
  }));
  
  console.log('[Jaeger Background] Tweet data structure ready for API:');
  console.log(`  - Total tweets: ${tweetTexts.length}`);
  console.log('  - Sample data (first 2 tweets):');
  console.log(JSON.stringify(tweetTexts.slice(0, 2), null, 4));
  console.log('========================================');
  
  return tweetTexts;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'CHECK_TWEET') {
    const { text, tweetId } = msg;
    
    if (!text || text.length < 10) {
      sendResponse({ markets: [] });
      return true;
    }
    
    const hits = findMatchingKeywords(text);
    
    if (hits.length === 0) {
      sendResponse({ markets: [] });
      return true;
    }
    
    console.log(`[Jaeger] Tweet matched keywords: [${hits.join(', ')}]`);
    
    Promise.all(hits.slice(0, 3).map(keyword => searchPolymarketByKeyword(keyword)))
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
          const stats = calculateStats(allTweetMarkets);
          chrome.runtime.sendMessage({
            action: 'MARKETS_READY',
            payload: {
              markets: allTweetMarkets.slice(0, 10),
              keywords: hits,
              stats: stats,
              pageTitle: 'Markets from Twitter feed'
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
    lastProcessedTweets.clear();
    processingInProgress = false;
    searchCache.clear();
    tweetMarkets.clear();
    return true;
  }
  
  if (msg.action === 'PAGE_LOADED') {
    const { text, title, url } = msg.payload || {};
    
    if (!text || text.length < 50) {
      console.log('[Jaeger] PAGE_LOADED ignored - insufficient text');
      return true;
    }
    
    console.log(`[Jaeger] PAGE_LOADED from: ${url}`);
    console.log(`[Jaeger] Processing ${text.length} characters of text...`);
    
    let matchedKeywords = [];
    
    extractKeywordsFromText(text).then(keywords => {
      matchedKeywords = keywords;
      console.log(`[Jaeger] Matched keywords: [${keywords.join(', ')}]`);
      
      if (keywords.length === 0) {
        console.log('[Jaeger] No keywords matched - showing default markets');
        fetchAndSendMarkets();
        return null;
      }
      
      return searchMarketsByKeywords(keywords);
    }).then(markets => {
      if (!markets || markets.length === 0) {
        console.log('[Jaeger] No markets found - showing default');
        fetchAndSendMarkets();
        return;
      }
      
      const stats = calculateStats(markets);
      chrome.runtime.sendMessage({
        action: 'MARKETS_READY',
        payload: {
          markets: markets.slice(0, 10),
          keywords: matchedKeywords,
          stats: stats,
          pageTitle: title || 'Page Results'
        }
      });
      
      console.log(`[Jaeger] Sent ${markets.length} markets to sidebar`);
    }).catch(error => {
      console.error('[Jaeger] Error processing PAGE_LOADED:', error);
      fetchAndSendMarkets();
    });
    
    return true;
  }
  
  if (msg.action === 'FETCH_MARKETS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
        console.log('[Jaeger] On Twitter, triggering scrape...');
        
        chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
        
        let fallbackTimeout = setTimeout(() => {
          console.log('[Jaeger] Scrape took too long, showing default markets');
          fetchAndSendMarkets();
        }, 5000);
        
        chrome.tabs.sendMessage(tabs[0].id, { action: 'SCRAPE_PAGE' }, (response) => {
          if (chrome.runtime.lastError) {
            clearTimeout(fallbackTimeout);
            console.log('[Jaeger] Error triggering scrape, showing default markets');
            fetchAndSendMarkets();
          } else if (response && response.success) {
            clearTimeout(fallbackTimeout);
          }
        });
      } else {
        console.log('[Jaeger] Not on Twitter, showing default markets');
        fetchAndSendMarkets();
      }
    });
    return true;
  }
  
  if (msg.action === 'EXTRACT_KEYWORDS') {
    const { text } = msg.payload;
    
    extractKeywordsFromText(text)
      .then((keywords) => {
        sendResponse({ 
          success: true, 
          keywords: keywords 
        });
      })
      .catch((error) => {
        console.error('[Jaeger Background] Keyword extraction error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (msg.action === 'SEARCH_MARKETS') {
    const { keywords } = msg.payload;
    
    searchMarketsByKeywords(keywords)
      .then((markets) => {
        sendResponse({ 
          success: true, 
          markets: markets,
          count: markets.length 
        });
      })
      .catch((error) => {
        console.error('[Jaeger Background] Error searching markets:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (msg.action === 'GPT_TO_MARKETS') {
    const { text } = msg.payload;
    
    extractKeywordsFromText(text)
      .then((keywords) => {
        return searchMarketsByKeywords(keywords)
          .then((markets) => ({
            keywords,
            markets
          }));
      })
      .then(({ keywords, markets }) => {
        sendResponse({
          success: true,
          keywords: keywords,
          markets: markets,
          count: markets.length
        });
      })
      .catch((error) => {
        console.error('[Jaeger Background] Keyword to markets error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (msg.action === 'TWEETS_SCRAPED') {
    console.log('[Jaeger Background] Message received: TWEETS_SCRAPED');
    
    const { tweets, url, timestamp } = msg.payload;
    
    processScrapedTweets(tweets, url, timestamp)
      .then(() => {
        sendResponse({ success: true, processed: tweets.length });
      })
      .catch((error) => {
        console.error('[Jaeger Background] Error processing tweets:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    if (processingInProgress) {
      console.log('[Jaeger Background] Already processing tweets, skipping...');
      return true;
    }
    
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('YOUR-API-KEY')) {
      console.error('[Jaeger Background] No API key configured! Add your Gemini key to config.js');
      return true;
    }
    
    const tweetHashes = tweets.map(t => t.text.substring(0, 50));
    const isDuplicate = tweetHashes.every(hash => lastProcessedTweets.has(hash));
    
    if (isDuplicate) {
      console.log('[Jaeger Background] These tweets were already processed, skipping...');
      return true;
    }
    
    tweetHashes.forEach(hash => lastProcessedTweets.add(hash));
    
    const tweetsToProcess = tweets.slice(0, 3);
    console.log(`[Jaeger Background] Auto-processing ${tweetsToProcess.length} NEW tweets...`);
    
    processingInProgress = true;
    
    chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
    
    Promise.all(tweetsToProcess.map(async (tweet) => {
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
      const allKeywords = [];
      
      results.forEach((r, idx) => {
        console.log(`\nRESULT ${idx + 1}:`);
        console.log(`Tweet: "${r.tweet.substring(0, 100)}..."`);
        console.log(`Keywords: [${r.keywords.join(', ')}]`);
        console.log(`Markets found: ${r.markets.length}`);
        
        allKeywords.push(...r.keywords);
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
        const stats = calculateStats(uniqueMarkets);
        const displayMarkets = uniqueMarkets.slice(0, 10);
        const displayKeywords = [...new Set(allKeywords)].slice(0, 10);
        
        console.log(`\nSENDING TO SIDEBAR:`);
        console.log(`Total unique markets: ${uniqueMarkets.length}`);
        console.log(`Displaying top ${displayMarkets.length} markets:`);
        displayMarkets.forEach((m, i) => {
          console.log(`  ${i+1}. ${m.question}`);
        });
        console.log(`Keywords: [${displayKeywords.join(', ')}]`);
        
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: {
            markets: displayMarkets,
            keywords: displayKeywords,
            stats: stats,
            pageTitle: 'Markets from scraped tweets'
          }
        });
        
        console.log(`Markets sent to sidebar successfully!`);
      } else {
        console.log('\nNo markets found - keeping existing markets in sidebar');
      }
      
      processingInProgress = false;
    })
    .catch((error) => {
      console.error('[Jaeger Background] Error processing tweets to markets:', error);
      processingInProgress = false;
    });
    
    return true;
  }
  
  if (msg.action === 'PROCESS_TWEETS_TO_MARKETS') {
    const { tweets } = msg.payload;
    
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
        const allKeywords = [];
        
        results.forEach((r, idx) => {
          console.log(`\nRESULT ${idx + 1}:`);
          console.log(`Tweet: "${r.tweet.substring(0, 100)}..."`);
          console.log(`Keywords: [${r.keywords.join(', ')}]`);
          console.log(`Markets found: ${r.markets.length}`);
          
          allKeywords.push(...r.keywords);
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
          const stats = calculateStats(uniqueMarkets);
          const displayMarkets = uniqueMarkets.slice(0, 10);
          const displayKeywords = [...new Set(allKeywords)].slice(0, 10);
          
          console.log(`\nSENDING TO SIDEBAR:`);
          console.log(`Total unique markets: ${uniqueMarkets.length}`);
          console.log(`Displaying top ${displayMarkets.length} markets:`);
          displayMarkets.forEach((m, i) => {
            console.log(`  ${i+1}. ${m.question}`);
          });
          console.log(`Keywords: [${displayKeywords.join(', ')}]`);
          
          chrome.runtime.sendMessage({
            action: 'MARKETS_READY',
            payload: {
              markets: displayMarkets,
              keywords: displayKeywords,
              stats: stats,
              pageTitle: 'Markets from scraped tweets'
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

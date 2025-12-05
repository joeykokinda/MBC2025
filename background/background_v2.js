const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const PAGE_SIZE = 500;
const CACHE_TTL = 5 * 60 * 1000;

let entityKeywords = new Set();
let genericKeywords = new Set();
let marketsCache = [];
let keywordIndex = {};
let lastFetchTime = 0;

async function loadKeywords() {
  try {
    const [entityRes, genericRes] = await Promise.all([
      fetch(chrome.runtime.getURL('data/entity_keywords.txt')),
      fetch(chrome.runtime.getURL('data/generic_keywords.txt'))
    ]);
    
    const entityText = await entityRes.text();
    const genericText = await genericRes.text();
    
    entityKeywords = new Set(
      entityText.split('\n')
        .filter(k => k.trim().length > 0)
        .map(k => k.toLowerCase())
    );
    
    genericKeywords = new Set(
      genericText.split('\n')
        .filter(k => k.trim().length > 0)
        .map(k => k.toLowerCase())
    );
    
    console.log(`[PolyFinder] Loaded ${entityKeywords.size} entity keywords, ${genericKeywords.size} generic keywords`);
  } catch (error) {
    console.error('[PolyFinder] Error loading keywords:', error);
  }
}

function isMarketGoodQuality(market) {
  const volume = market.volumeNum || market.volume || 0;
  const liquidity = market.liquidity || 0;
  const minVolume = 1000;
  const minLiquidity = 100;
  
  if (volume < minVolume) return false;
  if (liquidity < minLiquidity) return false;
  
  if (market.endDate || market.end_date_iso) {
    const endDate = new Date(market.endDate || market.end_date_iso);
    const now = new Date();
    const daysUntilEnd = (endDate - now) / (1000 * 60 * 60 * 24);
    
    if (daysUntilEnd < 1) return false;
  }
  
  if (market.resolved === true || market.closed === true) return false;
  if (market.active === false) return false;
  
  return true;
}

async function fetchAllActiveMarkets() {
  console.log('[PolyFinder] Fetching all active markets with pagination...');
  
  const allMarkets = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const url = `${GAMMA_API_URL}?limit=${PAGE_SIZE}&offset=${offset}&closed=false&active=true`;
      const response = await fetch(url);
      const batch = await response.json();
      
      if (!Array.isArray(batch) || batch.length === 0) {
        hasMore = false;
        break;
      }
      
      allMarkets.push(...batch);
      console.log(`[PolyFinder] Fetched ${allMarkets.length} markets so far...`);
      
      if (batch.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`[PolyFinder] Error fetching batch at offset ${offset}:`, error);
      hasMore = false;
    }
  }
  
  const qualityMarkets = allMarkets.filter(isMarketGoodQuality);
  console.log(`[PolyFinder] Fetched ${allMarkets.length} total markets, ${qualityMarkets.length} passed quality filter`);
  
  return qualityMarkets;
}

function buildKeywordIndex(markets) {
  console.log('[PolyFinder] Building keyword index...');
  
  const index = {};
  
  for (const keyword of entityKeywords) {
    index[keyword] = [];
  }
  
  for (const market of markets) {
    const textBlob = `${market.question || ''} ${market.description || ''} ${market.events?.[0]?.title || ''}`.toLowerCase();
    
    market._entityKeywords = [];
    market._genericKeywords = [];
    
    for (const keyword of entityKeywords) {
      if (textBlob.includes(keyword)) {
        market._entityKeywords.push(keyword);
        index[keyword].push(market);
      }
    }
    
    for (const keyword of genericKeywords) {
      if (textBlob.includes(keyword)) {
        market._genericKeywords.push(keyword);
      }
    }
  }
  
  const keyCount = Object.keys(index).filter(k => index[k].length > 0).length;
  console.log(`[PolyFinder] Built index with ${keyCount} keywords covering markets`);
  
  return index;
}

async function getMarketsCache() {
  const now = Date.now();
  
  if (marketsCache.length === 0 || now - lastFetchTime > CACHE_TTL) {
    console.log('[PolyFinder] Cache miss or expired, fetching markets...');
    marketsCache = await fetchAllActiveMarkets();
    keywordIndex = buildKeywordIndex(marketsCache);
    lastFetchTime = now;
  }
  
  return { markets: marketsCache, index: keywordIndex };
}

function analyzeTweet(text) {
  const lower = text.toLowerCase();
  
  const matchedEntities = [];
  for (const keyword of entityKeywords) {
    if (lower.includes(keyword)) {
      matchedEntities.push(keyword);
    }
  }
  
  const matchedGeneric = [];
  for (const keyword of genericKeywords) {
    if (lower.includes(keyword)) {
      matchedGeneric.push(keyword);
    }
  }
  
  return { matchedEntities, matchedGeneric };
}

function getCandidateMarketsForKeywords(matchedEntities) {
  const seen = new Set();
  const candidates = [];
  
  for (const k of matchedEntities) {
    const list = keywordIndex[k] || [];
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      candidates.push(m);
    }
  }
  
  return candidates;
}

function scoreMarketForTweet(market, tweetEntities, tweetGeneric) {
  const mEntities = market._entityKeywords || [];
  const mGeneric = market._genericKeywords || [];
  
  const sharedEntities = mEntities.filter(e => tweetEntities.includes(e));
  if (sharedEntities.length === 0) return 0;
  
  const sharedGeneric = mGeneric.filter(g => tweetGeneric.includes(g));
  
  const entityScore = sharedEntities.length * 10;
  const genericScore = sharedGeneric.length * 1;
  
  const liq = market.liquidityNum || market.liquidity || 0;
  const vol24 = market.volume24hr || market.volumeNum || 0;
  
  const liqScore = Math.log10(1 + liq);
  const volScore = Math.log10(1 + vol24);
  
  return entityScore + genericScore + 2 * liqScore + volScore;
}

function formatMarketData(market) {
  let outcomePrices = [0, 0];
  
  if (market.outcomePrices) {
    try {
      const prices = JSON.parse(market.outcomePrices);
      if (Array.isArray(prices) && prices.length >= 2) {
        outcomePrices = prices.map(p => parseFloat(p) || 0);
      }
    } catch (e) {
      console.error('Error parsing outcomePrices:', e);
    }
  }

  const marketId = market.id || '';
  const marketSlug = market.slug || '';
  const eventSlug = market.events?.[0]?.slug || '';
  
  let url = '#';
  if (eventSlug && marketSlug && marketId) {
    url = `https://polymarket.com/event/${eventSlug}/${marketSlug}?tid=${marketId}`;
  } else if (marketSlug && marketId) {
    url = `https://polymarket.com/event/${marketSlug}?tid=${marketId}`;
  }

  return {
    id: marketId,
    question: market.question || 'Unknown Market',
    outcomes: [
      { price: outcomePrices[0].toString() },
      { price: outcomePrices[1].toString() }
    ],
    volume: market.volumeNum || market.volume || 0,
    url
  };
}

function pickMarketsForTweet(candidates, tweetEntities, tweetGeneric) {
  const scored = candidates
    .map(m => ({
      market: m,
      score: scoreMarketForTweet(m, tweetEntities, tweetGeneric),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  
  const inlineMarkets = scored.slice(0, 2).map(x => formatMarketData(x.market));
  
  const sidebarByKeyword = {};
  for (const k of tweetEntities) {
    const markets = keywordIndex[k] || [];
    sidebarByKeyword[k] = markets
      .slice(0, 10)
      .sort((a, b) => {
        const la = a.liquidityNum || 0, lb = b.liquidityNum || 0;
        const va = a.volumeNum || 0, vb = b.volumeNum || 0;
        return (vb + lb) - (va + la);
      })
      .map(formatMarketData);
  }
  
  return { inlineMarkets, sidebarByKeyword };
}

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

loadKeywords();
getMarketsCache();

chrome.runtime.onInstalled.addListener(() => {
  console.log('[PolyFinder] Extension installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'CHECK_TWEET') {
    const { text, tweetId } = msg;
    
    if (!text || text.length < 10 || !tweetId) {
      sendResponse({ success: false, marketsByKeyword: [] });
      return true;
    }
    
    getMarketsCache().then(() => {
      const { matchedEntities, matchedGeneric } = analyzeTweet(text);
      
      console.log(`[PolyFinder] Tweet ${tweetId} matched entities: [${matchedEntities.slice(0, 5).join(', ')}${matchedEntities.length > 5 ? '...' : ''}]`);
      
      if (matchedEntities.length === 0) {
        console.log(`[PolyFinder] No entity keywords matched, skipping tweet`);
        sendResponse({ success: false, marketsByKeyword: [] });
        return;
      }
      
      const candidates = getCandidateMarketsForKeywords(matchedEntities);
      console.log(`[PolyFinder] Found ${candidates.length} candidate markets`);
      
      const { inlineMarkets, sidebarByKeyword } = pickMarketsForTweet(candidates, matchedEntities, matchedGeneric);
      
      console.log(`[PolyFinder] Sending ${inlineMarkets.length} inline markets for tweet ${tweetId}`);
      if (inlineMarkets.length > 0) {
        inlineMarkets.forEach(m => {
          console.log(`[PolyFinder]   - ${m.question}`);
        });
      }
      
      const marketsByKeyword = inlineMarkets.map((market, i) => ({
        keyword: matchedEntities[0] || 'match',
        primaryMarket: market,
        childMarkets: []
      }));
      
      if (inlineMarkets.length > 0) {
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: {
            markets: inlineMarkets,
            keywords: matchedEntities.slice(0, 10),
            stats: calculateStats(inlineMarkets),
            pageTitle: 'Markets from Twitter feed'
          }
        }).catch(() => {});
      }
      
      sendResponse({
        success: true,
        tweetId,
        keywords: { entities: matchedEntities, generic: matchedGeneric },
        marketsByKeyword,
        sidebarMarketsByKeyword: sidebarByKeyword
      });
    }).catch(error => {
      console.error('[PolyFinder] Error processing CHECK_TWEET:', error);
      sendResponse({ success: false, marketsByKeyword: [] });
    });
    
    return true;
  }
  
  if (msg.action === 'PAGE_LOADED') {
    const { text, title } = msg.payload || {};
    
    if (!text || text.length < 50) {
      console.log('[PolyFinder] PAGE_LOADED ignored - insufficient text');
      return true;
    }
    
    console.log(`[PolyFinder] PAGE_LOADED: ${title}`);
    
    getMarketsCache().then(() => {
      const { matchedEntities, matchedGeneric } = analyzeTweet(text);
      
      console.log(`[PolyFinder] Page matched ${matchedEntities.length} entity keywords, ${matchedGeneric.length} generic keywords`);
      
      if (matchedEntities.length === 0) {
        return;
      }
      
      const candidates = getCandidateMarketsForKeywords(matchedEntities);
      const { inlineMarkets } = pickMarketsForTweet(candidates, matchedEntities, matchedGeneric);
      
      if (inlineMarkets.length > 0) {
        const stats = calculateStats(inlineMarkets);
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: {
            markets: inlineMarkets.slice(0, 10),
            keywords: matchedEntities.slice(0, 10),
            stats,
            pageTitle: title || 'Page Results'
          }
        }).catch(() => {});
      }
    }).catch(error => {
      console.error('[PolyFinder] Error processing PAGE_LOADED:', error);
    });
    
    return true;
  }
  
  if (msg.action === 'FETCH_MARKETS') {
    getMarketsCache().then(({ markets }) => {
      const topMarkets = markets
        .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))
        .slice(0, 10)
        .map(formatMarketData);
      
      const stats = calculateStats(topMarkets);
      
      chrome.runtime.sendMessage({
        action: 'MARKETS_READY',
        payload: {
          markets: topMarkets,
          keywords: [],
          stats,
          pageTitle: 'Top markets by volume'
        }
      }).catch(() => {});
    });
    
    return true;
  }
  
  return false;
});


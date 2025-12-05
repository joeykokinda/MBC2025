let entityKeywords = new Set();
let genericKeywords = new Set();
let marketsData = [];
let keywordIndex = {};
let cacheLoaded = false;

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

async function loadMarketIndex() {
  try {
    console.log('[PolyFinder] Loading pre-built market index...');
    const response = await fetch(chrome.runtime.getURL('data/market_index.json'));
    const data = await response.json();
    
    marketsData = data.markets;
    keywordIndex = data.index;
    cacheLoaded = true;
    
    console.log(`[PolyFinder] ✓ Loaded ${marketsData.length} markets across ${Object.keys(keywordIndex).length} keywords`);
    console.log(`[PolyFinder] Index built at: ${new Date(data.timestamp).toLocaleString()}`);
    
    chrome.runtime.sendMessage({ action: 'CACHE_READY' }).catch(() => {});
  } catch (error) {
    console.error('[PolyFinder] Error loading market index:', error);
  }
}

function expandMarket(compact) {
  let url = '#';
  if (compact.e && compact.s && compact.id) {
    url = `https://polymarket.com/event/${compact.e}/${compact.s}?tid=${compact.id}`;
  } else if (compact.s && compact.id) {
    url = `https://polymarket.com/event/${compact.s}?tid=${compact.id}`;
  }
  
  return {
    id: compact.id,
    question: compact.q,
    outcomes: [
      { price: compact.p[0].toString() },
      { price: compact.p[1].toString() }
    ],
    volume: compact.v,
    liquidity: compact.l,
    url,
    _entityKeywords: compact.ke || [],
    _genericKeywords: compact.kg || []
  };
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

function getCandidateMarkets(matchedEntities, matchedGeneric) {
  const seen = new Set();
  const candidates = [];
  
  for (const kw of matchedEntities) {
    const indices = keywordIndex[kw] || [];
    for (const idx of indices) {
      if (seen.has(idx)) continue;
      seen.add(idx);
      candidates.push(marketsData[idx]);
    }
  }
  
  if (candidates.length < 5) {
    for (const kw of matchedGeneric) {
      const indices = keywordIndex[kw] || [];
      for (const idx of indices) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        candidates.push(marketsData[idx]);
      }
    }
  }
  
  return candidates;
}

function scoreMarket(market, tweetEntities, tweetGeneric) {
  const mEntities = market.ke || [];
  const mGeneric = market.kg || [];
  
  const sharedEntities = mEntities.filter(e => tweetEntities.includes(e));
  const sharedGeneric = mGeneric.filter(g => tweetGeneric.includes(g));
  
  const totalMatches = sharedEntities.length + sharedGeneric.length;
  if (totalMatches === 0) return 0;
  
  const entityScore = sharedEntities.length * 20;
  const genericScore = sharedGeneric.length * 5;
  
  const liqScore = Math.log10(1 + market.l) * 3;
  const volScore = Math.log10(1 + market.v) * 2;
  
  let bonus = 0;
  if (sharedEntities.length > 0 && sharedGeneric.length > 0) {
    bonus = 10;
  }
  
  return entityScore + genericScore + liqScore + volScore + bonus;
}

function pickBestMarkets(candidates, tweetEntities, tweetGeneric) {
  const scored = candidates
    .map(m => ({
      market: m,
      score: scoreMarket(m, tweetEntities, tweetGeneric),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  
  return scored.slice(0, 2).map(x => expandMarket(x.market));
}

function calculateStats(markets) {
  if (!markets || markets.length === 0) {
    return { totalMarkets: 0, avgYesOdds: 0, avgNoOdds: 0, totalVolume: 0 };
  }

  const yesOdds = markets.map(m => parseFloat(m.outcomes?.[0]?.price || 0)).filter(o => o > 0);
  const noOdds = markets.map(m => parseFloat(m.outcomes?.[1]?.price || 0)).filter(o => o > 0);
  const volumes = markets.map(m => parseFloat(m.volume || 0)).filter(v => v > 0);

  return {
    totalMarkets: markets.length,
    avgYesOdds: yesOdds.length > 0 ? yesOdds.reduce((a, b) => a + b, 0) / yesOdds.length : 0,
    avgNoOdds: noOdds.length > 0 ? noOdds.reduce((a, b) => a + b, 0) / noOdds.length : 0,
    totalVolume: volumes.reduce((a, b) => a + b, 0)
  };
}

loadKeywords();
loadMarketIndex();

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
      return false;
    }
    
    if (!cacheLoaded) {
      console.log('[PolyFinder] Cache not ready yet');
      sendResponse({ success: false, marketsByKeyword: [] });
      return false;
    }
    
    try {
      const { matchedEntities, matchedGeneric } = analyzeTweet(text);
      
      console.log(`[PolyFinder] Tweet matched: entities=[${matchedEntities.slice(0, 3).join(', ')}] generic=[${matchedGeneric.slice(0, 2).join(', ')}]`);
      
      if (matchedEntities.length === 0 && matchedGeneric.length === 0) {
        sendResponse({ success: false, marketsByKeyword: [] });
        return false;
      }
      
      const candidates = getCandidateMarkets(matchedEntities, matchedGeneric);
      const markets = pickBestMarkets(candidates, matchedEntities, matchedGeneric);
      
      console.log(`[PolyFinder] Found ${markets.length} markets for tweet`);
      if (markets.length > 0) {
        markets.forEach(m => console.log(`  - ${m.question}`));
      }
      
      const allMatchedKeywords = [...matchedEntities, ...matchedGeneric];
      const marketsByKeyword = markets.map(market => ({
        keyword: allMatchedKeywords[0] || 'match',
        primaryMarket: market,
        childMarkets: []
      }));
      
      if (markets.length > 0) {
        const topKeywords = [...matchedEntities.slice(0, 7), ...matchedGeneric.slice(0, 3)];
        chrome.runtime.sendMessage({
          action: 'MARKETS_READY',
          payload: {
            markets,
            keywords: topKeywords,
            stats: calculateStats(markets),
            pageTitle: 'Markets from Twitter feed'
          }
        }).catch(() => {});
      }
      
      sendResponse({
        success: true,
        tweetId,
        keywords: { entities: matchedEntities, generic: matchedGeneric },
        marketsByKeyword
      });
      
      return false;
    } catch (error) {
      console.error('[PolyFinder] Error processing CHECK_TWEET:', error);
      sendResponse({ success: false, marketsByKeyword: [] });
      return false;
    }
  }
  
  if (msg.action === 'PAGE_LOADED') {
    const { text, title } = msg.payload || {};
    
    if (!text || text.length < 50 || !cacheLoaded) {
      return true;
    }
    
    const { matchedEntities, matchedGeneric } = analyzeTweet(text);
    
    if (matchedEntities.length === 0 && matchedGeneric.length === 0) {
      return true;
    }
    
    const candidates = getCandidateMarkets(matchedEntities, matchedGeneric);
    const markets = pickBestMarkets(candidates, matchedEntities, matchedGeneric);
    
    if (markets.length > 0) {
      const stats = calculateStats(markets);
      chrome.runtime.sendMessage({
        action: 'MARKETS_READY',
        payload: {
          markets: markets.slice(0, 10),
          keywords: [...matchedEntities.slice(0, 7), ...matchedGeneric.slice(0, 3)],
          stats,
          pageTitle: title || 'Page Results'
        }
      }).catch(() => {});
    }
    
    return true;
  }
  
  if (msg.action === 'FETCH_MARKETS') {
    if (!cacheLoaded) {
      return true;
    }
    
    const topMarkets = marketsData
      .sort((a, b) => b.v - a.v)
      .slice(0, 10)
      .map(expandMarket);
    
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
    
    return true;
  }
  
  return false;
});


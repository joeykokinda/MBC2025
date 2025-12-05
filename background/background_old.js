
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
    const response = await fetch(chrome.runtime.getURL('data/keywords_filtered.txt'));
    const text = await response.text();
    allKeywords = text.split('\n')
      .filter(k => k.trim().length > 0)
      .filter(k => !k.startsWith('#'));
    keywordSet = new Set(allKeywords.map(k => k.toLowerCase()));
    console.log(`[PolyFinder] Loaded ${allKeywords.length} keywords`);
  } catch (error) {
    console.error('[PolyFinder] Error loading keywords:', error);
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
  const textLower = text.toLowerCase();
  const words = tokenize(text);
  const hits = [];
  const foundKeywords = new Set();
  
  for (const word of words) {
    if (keywordSet.has(word) && !foundKeywords.has(word)) {
      hits.push(word);
      foundKeywords.add(word);
    }
  }
  
  for (const keyword of allKeywords) {
    const keywordLower = keyword.toLowerCase();
    if (keywordLower.includes(' ')) {
      const regex = new RegExp('\\b' + keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (regex.test(textLower) && !foundKeywords.has(keywordLower)) {
        hits.push(keyword);
        foundKeywords.add(keywordLower);
      }
    }
  }
  
  console.log(`[PolyFinder] Matched ${hits.length} keywords from ${text.length} chars of text`);
  if (hits.length > 0) {
    console.log(`[PolyFinder] Keywords: [${hits.slice(0, 10).join(', ')}${hits.length > 10 ? '...' : ''}]`);
  }
  return hits;
}

loadKeywords();

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
      ?.filter(m => m.active && !m.closed && isMarketGoodQuality(m))
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))[0]
  }));
  
  const validScored = scored.filter(s => s.bestMarket && s.score > 0);
  validScored.sort((a, b) => b.score - a.score);
  
  return validScored[0] || null;
}

async function searchPolymarketByKeyword(keyword) {
  const cacheKey = keyword.toLowerCase();
  const now = Date.now();
  
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (now - cached.timestamp < 300000) {
      console.log(`[PolyFinder] Using cached results for "${keyword}"`);
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
      childMarkets: bestEventData.event.markets
        ?.filter(m => m.active && !m.closed && isMarketGoodQuality(m))
        .slice(0, 5) || []
    } : null;
    
    searchCache.set(cacheKey, { result, timestamp: now });
    
    return result;
  } catch (error) {
    console.error(`[PolyFinder] Error searching for "${keyword}":`, error);
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

  return {
    id: market.id || '',
    question: market.question || 'Unknown Market',
    outcomes: [
      { price: outcomePrices[0].toString() },
      { price: outcomePrices[1].toString() }
    ],
    volume: market.volumeNum || market.volume || 0,
    url: buildPolymarketUrl(market)
  };
}

async function searchMarketsByKeywords(keywordsInput) {
  try {
    const keywords = Array.isArray(keywordsInput) ? keywordsInput : [keywordsInput];
    
    if (keywords.length === 0) {
      console.log(`[PolyFinder] No keywords to search`);
      return [];
    }
    
    console.log(`[PolyFinder] Searching with ${keywords.length} keywords: [${keywords.slice(0, 5).join(', ')}...]`);
    
    const url = `${GAMMA_API_URL}?limit=1000&offset=0&closed=false&active=true`;
    const response = await fetch(url);
    const allMarkets = await response.json();
    
    console.log(`[PolyFinder] Fetched ${allMarkets.length} active markets`);
    
    if (!Array.isArray(allMarkets) || allMarkets.length === 0) {
      return [];
    }
    
    const qualityMarkets = allMarkets.filter(isMarketGoodQuality);
    console.log(`[PolyFinder] Filtered to ${qualityMarkets.length} quality markets, scoring relevance...`);
    
    const scoredMarkets = qualityMarkets.map(market => {
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
      let totalKeywordLength = 0;
      
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        const keywordLength = keyword.length;
        
        const questionMatches = (question.match(new RegExp(keywordLower, 'gi')) || []).length;
        const outcomeMatches = (outcomesText.match(new RegExp(keywordLower, 'gi')) || []).length;
        const descMatches = (description.match(new RegExp(keywordLower, 'gi')) || []).length;
        
        if (questionMatches > 0 || outcomeMatches > 0 || descMatches > 0) {
          matchedKeywords.push(keyword);
          totalKeywordLength += keywordLength;
          
          const wordBonus = keywordLength > 5 ? keywordLength * 2 : keywordLength;
          
          score += questionMatches * 15 * wordBonus;
          score += outcomeMatches * 10 * wordBonus;
          score += descMatches * 5 * wordBonus;
        }
      }
      
      const volumeBoost = Math.log10(market.volumeNum || 1) * 10;
      const liquidityBoost = Math.log10(market.liquidity || 1) * 5;
      const matchDensity = matchedKeywords.length * 20;
      
      score = score + volumeBoost + liquidityBoost + matchDensity;
      
      return {
        market,
        score,
        matchedKeywords,
        volume: market.volumeNum || 0,
        totalKeywordLength
      };
    });
    
    const matched = scoredMarkets.filter(m => m.score > 0);
    
    console.log(`[PolyFinder] Found ${matched.length} markets matching keywords`);
    
    const sorted = matched.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 50) return scoreDiff;
      
      if (b.matchedKeywords.length !== a.matchedKeywords.length) {
        return b.matchedKeywords.length - a.matchedKeywords.length;
      }
      
      return b.volume - a.volume;
    });
    
    if (sorted.length > 0) {
      console.log(`[PolyFinder] Top ${Math.min(5, sorted.length)} matches (by relevance):`);
      sorted.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i+1}. [Score: ${Math.round(m.score)} | Vol: $${Math.round(m.volume).toLocaleString()}] ${m.market.question}`);
        console.log(`      Keywords: [${m.matchedKeywords.slice(0, 5).join(', ')}]`);
      });
    } else {
      console.log(`[PolyFinder] No markets found matching any keywords`);
    }

    return sorted.slice(0, 10).map(m => formatMarketData(m.market));
  } catch (error) {
    console.error('[PolyFinder API] Error searching markets:', error);
    return [];
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

async function fetchRealMarkets() {
  try {
    const url = `${GAMMA_API_URL}?limit=50&offset=0&closed=false&active=true&order=volumeNum&ascending=false`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const qualityMarkets = data.filter(isMarketGoodQuality);
    
    console.log(`[PolyFinder] Filtered ${data.length} markets -> ${qualityMarkets.length} quality markets`);
    
    return qualityMarkets.slice(0, 3).map(formatMarketData);
  } catch (error) {
    console.error('Error fetching markets:', error);
    return [];
  }
}

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
  console.log('PolyFinder Extension installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Open side panel when user clicks extension icon in toolbar
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

async function extractKeywordsFromText(text) {
  console.log(`[PolyFinder Keywords] Matching text against ${allKeywords.length} keywords`);
  const matches = findMatchingKeywords(text);
  
  if (matches.length > 0) {
    console.log(`[PolyFinder Keywords] Found matches: [${matches.join(', ')}]`);
  } else {
    console.log(`[PolyFinder Keywords] No keyword matches found`);
  }
  
  return matches;
}

async function processScrapedTweets(tweets, url, timestamp) {
  console.log('========================================');
  console.log(`[PolyFinder Background] RECEIVED ${tweets.length} TWEETS`);
  console.log(`[PolyFinder Background] From URL: ${url}`);
  console.log('========================================');
  
  const tweetTexts = tweets.map(tweet => ({
    text: tweet.text,
    sender: tweet.sender,
    url: url,
    timestamp: timestamp
  }));
  
  console.log('[PolyFinder Background] Tweet data structure ready for API:');
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
      sendResponse({ success: false, marketsByKeyword: [] });
      return true;
    }
    
    const hits = findMatchingKeywords(text);
    
    if (hits.length === 0) {
      sendResponse({ success: false, marketsByKeyword: [] });
      return true;
    }
    
    console.log(`[PolyFinder] Tweet ${tweetId} matched keywords: [${hits.join(', ')}]`);
    
    searchMarketsByKeywords(hits.slice(0, 5))
      .then(markets => {
        console.log(`[PolyFinder] CHECK_TWEET: Found ${markets.length} markets for tweet`);
        
        if (markets.length === 0) {
          sendResponse({ success: false, marketsByKeyword: [] });
          return;
        }
        
        const marketsByKeyword = markets.slice(0, 3).map(market => ({
          keyword: hits[0],
          primaryMarket: market,
          childMarkets: []
        }));
        
        console.log(`[PolyFinder] CHECK_TWEET: Sending ${marketsByKeyword.length} markets to inject`);
        marketsByKeyword.forEach(m => {
          console.log(`[PolyFinder]   - ${m.primaryMarket.question}`);
        });
        
        const timestamp = Date.now();
        markets.forEach(market => {
          const marketWithTimestamp = {
            ...market,
            timestamp,
            keyword: hits[0]
          };
          tweetMarkets.set(market.id, marketWithTimestamp);
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
        console.error('[PolyFinder] Error processing CHECK_TWEET:', error);
        sendResponse({ success: false, marketsByKeyword: [] });
      });
    
    return true;
  }
  
  if (msg.action === 'CLEAR_CACHE') {
    console.log('[PolyFinder Background] Clearing tweet cache...');
    lastProcessedTweets.clear();
    processingInProgress = false;
    searchCache.clear();
    tweetMarkets.clear();
    return true;
  }
  
  if (msg.action === 'PAGE_LOADED') {
    const { text, title, url } = msg.payload || {};
    
    if (!text || text.length < 50) {
      console.log('[PolyFinder] PAGE_LOADED ignored - insufficient text');
      return true;
    }
    
    console.log(`[PolyFinder] PAGE_LOADED from: ${url}`);
    console.log(`[PolyFinder] Processing ${text.length} characters of text...`);
    
    let matchedKeywords = [];
    
    extractKeywordsFromText(text).then(keywords => {
      matchedKeywords = keywords;
      console.log(`[PolyFinder] Matched keywords: [${keywords.join(', ')}]`);
      
      if (keywords.length === 0) {
        console.log('[PolyFinder] No keywords matched - showing default markets');
        fetchAndSendMarkets();
        return null;
      }
      
      return searchMarketsByKeywords(keywords);
    }).then(markets => {
      if (!markets || markets.length === 0) {
        console.log('[PolyFinder] No markets found - showing default');
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
      
      console.log(`[PolyFinder] Sent ${markets.length} markets to sidebar`);
    }).catch(error => {
      console.error('[PolyFinder] Error processing PAGE_LOADED:', error);
      fetchAndSendMarkets();
    });
    
    return true;
  }
  
  if (msg.action === 'FETCH_MARKETS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && (tabs[0].url.includes('twitter.com') || tabs[0].url.includes('x.com'))) {
        console.log('[PolyFinder] On Twitter, triggering scrape...');
        
        chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
        
        let fallbackTimeout = setTimeout(() => {
          console.log('[PolyFinder] Scrape took too long, showing default markets');
          fetchAndSendMarkets();
        }, 5000);
        
        chrome.tabs.sendMessage(tabs[0].id, { action: 'SCRAPE_PAGE' }, (response) => {
          if (chrome.runtime.lastError) {
            clearTimeout(fallbackTimeout);
            console.log('[PolyFinder] Error triggering scrape, showing default markets');
            fetchAndSendMarkets();
          } else if (response && response.success) {
            clearTimeout(fallbackTimeout);
          }
        });
      } else {
        console.log('[PolyFinder] Not on Twitter, showing default markets');
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
        console.error('[PolyFinder Background] Keyword extraction error:', error);
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
        console.error('[PolyFinder Background] Error searching markets:', error);
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
        console.error('[PolyFinder Background] Keyword to markets error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (msg.action === 'TWEETS_SCRAPED') {
    console.log('[PolyFinder Background] Message received: TWEETS_SCRAPED');
    
    const { tweets, url, timestamp } = msg.payload;
    
    processScrapedTweets(tweets, url, timestamp)
      .then(() => {
        sendResponse({ success: true, processed: tweets.length });
      })
      .catch((error) => {
        console.error('[PolyFinder Background] Error processing tweets:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    if (processingInProgress) {
      console.log('[PolyFinder Background] Already processing tweets, skipping...');
      return true;
    }
    
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('YOUR-API-KEY')) {
      console.error('[PolyFinder Background] No API key configured! Add your Gemini key to config.js');
      return true;
    }
    
    const tweetHashes = tweets.map(t => t.text.substring(0, 50));
    const isDuplicate = tweetHashes.every(hash => lastProcessedTweets.has(hash));
    
    if (isDuplicate) {
      console.log('[PolyFinder Background] These tweets were already processed, skipping...');
      return true;
    }
    
    tweetHashes.forEach(hash => lastProcessedTweets.add(hash));
    
    const tweetsToProcess = tweets.slice(0, 3);
    console.log(`[PolyFinder Background] Auto-processing ${tweetsToProcess.length} NEW tweets...`);
    
    processingInProgress = true;
    
    chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
    
    Promise.all(tweetsToProcess.map(async (tweet) => {
      console.log(`\n[PolyFinder] Processing tweet: "${tweet.text.substring(0, 80)}..."`);
      
      const keywords = await extractKeywordsFromText(tweet.text);
      console.log(`[PolyFinder] Keywords for this tweet:`, keywords);
        
      const markets = await searchMarketsByKeywords(keywords);
      console.log(`[PolyFinder] Found ${markets.length} markets for this tweet\n`);
      
      return {
        tweet: tweet.text,
        sender: tweet.sender,
        keywords: keywords,
        markets: markets
      };
    }))
    .then((results) => {
      console.log('\n========================================');
      console.log(`[PolyFinder] COMPLETED: Processed ${results.length} tweets`);
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
      console.error('[PolyFinder Background] Error processing tweets to markets:', error);
      processingInProgress = false;
    });
    
    return true;
  }
  
  if (msg.action === 'PROCESS_TWEETS_TO_MARKETS') {
    const { tweets } = msg.payload;
    
    chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
    
    Promise.all(tweets.map(async (tweet) => {
      console.log(`\n[PolyFinder] Processing tweet: "${tweet.text.substring(0, 80)}..."`);
      
      const keywords = await extractKeywordsFromText(tweet.text);
      console.log(`[PolyFinder] Keywords for this tweet:`, keywords);
      
      const markets = await searchMarketsByKeywords(keywords);
      console.log(`[PolyFinder] Found ${markets.length} markets for this tweet\n`);
      
      return {
        tweet: tweet.text,
        sender: tweet.sender,
        keywords: keywords,
        markets: markets
      };
    }))
      .then((results) => {
        console.log('\n========================================');
        console.log(`[PolyFinder] COMPLETED: Processed ${results.length} tweets`);
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
        console.error('[PolyFinder Background] Error processing tweets to markets:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }

  return false;
});

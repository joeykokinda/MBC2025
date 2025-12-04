importScripts('config.js');

const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const OPENAI_API_KEY = CONFIG.OPENAI_API_KEY;

let lastProcessedTweets = new Set();
let processingInProgress = false;

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
    console.log(`[PolyFinder API] 🔍 Searching Polymarket for keywords:`, keywords);
    
    const url = `${GAMMA_API_URL}?limit=50&offset=0&closed=false&active=true`;
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`[PolyFinder API] 📊 Fetched ${data.length} total markets from Polymarket`);
    
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const filtered = data.filter(market => {
      const question = (market.question || '').toLowerCase();
      const description = (market.description || '').toLowerCase();
      const combinedText = question + ' ' + description;
      
      return keywords.some(keyword => {
        const keywordLower = keyword.toLowerCase();
        const keywordWords = keywordLower.split(' ');
        
        return keywordWords.every(word => combinedText.includes(word));
      });
    });

    console.log(`[PolyFinder API] ✅ Found ${filtered.length} matching markets`);
    
    if (filtered.length > 0) {
      console.log(`[PolyFinder API] 📋 Top matches:`);
      filtered.slice(0, 3).forEach((m, i) => {
        console.log(`  ${i+1}. ${m.question}`);
      });
    }

    return filtered.slice(0, 5).map(formatMarketData);
  } catch (error) {
    console.error('[PolyFinder API] ❌ Error searching markets:', error);
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

    return data.slice(0, 3).map(formatMarketData);
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

async function extractKeywordsWithGPT(tweetText, apiKey) {
  try {
    console.log(`[PolyFinder GPT] 🤖 Calling GPT for tweet: "${tweetText.substring(0, 60)}..."`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'system',
          content: `You are a prediction market search assistant. Your job is to extract 3-5 search terms from tweets that will find relevant betting markets on Polymarket.

Examples:
Tweet: "Trump leads GOP primary polls by 40 points"
Output: ["trump president", "trump election", "republican primary", "2024 election"]

Tweet: "Bitcoin surges to $95k as institutions buy more"
Output: ["bitcoin price", "bitcoin 100k", "crypto", "btc"]

Tweet: "Will the Fed cut rates next quarter?"
Output: ["fed rate cut", "interest rates", "federal reserve"]

Return ONLY a JSON array of 3-5 search terms that would find relevant prediction markets. No explanations, just the array.`
        }, {
          role: 'user',
          content: tweetText
        }],
        temperature: 0.3,
        max_tokens: 100
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[PolyFinder GPT] ❌ API Error:`, errorData);
      throw new Error(`GPT API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    console.log(`[PolyFinder GPT] 📝 Raw GPT response: ${content}`);
    
    const keywords = JSON.parse(content);
    
    console.log(`[PolyFinder GPT] ✅ Extracted keywords:`, keywords);
    
    return Array.isArray(keywords) ? keywords : [];
  } catch (error) {
    console.error('[PolyFinder GPT] ❌ Error:', error.message);
    return [];
  }
}

async function processScrapedTweets(tweets, url, timestamp) {
  console.log('========================================');
  console.log(`[PolyFinder Background] ✅ RECEIVED ${tweets.length} TWEETS`);
  console.log(`[PolyFinder Background] From URL: ${url}`);
  console.log('========================================');
  
  const tweetTexts = tweets.map(tweet => ({
    text: tweet.text,
    sender: tweet.sender,
    url: url,
    timestamp: timestamp
  }));
  
  console.log('[PolyFinder Background] 📦 Tweet data structure ready for API:');
  console.log(`  - Total tweets: ${tweetTexts.length}`);
  console.log('  - Sample data (first 2 tweets):');
  console.log(JSON.stringify(tweetTexts.slice(0, 2), null, 4));
  console.log('========================================');
  
  return tweetTexts;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'CLEAR_CACHE') {
    console.log('[PolyFinder Background] 🗑️ Clearing tweet cache...');
    lastProcessedTweets.clear();
    processingInProgress = false;
    return true;
  }
  
  if (msg.action === 'FETCH_MARKETS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        let fallbackTimeout = setTimeout(() => {
          console.log('[PolyFinder] No tweets found, showing default markets');
          fetchAndSendMarkets();
        }, 2000);
        
        chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_SCRAPE' }, (response) => {
          if (chrome.runtime.lastError) {
            clearTimeout(fallbackTimeout);
            console.log('[PolyFinder] Not a Twitter page, showing default markets');
            fetchAndSendMarkets();
          } else if (response && response.success) {
            clearTimeout(fallbackTimeout);
          }
        });
      } else {
        fetchAndSendMarkets();
      }
    });
    return true;
  }
  
  if (msg.action === 'EXTRACT_KEYWORDS') {
    const { text, apiKey } = msg.payload;
    
    extractKeywordsWithGPT(text, apiKey)
      .then((keywords) => {
        sendResponse({ 
          success: true, 
          keywords: keywords 
        });
      })
      .catch((error) => {
        console.error('[PolyFinder Background] GPT extraction error:', error);
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
    const { text, apiKey } = msg.payload;
    
    extractKeywordsWithGPT(text, apiKey)
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
        console.error('[PolyFinder Background] GPT to markets error:', error);
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
      console.log('[PolyFinder Background] ⚠️ Already processing tweets, skipping...');
      return true;
    }
    
    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('YOUR-API-KEY')) {
      console.error('[PolyFinder Background] ❌ No API key configured! Add your OpenAI key to background.js');
      return true;
    }
    
    const tweetHashes = tweets.map(t => t.text.substring(0, 50));
    const isDuplicate = tweetHashes.every(hash => lastProcessedTweets.has(hash));
    
    if (isDuplicate) {
      console.log('[PolyFinder Background] ⚠️ These tweets were already processed, skipping...');
      return true;
    }
    
    tweetHashes.forEach(hash => lastProcessedTweets.add(hash));
    
    const tweetsToProcess = tweets.slice(0, 3);
    console.log(`[PolyFinder Background] 🚀 Auto-processing ${tweetsToProcess.length} NEW tweets...`);
    
    processingInProgress = true;
    
    chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
    
    Promise.all(tweetsToProcess.map(async (tweet) => {
      console.log(`\n[PolyFinder] 📝 Processing tweet: "${tweet.text.substring(0, 80)}..."`);
      
      const keywords = await extractKeywordsWithGPT(tweet.text, OPENAI_API_KEY);
      console.log(`[PolyFinder] 🔑 Keywords for this tweet:`, keywords);
        
      const markets = await searchMarketsByKeywords(keywords);
      console.log(`[PolyFinder] 📈 Found ${markets.length} markets for this tweet\n`);
      
      return {
        tweet: tweet.text,
        sender: tweet.sender,
        keywords: keywords,
        markets: markets
      };
    }))
    .then((results) => {
      console.log('\n========================================');
      console.log(`[PolyFinder] ✅ COMPLETED: Processed ${results.length} tweets`);
      console.log('========================================');
      
      const allMarkets = [];
      const allKeywords = [];
      
      results.forEach((r, idx) => {
        console.log(`\n📊 RESULT ${idx + 1}:`);
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
        
        console.log(`\n🎯 SENDING TO SIDEBAR:`);
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
        
        console.log(`✅ Markets sent to sidebar successfully!`);
      } else {
        console.log('\n⚠️ No markets found - keeping existing markets in sidebar');
      }
      
      processingInProgress = false;
    })
    .catch((error) => {
      console.error('[PolyFinder Background] ❌ Error processing tweets to markets:', error);
      processingInProgress = false;
    });
    
    return true;
  }
  
  if (msg.action === 'PROCESS_TWEETS_TO_MARKETS') {
    const { tweets, apiKey } = msg.payload;
    
    chrome.runtime.sendMessage({ action: 'PROCESSING_STARTED' });
    
    Promise.all(tweets.map(async (tweet) => {
      console.log(`\n[PolyFinder] 📝 Processing tweet: "${tweet.text.substring(0, 80)}..."`);
      
      const keywords = await extractKeywordsWithGPT(tweet.text, apiKey);
      console.log(`[PolyFinder] 🔑 Keywords for this tweet:`, keywords);
      
      const markets = await searchMarketsByKeywords(keywords);
      console.log(`[PolyFinder] 📈 Found ${markets.length} markets for this tweet\n`);
      
      return {
        tweet: tweet.text,
        sender: tweet.sender,
        keywords: keywords,
        markets: markets
      };
    }))
      .then((results) => {
        console.log('\n========================================');
        console.log(`[PolyFinder] ✅ COMPLETED: Processed ${results.length} tweets`);
        console.log('========================================');
        
        const allMarkets = [];
        const allKeywords = [];
        
        results.forEach((r, idx) => {
          console.log(`\n📊 RESULT ${idx + 1}:`);
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
          
          console.log(`\n🎯 SENDING TO SIDEBAR:`);
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
          
          console.log(`✅ Markets sent to sidebar successfully!`);
        } else {
          console.log('\n⚠️ No markets found - keeping existing markets in sidebar');
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

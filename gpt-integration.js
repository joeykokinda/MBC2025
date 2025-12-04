console.log('[PolyFinder Integration] Script loaded! API Key configured:', typeof CONFIG !== 'undefined' && CONFIG.OPENAI_API_KEY ? 'YES' : 'NO');

let processingTimeout = null;
let tweetQueue = [];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[PolyFinder Integration] Message received:', msg.action);
  
  if (msg.action === 'TWEETS_SCRAPED') {
    console.log('[PolyFinder Integration] 📨 Received TWEETS_SCRAPED message');
    
    const { tweets } = msg.payload;
    
    if (tweets.length === 0) {
      console.log('[PolyFinder Integration] ⚠️ No tweets in payload');
      return;
    }
    
    console.log(`[PolyFinder Integration] 📝 Received ${tweets.length} tweets, queueing top 3...`);
    tweetQueue = tweets.slice(0, 3);
    
    clearTimeout(processingTimeout);
    
    processingTimeout = setTimeout(() => {
      if (tweetQueue.length > 0) {
        console.log(`\n[PolyFinder Integration] 🚀 Starting GPT processing for ${tweetQueue.length} tweets...`);
        console.log(`[PolyFinder Integration] API Key available: ${CONFIG.OPENAI_API_KEY ? 'YES' : 'NO'}`);
        
        chrome.runtime.sendMessage({
          action: 'PROCESS_TWEETS_TO_MARKETS',
          payload: {
            tweets: tweetQueue,
            apiKey: CONFIG.OPENAI_API_KEY
          }
        }, (response) => {
          if (response && response.success) {
            console.log(`[PolyFinder Integration] ✅ Processing complete! Found ${response.totalMarkets} markets`);
          } else if (response && response.error) {
            console.error(`[PolyFinder Integration] ❌ Error: ${response.error}`);
          } else {
            console.log('[PolyFinder Integration] ⚠️ No response from background');
          }
        });
        
        tweetQueue = [];
      }
    }, 300);
  }
});


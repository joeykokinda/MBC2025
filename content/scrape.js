(function() {
  'use strict';
  
  console.log('===========================================');
  console.log('[PolyFinder Content] SCRIPT STARTING');
  console.log('[PolyFinder Content] URL:', window.location.href);
  console.log('[PolyFinder Content] Chrome runtime exists:', !!chrome.runtime);
  console.log('===========================================');

function safeSendMessage(message, callback) {
  if (!chrome.runtime || !chrome.runtime.id) {
    console.log('[PolyFinder] Extension context invalidated - please refresh page');
    if (callback) callback(null);
    return;
  }
  
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.log('[PolyFinder] Message send error (extension may have reloaded)');
        if (callback) callback(null);
        return;
      }
      if (callback) callback(response);
    });
  } catch (error) {
    console.log('[PolyFinder] Extension context error:', error.message);
    if (callback) callback(null);
  }
}

function scrapeTwitterPage() {
  const title = document.title;
  const articles = Array.from(document.querySelectorAll('article'));

  if (articles.length === 0) {
    return null;
  }

  const tweetText = articles
    .map(article => article.innerText?.trim() || '')
    .filter(Boolean)
    .join('\n\n');

  if (!tweetText) {
    return null;
  }

  const payload = {
    title,
    text: tweetText.substring(0, 20000),
    url: window.location.href,
    timestamp: Date.now()
  };

  console.debug('[PolyFinder] Twitter scrape', {
    title,
    textPreview: payload.text.slice(0, 280),
    totalLength: payload.text.length,
    articleCount: articles.length
  });

  return { ...payload, source: 'twitter' };
}

function scrapeGenericPage() {
  const title = document.title;

  const metaDescription = document.querySelector('meta[name="description"]')?.content ||
    document.querySelector('meta[property="og:description"]')?.content || '';

  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(h => h.textContent.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join(' ');

  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map(p => p.textContent.trim())
    .filter(p => p.length > 50)
    .slice(0, 20)
    .join(' ');

  const mainContent = document.querySelector('main, article, [role="main"]')?.textContent ||
    document.body.textContent;

  const text = `${title}\n${metaDescription}\n${headings}\n${paragraphs}\n${mainContent}`.substring(0, 20000);

  const payload = {
    title,
    text: text.trim(),
    url: window.location.href,
    timestamp: Date.now()
  };

  console.debug('[PolyFinder] Generic scrape', {
    title,
    textPreview: payload.text.slice(0, 280),
    totalLength: payload.text.length
  });

  return { ...payload, source: 'generic' };
}

function scrapePage() {
  const hostname = window.location.hostname.toLowerCase();
  const normalizedHost = hostname.replace(/^www\./, '');
  const isTwitter =
    normalizedHost === 'twitter.com' ||
    normalizedHost.endsWith('.twitter.com') ||
    normalizedHost === 'x.com' ||
    normalizedHost.endsWith('.x.com');

  if (isTwitter) {
    const twitterData = scrapeTwitterPage();
    if (twitterData) {
      return twitterData;
    }
  }

  return scrapeGenericPage();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SCRAPE_PAGE') {
    const scraped = scrapePage();
    sendResponse(scraped);
  }
  
  if (msg.action === 'CACHE_READY') {
    console.log('[PolyFinder Content] ✓ Cache is ready, scanning tweets now');
    if (window.location.href.includes('twitter.com') || window.location.href.includes('x.com')) {
      setTimeout(() => {
        console.log('[PolyFinder Content] Starting initial tweet scan...');
        scanTwitterFeed();
      }, 500);
    }
  }
  
  return true;
});

// Auto-scrape page 2 seconds after it loads
// Sends data to background script automatically
setTimeout(() => {
  safeSendMessage({
    action: 'PAGE_LOADED',
    payload: scrapePage()
  });
}, 2000);

const hostname = window.location.hostname.toLowerCase();
const normalizedHost = hostname.replace(/^www\./, '');
const isTwitter =
  normalizedHost === 'twitter.com' ||
  normalizedHost.endsWith('.twitter.com') ||
  normalizedHost === 'x.com' ||
  normalizedHost.endsWith('.x.com');

if (isTwitter) {
  let lastScrapeTime = Date.now();
  
  setInterval(() => {
    const now = Date.now();
    if (now - lastScrapeTime > 3000) {
      safeSendMessage({
        action: 'PAGE_LOADED',
        payload: scrapePage()
      });
      lastScrapeTime = now;
    }
  }, 3000);
  
  window.addEventListener('scroll', () => {
    const now = Date.now();
    if (now - lastScrapeTime > 3000) {
      safeSendMessage({
        action: 'PAGE_LOADED',
        payload: scrapePage()
      });
      lastScrapeTime = now;
    }
  });
}

// For Twitter/X: Re-scrape when user scrolls and new content loads
const processedTweets = new WeakSet();

function extractTweetText(article) {
  const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
  return tweetTextElement ? tweetTextElement.innerText : '';
}

function createMarketUI(marketData) {
  const { keyword, primaryMarket, childMarkets } = marketData;
  
  if (!primaryMarket) return null;
  
  const yesPrice = parseFloat(primaryMarket.outcomes?.[0]?.price || 0);
  const noPrice = parseFloat(primaryMarket.outcomes?.[1]?.price || 0);
  const marketUrl = primaryMarket.url || 'https://polymarket.com';
  
  const container = document.createElement('a');
  container.href = marketUrl;
  container.target = '_blank';
  container.rel = 'noopener noreferrer';
  container.className = 'polyfinder-market-widget';
  container.style.cssText = `
    display: block;
    margin: 6px 0;
    padding: 12px;
    background: rgba(29, 155, 240, 0.08);
    border: 1px solid rgba(29, 155, 240, 0.3);
    border-radius: 8px;
    text-decoration: none;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;
  
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;">
            <rect width="24" height="24" rx="4" fill="rgb(29, 155, 240)"/>
          </svg>
          <span style="color: rgb(29, 155, 240); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">POLYMARKET</span>
          <span style="color: rgb(139, 148, 158); font-size: 10px;">keyword: ${keyword}</span>
        </div>
        <div style="color: rgb(231, 233, 234); font-size: 14px; font-weight: 500; line-height: 1.4;">
          ${primaryMarket.question || 'Unknown Market'}
        </div>
      </div>
    </div>
    
    <div style="display: flex; gap: 8px;">
      <div style="flex: 1; padding: 10px; background: rgba(0, 186, 124, 0.12); border: 1px solid rgba(0, 186, 124, 0.4); border-radius: 8px; text-align: center;">
        <div style="color: rgb(0, 186, 124); font-size: 10px; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">YES</div>
        <div style="color: rgb(0, 186, 124); font-size: 20px; font-weight: 700;">${(yesPrice * 100).toFixed(0)}¢</div>
      </div>
      <div style="flex: 1; padding: 10px; background: rgba(249, 24, 128, 0.12); border: 1px solid rgba(249, 24, 128, 0.4); border-radius: 8px; text-align: center;">
        <div style="color: rgb(249, 24, 128); font-size: 10px; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">NO</div>
        <div style="color: rgb(249, 24, 128); font-size: 20px; font-weight: 700;">${(noPrice * 100).toFixed(0)}¢</div>
      </div>
    </div>
  `;
  
  return container;
}

function injectMarketsIntoTweet(article, marketsByKeyword) {
  console.log(`[PolyFinder Content] injectMarketsIntoTweet called with ${marketsByKeyword.length} markets`);
  
  const existingWidgets = article.querySelectorAll('.polyfinder-market-container');
  existingWidgets.forEach(w => w.remove());
  
  const container = document.createElement('div');
  container.className = 'polyfinder-market-container';
  container.style.cssText = `
    padding: 12px 16px;
    margin: 0;
    width: 100%;
    box-sizing: border-box;
  `;
  
  marketsByKeyword.slice(0, 2).forEach(marketData => {
    const widget = createMarketUI(marketData);
    if (widget) {
      container.appendChild(widget);
    }
  });
  
  if (container.children.length > 0) {
    article.appendChild(container);
    console.log(`[PolyFinder Content] ✓✓✓ Injected ${container.children.length} markets`);
  }
}

async function checkTweetForMarkets(article) {
  if (processedTweets.has(article)) return;
  processedTweets.add(article);
  
  const tweetText = extractTweetText(article);
  if (!tweetText || tweetText.length < 20) return;
  
  if (!chrome.runtime || !chrome.runtime.id) return;
  
  try {
    const response = await new Promise((resolve) => {
      safeSendMessage({
        action: 'CHECK_TWEET',
        text: tweetText,
        tweetId: article.dataset.tweetId || article.id || `tweet-${Math.random()}`
      }, (resp) => {
        console.log('[PolyFinder Content] Got response:', resp);
        resolve(resp);
      });
    });
    
    console.log('[PolyFinder Content] Processing response:', {
      hasResponse: !!response,
      success: response?.success,
      marketsCount: response?.marketsByKeyword?.length
    });
    
    if (response && response.success && response.marketsByKeyword && response.marketsByKeyword.length > 0) {
      console.log(`[PolyFinder Content] ✓ Injecting ${response.marketsByKeyword.length} market(s) into tweet`);
      injectMarketsIntoTweet(article, response.marketsByKeyword);
    }
  } catch (error) {
    console.error('[PolyFinder] Error checking tweet:', error);
  }
}

let scanThrottle = 0;

function scanTwitterFeed() {
  const now = Date.now();
  if (now - scanThrottle < 2000) return;
  scanThrottle = now;
  
  const articles = document.querySelectorAll('article');
  console.log(`[PolyFinder Content] Scanning ${articles.length} articles`);
  
  let checked = 0;
  
  articles.forEach(article => {
    if (!processedTweets.has(article)) {
      checkTweetForMarkets(article);
      checked++;
    }
  });
  
  console.log(`[PolyFinder Content] Checked ${checked} new tweets`);
}

if (window.location.href.includes('twitter.com') || window.location.href.includes('x.com')) {
  console.log('[PolyFinder Content] ✓ Twitter detected, setting up injection');
  
  window.addEventListener('scroll', () => {
    scanTwitterFeed();
  }, { passive: true });
  
  let observerThrottle = 0;
  const observer = new MutationObserver(() => {
    const now = Date.now();
    if (now - observerThrottle > 1000) {
      observerThrottle = now;
      scanTwitterFeed();
    }
  });
  
  setTimeout(() => {
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[PolyFinder Content] ✓ Observer attached');
  }, 1000);
  
  setTimeout(() => {
    console.log('[PolyFinder Content] Running initial scan...');
    scanTwitterFeed();
  }, 3000);
} else {
  console.log('[PolyFinder Content] Not on Twitter, skipping injection setup');
}

})();

// CONTENT SCRIPT - Runs on every webpage
// This file is injected into every page you visit
// Purpose: Extract text content from the page for analysis

// Scrape the current page and extract:
// - Page title
// - Meta description
// - Headings (h1, h2, h3)
// - Paragraphs
// - Main content
// Returns object with: { title, text, url, timestamp }
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

  console.debug('[Jaeger] Twitter scrape', {
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

  console.debug('[Jaeger] Generic scrape', {
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

// Listen for messages from background script
// When background asks to scrape, send back the scraped data
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SCRAPE_PAGE') {
    const scraped = scrapePage();
    sendResponse(scraped);
  }
  return true;
});

// Auto-scrape page 2 seconds after it loads
// Sends data to background script automatically
setTimeout(() => {
  chrome.runtime.sendMessage({
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
      chrome.runtime.sendMessage({
        action: 'PAGE_LOADED',
        payload: scrapePage()
      });
      lastScrapeTime = now;
    }
  }, 3000);
  
  window.addEventListener('scroll', () => {
    const now = Date.now();
    if (now - lastScrapeTime > 3000) {
      chrome.runtime.sendMessage({
        action: 'PAGE_LOADED',
        payload: scrapePage()
      });
      lastScrapeTime = now;
    }
  });
}

// For Twitter/X: Re-scrape when user scrolls and new content loads
let lastScrapeTime = 0;
const SCRAPE_THROTTLE = 3000;

function handleTwitterScroll() {
  const now = Date.now();
  if (now - lastScrapeTime < SCRAPE_THROTTLE) {
    return;
  }
  
  const isTwitter = window.location.href.includes('twitter.com') || window.location.href.includes('x.com');
  if (!isTwitter) return;
  
  lastScrapeTime = now;
  console.log('[Jaeger] Re-scraping Twitter due to scroll...');
  
  chrome.runtime.sendMessage({
    action: 'PAGE_LOADED',
    payload: scrapePage()
  });
}

// Listen for scroll events on Twitter
const processedTweets = new WeakSet();

function extractTweetText(article) {
  const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
  return tweetTextElement ? tweetTextElement.innerText : '';
}

function createMarketUI(marketData) {
  const { keyword, primaryMarket, childMarkets } = marketData;
  
  if (!primaryMarket) return null;
  
  const container = document.createElement('div');
  container.className = 'polyfinder-market-widget';
  container.style.cssText = `
    margin: 12px 0;
    padding: 12px;
    background: #1a1a1a;
    border: 1px solid #2f3336;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;
  
  const yesPrice = (parseFloat(primaryMarket.outcomePrices?.[0]) || 0);
  const noPrice = (parseFloat(primaryMarket.outcomePrices?.[1]) || 0);
  
  const marketUrl = primaryMarket.slug 
    ? `https://polymarket.com/event/${primaryMarket.slug}`
    : `https://polymarket.com`;
  
  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span style="color: #1d9bf0; font-weight: bold; font-size: 12px;">📊 POLYMARKET</span>
      <span style="color: #71767b; font-size: 11px;">keyword: ${keyword}</span>
    </div>
    <a href="${marketUrl}" target="_blank" style="color: #e7e9ea; text-decoration: none; display: block; margin-bottom: 10px; font-size: 14px; font-weight: 500; line-height: 1.4;">
      ${primaryMarket.question || 'Unknown Market'}
    </a>
    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <div style="flex: 1; padding: 8px; background: #0a3a1f; border: 1px solid #00ba7c; border-radius: 8px; text-align: center;">
        <div style="color: #00ba7c; font-size: 11px; font-weight: 600; margin-bottom: 2px;">YES</div>
        <div style="color: #00ba7c; font-size: 16px; font-weight: bold;">${(yesPrice * 100).toFixed(0)}¢</div>
      </div>
      <div style="flex: 1; padding: 8px; background: #3a0a0a; border: 1px solid #f91880; border-radius: 8px; text-align: center;">
        <div style="color: #f91880; font-size: 11px; font-weight: 600; margin-bottom: 2px;">NO</div>
        <div style="color: #f91880; font-size: 16px; font-weight: bold;">${(noPrice * 100).toFixed(0)}¢</div>
      </div>
    </div>
    ${childMarkets && childMarkets.length > 1 ? `
      <div style="font-size: 11px; color: #71767b; margin-top: 8px;">
        +${childMarkets.length - 1} more market${childMarkets.length > 2 ? 's' : ''} in this event
      </div>
    ` : ''}
  `;
  
  return container;
}

function injectMarketsIntoTweet(article, marketsByKeyword) {
  if (processedTweets.has(article)) return;
  processedTweets.add(article);
  
  const existingWidget = article.querySelector('.polyfinder-market-widget');
  if (existingWidget) {
    existingWidget.remove();
  }
  
  const tweetContent = article.querySelector('[data-testid="tweetText"]');
  if (!tweetContent) return;
  
  const insertPoint = tweetContent.closest('[data-testid="tweet"]') || tweetContent.parentElement;
  if (!insertPoint) return;
  
  marketsByKeyword.slice(0, 2).forEach(marketData => {
    const widget = createMarketUI(marketData);
    if (widget) {
      insertPoint.appendChild(widget);
    }
  });
}

async function checkTweetForMarkets(article) {
  if (processedTweets.has(article)) return;
  
  const tweetText = extractTweetText(article);
  if (!tweetText || tweetText.length < 10) return;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_TWEET',
      text: tweetText,
      tweetId: article.id || Math.random().toString()
    });
    
    if (response && response.success && response.marketsByKeyword && response.marketsByKeyword.length > 0) {
      console.log(`[Jaeger] Found ${response.marketsByKeyword.length} market(s) for tweet`);
      injectMarketsIntoTweet(article, response.marketsByKeyword);
    }
  } catch (error) {
    console.error('[Jaeger] Error checking tweet:', error);
  }
}

function scanTwitterFeed() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  articles.forEach(article => {
    if (!processedTweets.has(article)) {
      checkTweetForMarkets(article);
    }
  });
}

if (window.location.href.includes('twitter.com') || window.location.href.includes('x.com')) {
  window.addEventListener('scroll', handleTwitterScroll, { passive: true });
  
  const observer = new MutationObserver(() => {
    handleTwitterScroll();
    scanTwitterFeed();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  setTimeout(() => scanTwitterFeed(), 2000);
  
  console.log('[Jaeger] Twitter continuous scraping + injection enabled');
}

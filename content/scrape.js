// CONTENT SCRIPT - Runs on every webpage
// This file is injected into every page you visit
// Purpose: Extract text content from the page for analysis

// UI now handled by twitter-ui.js

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

// Use UI from twitter-ui.js
function createMarketUI(marketData) {
  return window.createMarketCard ? window.createMarketCard(marketData) : null;
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

// Twitter-specific initialization
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

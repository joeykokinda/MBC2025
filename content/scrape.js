// CONTENT SCRIPT - Twitter/X Tweet Scraper
// This file runs on every webpage and scrapes visible tweets
// Purpose: Extract text and sender from tweets currently visible on screen

// IMMEDIATE TEST - This should appear in console immediately if script loads
console.log('🔵 PolyFinder content script file loaded!');

// Check if an element is visible in the viewport
function isElementVisible(element) {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= windowHeight &&
    rect.right <= windowWidth
  );
}

// Check if an element is partially visible in the viewport
function isElementPartiallyVisible(element) {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < windowHeight &&
    rect.left < windowWidth
  );
}

// Get all tweet container elements from the page
function getTweetContainers() {
  // Twitter/X uses article elements with data-testid="tweet"
  const tweetSelectors = [
    'article[data-testid="tweet"]',
    'article[role="article"]',
    'div[data-testid="tweet"]'
  ];
  
  for (const selector of tweetSelectors) {
    const tweets = Array.from(document.querySelectorAll(selector));
    if (tweets.length > 0) {
      console.log(`[PolyFinder Scraper] Found ${tweets.length} tweets using selector: ${selector}`);
      return tweets;
    }
  }
  
  // Diagnostic: check what article elements exist
  const allArticles = document.querySelectorAll('article');
  console.log(`[PolyFinder Scraper] Found ${allArticles.length} article elements total`);
  if (allArticles.length > 0) {
    const firstArticle = allArticles[0];
    console.log('[PolyFinder Scraper] First article attributes:', {
      'data-testid': firstArticle.getAttribute('data-testid'),
      'role': firstArticle.getAttribute('role'),
      'class': firstArticle.className
    });
  }
  
  console.log('[PolyFinder Scraper] No tweets found with any selector');
  return [];
}

// Extract tweet text from a tweet element
function extractTweetText(tweetElement) {
  // Try multiple selectors for tweet text
  const textSelectors = [
    'div[data-testid="tweetText"]',
    '[data-testid="tweetText"]',
    'div[lang]',
    'span[lang]'
  ];
  
  for (const selector of textSelectors) {
    const textElement = tweetElement.querySelector(selector);
    if (textElement) {
      const text = textElement.textContent || textElement.innerText;
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    }
  }
  
  // Fallback: get all text content and filter
  const allText = tweetElement.textContent || tweetElement.innerText;
  return allText ? allText.trim() : '';
}

// Extract sender/author from a tweet element
function extractTweetSender(tweetElement) {
  // Try multiple selectors for user name
  const senderSelectors = [
    'div[data-testid="User-Name"]',
    '[data-testid="User-Name"]',
    'a[role="link"][href*="/"]',
    'span[dir="ltr"]'
  ];
  
  for (const selector of senderSelectors) {
    const senderElement = tweetElement.querySelector(selector);
    if (senderElement) {
      // Try to get the username from href or text
      const link = senderElement.closest('a[href*="/"]') || senderElement.querySelector('a[href*="/"]');
      if (link && link.href) {
        const match = link.href.match(/twitter\.com\/([^\/\?]+)|x\.com\/([^\/\?]+)/);
        if (match) {
          return match[1] || match[2];
        }
      }
      
      const text = senderElement.textContent || senderElement.innerText;
      if (text && text.trim().length > 0 && !text.includes('@')) {
        return text.trim();
      }
    }
  }
  
  // Fallback: look for @username pattern in links
  const links = tweetElement.querySelectorAll('a[href*="/"]');
  for (const link of links) {
    if (link.href) {
      const match = link.href.match(/twitter\.com\/([^\/\?]+)|x\.com\/([^\/\?]+)/);
      if (match) {
        const username = match[1] || match[2];
        if (username && username !== 'home' && username !== 'explore') {
          return username;
        }
      }
    }
  }
  
  return 'Unknown';
}

// Scrape all visible tweets and return JSON array
function scrapeVisibleTweets() {
  const tweetContainers = getTweetContainers();
  const visibleTweets = [];
  
  tweetContainers.forEach((tweetElement) => {
    // Check if tweet is fully or partially visible
    if (isElementVisible(tweetElement) || isElementPartiallyVisible(tweetElement)) {
      const text = extractTweetText(tweetElement);
      const sender = extractTweetSender(tweetElement);
      
      // Only include tweets with actual text content
      if (text && text.length > 0) {
        visibleTweets.push({
          text: text,
          sender: sender
        });
      }
    }
  });
  
  return visibleTweets;
}

// Output scraped tweets to console
function outputScrapedTweets() {
  const tweets = scrapeVisibleTweets();
  console.log('=== PolyFinder: Scraped Visible Tweets ===');
  console.log(JSON.stringify(tweets, null, 2));
  console.log(`Total visible tweets: ${tweets.length}`);
  console.log('==========================================');
}

// Setup scroll listener to scrape on scroll
function setupScrollListener() {
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    // Debounce: only scrape after user stops scrolling for 300ms
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      outputScrapedTweets();
    }, 300);
  });
}

// Initialize scraper when page loads
function initializeScraper() {
  console.log('[PolyFinder Scraper] Content script loaded and initializing...');
  console.log('[PolyFinder Scraper] Current URL:', window.location.href);
  
  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[PolyFinder Scraper] DOM loaded, waiting for tweets...');
      setTimeout(() => {
        outputScrapedTweets();
        setupScrollListener();
      }, 2000);
    });
  } else {
    console.log('[PolyFinder Scraper] DOM already loaded, waiting for tweets...');
    setTimeout(() => {
      outputScrapedTweets();
      setupScrollListener();
    }, 2000);
  }
}

// Start the scraper
initializeScraper();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SCRAPE_TWEETS') {
    const tweets = scrapeVisibleTweets();
    sendResponse({ tweets: tweets });
  }
  return true;
});

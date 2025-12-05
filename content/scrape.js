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

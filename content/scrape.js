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
function scrapePage() {
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
  
  return {
    title,
    text: text.trim(),
    url: window.location.href,
    timestamp: Date.now()
  };
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

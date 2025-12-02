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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SCRAPE_PAGE') {
    const scraped = scrapePage();
    sendResponse(scraped);
  }
  return true;
});

setTimeout(() => {
  chrome.runtime.sendMessage({
    action: 'PAGE_LOADED',
    payload: scrapePage()
  });
}, 2000);


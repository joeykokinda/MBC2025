export function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, 20000);
}

export function extractMainContent() {
  const selectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.post',
    '.article-body'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element.textContent;
    }
  }

  return document.body.textContent;
}


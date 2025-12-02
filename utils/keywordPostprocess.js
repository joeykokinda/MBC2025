export function normalizeKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  
  return keywords
    .map(k => k.toLowerCase().trim())
    .filter(k => k.length > 2 && k.length < 50)
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, 5);
}

export function combineKeywords(keywords) {
  return keywords.join(' ');
}

export function extractEntities(text) {
  const entities = [];
  
  const patterns = [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
    /\b\d{4}\b/g,
    /#[a-zA-Z0-9_]+/g,
    /\$[A-Z]{2,5}\b/g
  ];

  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      entities.push(...matches);
    }
  });

  return [...new Set(entities)].slice(0, 10);
}


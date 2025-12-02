export function calculateRelevanceScore(market, keywords) {
  if (!market || !keywords || keywords.length === 0) return 0;

  const marketText = `${market.question || ''} ${market.description || ''}`.toLowerCase();
  const keywordText = keywords.join(' ').toLowerCase();

  let score = 0;
  keywords.forEach(keyword => {
    if (marketText.includes(keyword.toLowerCase())) {
      score += 1;
    }
  });

  return score / keywords.length;
}

export function sortMarketsByRelevance(markets, keywords) {
  if (!markets || markets.length === 0) return [];

  return markets
    .map(market => ({
      ...market,
      relevanceScore: calculateRelevanceScore(market, keywords)
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function calculateConfidence(market) {
  if (!market.outcomes || market.outcomes.length < 2) return 0;

  const yesPrice = parseFloat(market.outcomes[0]?.price || 0);
  const noPrice = parseFloat(market.outcomes[1]?.price || 0);

  if (yesPrice === 0 && noPrice === 0) return 0;

  const spread = Math.abs(yesPrice - noPrice);
  return Math.min(spread * 100, 100);
}


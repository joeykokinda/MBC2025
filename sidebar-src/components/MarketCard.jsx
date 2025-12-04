// MARKET CARD COMPONENT
// Displays a single Polymarket market with:
// - Question/title
// - Yes/No odds (as percentages)
// - Trading volume
// - Link to view on Polymarket

export default function MarketCard({ market }) {
  const question = market.question || market.title || 'Unknown Market';
  const yesPrice = market.outcomes?.[0]?.price || 0;
  const noPrice = market.outcomes?.[1]?.price || 0;
  const volume = market.volume || 0;
  const url = market.url || market.slug || '#';

  const yesPercent = (parseFloat(yesPrice) * 100).toFixed(1);
  const noPercent = (parseFloat(noPrice) * 100).toFixed(1);

  return (
    <div className="market-card data-panel">
      <h3 className="market-question">{question}</h3>
      
      <div className="market-odds">
        <div className="odds-row">
          <span className="odds-label">Yes</span>
          <span className="odds-value yes">{yesPercent}%</span>
        </div>
        <div className="odds-row">
          <span className="odds-label">No</span>
          <span className="odds-value no">{noPercent}%</span>
        </div>
      </div>

      {volume > 0 && (
        <div className="market-volume">
          Volume: ${parseFloat(volume).toLocaleString()}
        </div>
      )}

      <a 
        href={url.startsWith('http') ? url : `https://polymarket.com${url}`}
        target="_blank" 
        rel="noopener noreferrer"
        className="market-link"
      >
        View on Polymarket →
      </a>
    </div>
  );
}

// MARKET CARD COMPONENT - Compact Card Design
// Clean, minimal design showing essential market info

export default function MarketCard({ market }) {
  const question = market.question || market.title || 'Unknown Market';
  const yesPrice = market.outcomes?.[0]?.price || 0;
  const noPrice = market.outcomes?.[1]?.price || 0;
  const volume = market.volume || 0;
  const url = market.url || market.slug || '#';

  const yesPercent = parseFloat(yesPrice) * 100;
  const noPercent = parseFloat(noPrice) * 100;

  return (
    <a 
      href={url.startsWith('http') ? url : `https://polymarket.com${url}`}
      target="_blank" 
      rel="noopener noreferrer"
      className="market-card"
    >
      <div className="market-card-content">
        <div className="market-header">
          <h3 className="market-question">{question}</h3>
          {volume > 0 && (
            <span className="market-volume">${(parseFloat(volume) / 1000).toFixed(0)}k</span>
          )}
        </div>
        
        {/* Horizontal Odds Bar - Visual Progress */}
        <div className="odds-bar">
          <div className="odds-bar-yes" style={{ width: `${yesPercent}%` }}></div>
          <div className="odds-bar-no" style={{ width: `${noPercent}%` }}></div>
        </div>
        
        {/* Compact Odds Display */}
        <div className="market-odds">
          <div className="odds-pill yes">
            <span className="odds-label">Yes</span>
            <span className="odds-value">{yesPercent.toFixed(0)}%</span>
          </div>
          <div className="odds-pill no">
            <span className="odds-label">No</span>
            <span className="odds-value">{noPercent.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </a>
  );
}

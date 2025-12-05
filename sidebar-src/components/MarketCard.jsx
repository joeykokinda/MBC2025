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
        
        {/* Polymarket Link Indicator */}
        <div className="market-link-footer">
          <span className="market-link-text">View on Polymarket</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 3C3.22386 3 3 3.22386 3 3.5C3 3.77614 3.22386 4 3.5 4V3ZM8.5 3.5H9C9 3.22386 8.77614 3 8.5 3V3.5ZM8 8.5C8 8.77614 8.22386 9 8.5 9C8.77614 9 9 8.77614 9 8.5H8ZM2.64645 8.85355C2.45118 8.65829 2.45118 8.34171 2.64645 8.14645L5.82843 4.96447C6.02369 4.7692 6.34027 4.7692 6.53553 4.96447C6.7308 5.15973 6.7308 5.47631 6.53553 5.67157L3.70711 8.5L6.53553 11.3284C6.7308 11.5237 6.7308 11.8403 6.53553 12.0355C6.34027 12.2308 6.02369 12.2308 5.82843 12.0355L2.64645 8.85355ZM3.5 4H8.5V3H3.5V4ZM8 3.5V8.5H9V3.5H8Z" fill="currentColor"/>
          </svg>
        </div>
      </div>
    </a>
  );
}

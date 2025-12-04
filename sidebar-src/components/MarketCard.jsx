// MARKET CARD COMPONENT - High-Density Trading Row
// Features:
// - Visual horizontal odds bar (progress bar split between Yes/No)
// - Compact odds display
// - Trading volume
// - Clean trade link

export default function MarketCard({ market }) {
  const question = market.question || market.title || 'Unknown Market';
  const yesPrice = market.outcomes?.[0]?.price || 0;
  const noPrice = market.outcomes?.[1]?.price || 0;
  const volume = market.volume || 0;
  const url = market.url || market.slug || '#';

  const yesPercent = parseFloat(yesPrice) * 100;
  const noPercent = parseFloat(noPrice) * 100;

  return (
    <div className="market-card">
      <h3 className="market-question">{question}</h3>
      
      {/* Horizontal Odds Bar - Visual Progress */}
      <div className="odds-bar-container">
        <div className="odds-bar">
          <div className="odds-bar-yes" style={{ width: `${yesPercent}%` }}></div>
          <div className="odds-bar-no" style={{ width: `${noPercent}%` }}></div>
        </div>
        
        {/* Odds Values */}
        <div className="market-odds">
          <div className="odds-row">
            <span className="odds-label">Yes</span>
            <span className="odds-value yes">{yesPercent.toFixed(1)}%</span>
          </div>
          <div className="odds-row">
            <span className="odds-label">No</span>
            <span className="odds-value no">{noPercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Market Footer - Volume + Trade Link */}
      <div className="market-footer">
        {volume > 0 && (
          <div className="market-volume">
            ${parseFloat(volume).toLocaleString()} vol
          </div>
        )}
        
        <a 
          href={url.startsWith('http') ? url : `https://polymarket.com${url}`}
          target="_blank" 
          rel="noopener noreferrer"
          className="market-link"
        >
          Trade →
        </a>
      </div>
    </div>
  );
}

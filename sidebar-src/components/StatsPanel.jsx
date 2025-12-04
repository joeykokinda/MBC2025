// STATISTICS PANEL COMPONENT - 2x2 Grid Dashboard
// Displays aggregate market statistics in a compact grid layout:
// - Total Markets
// - Average Yes Odds
// - Average No Odds  
// - Total Volume (highlighted, spans full width)

export default function StatsPanel({ stats }) {
  if (!stats) return null;

  return (
    <div className="stats-panel">
      <h3 className="panel-title">Market Overview</h3>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Markets</span>
          <span className="stat-value">{stats.totalMarkets}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Avg Yes</span>
          <span className="stat-value">{(stats.avgYesOdds * 100).toFixed(1)}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Avg No</span>
          <span className="stat-value">{(stats.avgNoOdds * 100).toFixed(1)}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Volume</span>
          <span className="stat-value">${stats.totalVolume.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

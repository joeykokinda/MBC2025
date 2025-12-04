// STATISTICS PANEL COMPONENT
// Displays aggregate statistics about the markets:
// - Total number of markets
// - Average Yes odds
// - Average No odds
// - Total trading volume

export default function StatsPanel({ stats }) {
  if (!stats) return null;

  return (
    <div className="stats-panel data-panel">
      <h3 className="panel-title">Market Statistics</h3>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Total Markets</span>
          <span className="stat-value">{stats.totalMarkets}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Avg Yes Odds</span>
          <span className="stat-value">{(stats.avgYesOdds * 100).toFixed(1)}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Avg No Odds</span>
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

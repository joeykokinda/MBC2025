// STATISTICS PANEL COMPONENT - Compact Inline Stats
// Displays aggregate market statistics in a single row

export default function StatsPanel({ stats }) {
  if (!stats) return null;

  return (
    <div className="stats-panel">
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">{stats.totalMarkets}</span>
          <span className="stat-value">markets</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">•</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">${(stats.totalVolume / 1000000).toFixed(1)}M</span>
          <span className="stat-label">volume</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">•</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{(stats.avgYesOdds * 100).toFixed(0)}%</span>
          <span className="stat-label">avg yes</span>
        </div>
      </div>
    </div>
  );
}

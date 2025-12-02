// MAIN REACT APP - Side Panel UI
// This is the main component that displays in Chrome's side panel
// Shows: markets, statistics, page info, keywords

import { useState, useEffect } from 'react';
import MarketCard from './components/MarketCard';
import StatsPanel from './components/StatsPanel';
import Spinner from './components/Spinner';

export default function App() {
  // STATE: Store markets, keywords, stats, loading state, etc.
  const [markets, setMarkets] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('');
  const [error, setError] = useState(null);

  // SETUP: When side panel opens, request data from background script
  useEffect(() => {
    // Listen for market data from background script
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'MARKETS_READY') {
        setMarkets(msg.payload.markets || []);
        setKeywords(msg.payload.keywords || []);
        setStats(msg.payload.stats || null);
        setPageTitle(msg.payload.pageTitle || '');
        setLoading(false);
        setError(msg.payload.error || null);
      }
    });

    // Request markets immediately
    chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });
  }, []);

  // Refresh button handler - fetch markets again
  const handleRefresh = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });
  };

  // RENDER: Display UI based on state
  return (
    <div className="sidebar-container">
      <header className="sidebar-header">
        <h1>PolyFinder</h1>
        <button onClick={handleRefresh} className="refresh-btn">
          ↻ Refresh
        </button>
      </header>

      {/* Show page title and keywords if available */}
      {pageTitle && (
        <div className="page-info">
          <p className="page-title">{pageTitle}</p>
          {keywords.length > 0 && (
            <div className="keywords">
              {keywords.map((kw, i) => (
                <span key={i} className="keyword-tag">{kw}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Show loading spinner, error, or markets */}
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <>
          {/* Statistics panel */}
          {stats && <StatsPanel stats={stats} />}
          
          {/* List of markets */}
          <div className="markets-list">
            {markets.length === 0 ? (
              <div className="no-markets">No relevant markets found</div>
            ) : (
              markets.map((market, index) => (
                <MarketCard key={market.id || index} market={market} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

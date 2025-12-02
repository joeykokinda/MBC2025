import { useState, useEffect } from 'react';
import MarketCard from './components/MarketCard';
import StatsPanel from './components/StatsPanel';
import Spinner from './components/Spinner';

export default function App() {
  const [markets, setMarkets] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
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

    chrome.runtime.sendMessage({ action: 'SCRAPE_CURRENT_PAGE' });
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ action: 'SCRAPE_CURRENT_PAGE' });
  };

  return (
    <div className="sidebar-container">
      <header className="sidebar-header">
        <h1>PolyFinder</h1>
        <button onClick={handleRefresh} className="refresh-btn">
          ↻ Refresh
        </button>
      </header>

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

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <>
          {stats && <StatsPanel stats={stats} />}
          
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


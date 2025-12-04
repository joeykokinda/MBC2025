// MAIN REACT APP - Side Panel UI
// This is the main component that displays in Chrome's side panel
// Shows: markets, statistics, page info, keywords

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
  const [processing, setProcessing] = useState(false);
  const [noTweets, setNoTweets] = useState(false);

  useEffect(() => {
    let processingTimeout;
    
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'MARKETS_READY') {
        const newMarkets = msg.payload.markets || [];
        
        if (newMarkets.length > 0) {
          setMarkets(newMarkets);
          setKeywords(msg.payload.keywords || []);
          setStats(msg.payload.stats || null);
          setPageTitle(msg.payload.pageTitle || '');
          setNoTweets(false);
        }
        
        setLoading(false);
        setProcessing(false);
        clearTimeout(processingTimeout);
        setError(msg.payload.error || null);
      }
      
      if (msg.action === 'PROCESSING_STARTED') {
        setProcessing(true);
        setLoading(false);
        
        processingTimeout = setTimeout(() => {
          setProcessing(false);
        }, 15000);
      }
    });

    chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' });
    chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });
  };

  return (
    <div className="sidebar-container">
      <header className="sidebar-header">
        <h1>PolyFinder</h1>
        <button onClick={handleRefresh} className="refresh-btn">
          ↻ Refresh
        </button>
      </header>

      {processing && (
        <div className="processing-banner">
          Looking for markets...
        </div>
      )}

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
              <div className="no-markets">Loading relevant markets...</div>
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

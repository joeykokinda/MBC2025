// MAIN REACT APP - Side Panel UI with Base Account Integration
// Uses Base Account connector for seamless wallet onboarding
// Shows: markets, statistics, page info, keywords, and wallet connection

import { useState, useEffect, useMemo } from 'react';
import { http, createConfig, WagmiProvider, useAccount, useConnect, useDisconnect } from 'wagmi';
import { base } from 'wagmi/chains';
import { baseAccount } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInWithBaseButton } from '@base-org/account-ui/react';

import MarketCard from './components/MarketCard';
import StatsPanel from './components/StatsPanel';
import Spinner from './components/Spinner';
import FilterBar from './components/FilterBar';

// Wagmi configuration with Base Account connector
const config = createConfig({
  chains: [base],
  connectors: [
    baseAccount({
      appName: 'JAEGER',
    }),
  ],
  transports: {
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

function PolyFinderContent() {
  // Get wallet connection status and connector
  const { isConnected, address } = useAccount();
  const { connectors, connect, status, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  
  // STATE: Store markets, keywords, stats, loading state, etc.
  const [markets, setMarkets] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('');
  const [error, setError] = useState(null);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [noTweets, setNoTweets] = useState(false);
  
  // Filter & View State
  const [sortBy, setSortBy] = useState('volume');
  const [viewMode, setViewMode] = useState('grid');
  
  // Lazy Loading State
  const [displayedCount, setDisplayedCount] = useState(0); // Will be calculated based on screen size
  const [initialLoadCalculated, setInitialLoadCalculated] = useState(false);
  const LOAD_MORE_COUNT = 4; // Load 4 more at a time when scrolling

  // Get the Base Account connector
  const baseAccountConnector = connectors.find(
    (connector) => connector.name === 'Base Account'
  );

  // Log connection errors
  useEffect(() => {
    if (connectError) {
      console.error('Wallet connection error:', connectError);
      setConnectingWallet(false);
    }
  }, [connectError]);

  // Log connection status changes
  useEffect(() => {
    console.log('Connection status:', status, 'isConnected:', isConnected);
    if (status === 'success') {
      setConnectingWallet(false);
    }
  }, [status, isConnected]);

  // Clear all data when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      console.log('Wallet disconnected - clearing all data'); // wallet wall
      setMarkets([]);
      setKeywords([]);
      setStats(null);
      setPageTitle('');
      setError(null);
      setProcessing(false);
      setNoTweets(false);
      setLoading(true);
      setConnectingWallet(false);
      setShowWalletMenu(false);
    }
  }, [isConnected]);

  // SETUP: When side panel opens, request data from background script
  useEffect(() => {
    let processingTimeout;
    
    const handleMessage = (msg) => {
      console.log('[JAEGER UI] Received message:', msg.action, msg.payload);
      
      // Only process messages if user is connected
      if (!isConnected) {
        console.log('[JAEGER UI] Ignoring message - user not connected');
        return;
      }
      
      if (msg.action === 'MARKETS_READY') {
        const newMarkets = msg.payload.markets || [];
        
        // Always update state, even if markets are empty
        setMarkets(newMarkets);
        setKeywords(msg.payload.keywords || []);
        setStats(msg.payload.stats || null);
        setPageTitle(msg.payload.pageTitle || '');
        setNoTweets(newMarkets.length === 0);
        
        setLoading(false);
        setProcessing(false);
        clearTimeout(processingTimeout);
        setError(msg.payload.error || null);
        
        console.log('[JAEGER UI] Updated state:', {
          markets: newMarkets.length,
          keywords: msg.payload.keywords?.length || 0,
          pageTitle: msg.payload.pageTitle
        });
        
        // Log first market with full URL for debugging
        if (newMarkets.length > 0) {
          console.log('[JAEGER UI] First market:', {
            question: newMarkets[0].question,
            url: newMarkets[0].url,
            id: newMarkets[0].id
          });
        }
      }
      
      if (msg.action === 'PROCESSING_STARTED') {
        setProcessing(true);
        setLoading(false);
        
        processingTimeout = setTimeout(() => {
          setProcessing(false);
        }, 15000);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    // Only fetch markets if user is connected
    if (isConnected) {
      console.log('[JAEGER UI] User connected - fetching markets');
      chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });
    } else {
      console.log('[JAEGER UI] User not connected - skipping market fetch');
      setLoading(false);
    }

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      clearTimeout(processingTimeout);
    };
  }, [isConnected]);

  // Refresh button handler - fetch markets again (only when connected)
  const handleRefresh = () => {
    if (!isConnected) {
      console.log('Cannot refresh - user not connected');
      return;
    }
    setLoading(true);
    chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' });
    chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });
  };

  // Handle disconnect/logout - Complete reset
  const handleDisconnect = () => {
    console.log('Disconnecting wallet and clearing all data...');
    
    // Disconnect wallet
    disconnect();
    
    // Reset all UI state
    setShowWalletMenu(false);
    setMarkets([]);
    setKeywords([]);
    setStats(null);
    setPageTitle('');
    setLoading(true);
    setError(null);
    setConnectingWallet(false);
    setProcessing(false);
    setNoTweets(false);
    
    // Clear any cached data in background script
    chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' });
    
    console.log('Disconnect complete - returning to login screen');
  };

  // Sort markets based on selected sort option
  const sortedMarkets = useMemo(() => {
    const marketsCopy = [...markets];
    
    switch (sortBy) {
      case 'volume':
        return marketsCopy.sort((a, b) => {
          const volA = parseFloat(a.volume) || 0;
          const volB = parseFloat(b.volume) || 0;
          return volB - volA;
        });
      
      case 'odds':
        return marketsCopy.sort((a, b) => {
          const oddsA = parseFloat(a.outcomes?.[0]?.price) || 0;
          const oddsB = parseFloat(b.outcomes?.[0]?.price) || 0;
          return oddsB - oddsA;
        });
      
      case 'recent':
        // Assuming markets are already in recent order from API
        return marketsCopy;
      
      default:
        return marketsCopy;
    }
  }, [markets, sortBy]);

  // Get only the markets to display (lazy loading)
  const visibleMarkets = useMemo(() => {
    // Fallback: if displayedCount is 0, show at least 6 markets
    const count = displayedCount > 0 ? displayedCount : Math.min(6, sortedMarkets.length);
    return sortedMarkets.slice(0, count);
  }, [sortedMarkets, displayedCount]);

  // Calculate initial number of markets that fit on screen
  useEffect(() => {
    if (!isConnected || markets.length === 0 || initialLoadCalculated) return;

    const calculateInitialLoad = () => {
      const contentWrapper = document.querySelector('.markets-content-wrapper');
      if (!contentWrapper) return;

      const viewportHeight = contentWrapper.clientHeight;
      const filterBarHeight = 80; // Approximate filter bar height
      const availableHeight = viewportHeight - filterBarHeight;

      // Estimate card heights (including gap)
      const cardHeight = viewMode === 'list' ? 120 : 210; // List mode is shorter
      
      // Calculate how many cards fit, add 2 extra for smooth experience
      const cardsThatFit = Math.floor(availableHeight / cardHeight) + 2;
      const initialCount = Math.max(4, Math.min(cardsThatFit, markets.length));

      console.log('[LazyLoad] Initial load calculation:', {
        viewportHeight,
        availableHeight,
        cardHeight,
        cardsThatFit,
        initialCount
      });

      setDisplayedCount(initialCount);
      setInitialLoadCalculated(true);
    };

    // Small delay to ensure DOM is ready
    setTimeout(calculateInitialLoad, 100);
  }, [isConnected, markets.length, viewMode, initialLoadCalculated]);

  // Reset when markets or sort changes
  useEffect(() => {
    setInitialLoadCalculated(false);
    setDisplayedCount(0);
  }, [markets, sortBy]);

  // Lazy loading scroll handler - only after initial load
  useEffect(() => {
    if (!initialLoadCalculated || displayedCount === 0) return;

    const contentWrapper = document.querySelector('.markets-content-wrapper');
    if (!contentWrapper) return;

    const handleScroll = () => {
      const scrollTop = contentWrapper.scrollTop;
      const scrollHeight = contentWrapper.scrollHeight;
      const clientHeight = contentWrapper.clientHeight;
      
      // Load more when user scrolls to within 150px of bottom
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceFromBottom < 150 && displayedCount < sortedMarkets.length) {
        console.log('[LazyLoad] Loading more markets...', {
          current: displayedCount,
          total: sortedMarkets.length,
          adding: LOAD_MORE_COUNT
        });
        setDisplayedCount(prev => Math.min(prev + LOAD_MORE_COUNT, sortedMarkets.length));
      }
    };

    contentWrapper.addEventListener('scroll', handleScroll);
    return () => contentWrapper.removeEventListener('scroll', handleScroll);
  }, [displayedCount, sortedMarkets.length, LOAD_MORE_COUNT, initialLoadCalculated]);

  // Toggle wallet menu
  const toggleWalletMenu = () => {
    setShowWalletMenu(!showWalletMenu);
  };

  // Close wallet menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showWalletMenu && !event.target.closest('.wallet-menu-container')) {
        setShowWalletMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showWalletMenu]);

  // Handle Base Account connection
  async function handleBaseAccountConnect() {
    if (!baseAccountConnector) {
      console.error('Base Account connector not found');
      return;
    }

    try {
      setConnectingWallet(true);
      console.log('Connecting to Base Account...');
      
      // Use Wagmi's connect function to properly connect the wallet
      await connect({ connector: baseAccountConnector });
      
      console.log('Wallet connected successfully!');
    } catch (err) {
      console.error('Connection error:', err);
      setConnectingWallet(false);
    }
  }

  // RENDER: Display UI based on state
  return (
    <div className="sidebar-container">
      <header className="sidebar-header">
        <h1>JAEGER</h1>
        {isConnected && (
          <div className="header-actions">
            <button onClick={handleRefresh} className="refresh-btn" title="Refresh markets">
              ↻
            </button>
            <div className="wallet-menu-container">
              <button 
                onClick={toggleWalletMenu} 
                className="wallet-address-btn" 
                title="Click for account menu"
              >
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </button>
              
              {/* Wallet Dropdown Menu */}
              {showWalletMenu && (
                <div className="wallet-dropdown-menu">
                  <div className="wallet-menu-header">
                    <div className="wallet-menu-title">Account</div>
                  </div>
                  <div className="wallet-menu-address">
                    <span className="address-label">Address</span>
                    <span className="address-full">{address}</span>
                  </div>
                  <button onClick={handleDisconnect} className="disconnect-btn">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10.6667 11.3333L14 8L10.6667 4.66667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Sign in screen for non-connected users */}
      {!isConnected && (
        <div className="simple-login-screen">
          <div className="login-content">
            <div className="login-icon">
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">

                <rect width="80" height="80" rx="16" fill="url(#goldGradient)"/>
                <defs>
                  <linearGradient id="goldGradient" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#f4d03f"/>
                    <stop offset="100%" stopColor="#d4af37"/>
                  </linearGradient>
                </defs>
                <path d="M40 20L50 35H30L40 20Z" fill="#000" opacity="0.9"/>
                <path d="M30 40H50L40 60L30 40Z" fill="#000" opacity="0.6"/>
              </svg>
            </div>
            <h2>Sign in with Base</h2>
            <p>Connect your wallet to discover prediction markets related to any webpage you visit</p>
            <div className="login-buttons">
              {baseAccountConnector && (
                <SignInWithBaseButton
                  onClick={handleBaseAccountConnect}
                  variant="solid"
                  colorScheme="dark"
                  align="center"
                  className="sign-in-base-btn"
                  disabled={connectingWallet}
                />
              )}
              {connectingWallet && (
                <p className="connecting-text">Connecting wallet...</p>
              )}
              {connectError && (
                <p className="connection-error">{connectError.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content - Only visible when connected */}
      {isConnected && (
        <div className="markets-content-wrapper">
          {/* Processing banner */}
          {processing && (
            <div className="processing-banner">
              Looking for markets...
            </div>
          )}

          {/* Show loading spinner, error, or markets */}
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : (
            <>
              {/* Filter Bar - Replaces page-info and stats-panel */}
              {markets.length > 0 && (
                <FilterBar 
                  markets={markets}
                  sortBy={sortBy}
                  viewMode={viewMode}
                  onSortChange={setSortBy}
                  onViewChange={setViewMode}
                />
              )}
              
              {/* List of markets - Lazy loaded */}
              <div className={`markets-list ${viewMode === 'list' ? 'list-view' : 'grid-view'}`}>
                {markets.length === 0 ? (
                  <div className="no-markets">
                    {processing ? 'Looking for markets...' : 'No relevant markets found'}
                  </div>
                ) : (
                  <>
                    {visibleMarkets.map((market, index) => (
                      <MarketCard key={`${sortBy}-${market.id || index}`} market={market} />
                    ))}
                    
                    {/* Loading More Indicator */}
                    {displayedCount < sortedMarkets.length && (
                      <div className="loading-more">
                        <div className="loading-more-spinner"></div>
                        <span>Loading more markets...</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Main App component with providers
export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <PolyFinderContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// MAIN REACT APP - Side Panel UI with Base Account Integration
// Uses Base Account connector for seamless wallet onboarding
// Shows: markets, statistics, page info, keywords, and wallet connection

import { useState, useEffect, useMemo } from 'react';
import { http, createConfig, WagmiProvider, useAccount, useConnect, useDisconnect } from 'wagmi';
import { base } from 'wagmi/chains';
import { baseAccount } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MarketCard from './components/MarketCard';
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

function JaegerContent() {
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
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  
  // Filter & View State
  const [sortBy, setSortBy] = useState('volume');
  const [viewMode, setViewMode] = useState('grid');
  const [frequency, setFrequency] = useState('all');
  const [marketStatus, setMarketStatus] = useState('active');
  
  // Theme State
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to dark
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('jaeger-theme');
      return savedTheme || 'dark';
    }
    return 'dark';
  });

  // Get the Base Account connector
  const baseAccountConnector = connectors.find(
    (connector) => connector.name === 'Base Account'
  );

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
      root.classList.add('light-mode');
    } else {
      root.removeAttribute('data-theme');
      root.classList.remove('light-mode');
    }
    // Save to localStorage
    localStorage.setItem('jaeger-theme', theme);
  }, [theme]);

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

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
      console.log('Wallet disconnected - clearing all data');
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
      setIsDisconnecting(false);
    }
  }, [isConnected]);

  // SETUP: When side panel opens, request data from background script
  useEffect(() => {
    let processingTimeout;
    
    const handleMessage = (msg) => {
      console.log('[JAEGER UI] Received message:', msg.action, msg.payload);
      
      // Only process messages if user is connected and not disconnecting
      if (!isConnected || isDisconnecting) {
        console.log('[JAEGER UI] Ignoring message - user not connected or disconnecting');
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
  }, [isConnected, isDisconnecting]);

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
  const handleDisconnect = async () => {
    // Prevent multiple disconnect calls
    if (isDisconnecting) {
      console.log('Disconnect already in progress...');
      return;
    }

    console.log('Disconnecting wallet and clearing all data...');
    setIsDisconnecting(true);
    
    // Close wallet menu first to prevent any UI conflicts
    setShowWalletMenu(false);
    
    // Immediately clear all UI state before disconnecting
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
    try {
      chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' });
    } catch (err) {
      console.error('Error clearing cache:', err);
    }
    
    // Small delay to ensure UI updates before disconnect
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Disconnect wallet
    try {
      disconnect();
    } catch (err) {
      console.error('Error disconnecting:', err);
    } finally {
      setIsDisconnecting(false);
    }
    
    console.log('Disconnect complete - returning to login screen');
  };

  // Filter and sort markets based on selected options
  // Only process when connected - return empty array if not connected
  const sortedMarkets = useMemo(() => {
    // Don't process markets if not connected
    if (!isConnected) {
      return [];
    }

    let filtered = [...markets];

    // Filter by status (active/resolved)
    if (marketStatus === 'active') {
      filtered = filtered.filter(market => {
        const endDate = market.endDate ? new Date(market.endDate) : null;
        return !endDate || endDate > new Date();
      });
    } else if (marketStatus === 'resolved') {
      filtered = filtered.filter(market => {
        const endDate = market.endDate ? new Date(market.endDate) : null;
        return endDate && endDate <= new Date();
      });
    }

    // Filter by frequency (time range)
    if (frequency !== 'all') {
      const now = new Date();
      filtered = filtered.filter(market => {
        const endDate = market.endDate ? new Date(market.endDate) : null;
        if (!endDate) return true; // Include markets without end dates
        
        const timeDiff = endDate.getTime() - now.getTime();
        const daysUntilEnd = timeDiff / (1000 * 3600 * 24);

        switch (frequency) {
          case 'daily':
            return daysUntilEnd <= 1;
          case 'weekly':
            return daysUntilEnd <= 7;
          case 'monthly':
            return daysUntilEnd <= 30;
          default:
            return true;
        }
      });
    }

    // Helper functions for sorting
    const getMarketVolume = (market) => parseFloat(market?.volume) || 0;
    const getLiquidity = (market) => parseFloat(market?.liquidity) || getMarketVolume(market);
    const getMaxYesOdds = (market) => {
      if (Array.isArray(market?.options) && market.options.length > 0) {
        return market.options.reduce((max, option) => {
          const yesPrice = parseFloat(option?.yesPrice) || 0;
          return yesPrice > max ? yesPrice : max;
        }, 0);
      }
      return parseFloat(market?.outcomes?.[0]?.price) || 0;
    };
    const getEndTime = (market) => {
      const endDate = market.endDate ? new Date(market.endDate) : null;
      return endDate ? endDate.getTime() : Number.MAX_SAFE_INTEGER;
    };

    // Sort the filtered results
    switch (sortBy) {
      case 'volume':
      case 'totalVolume':
        return filtered.sort((a, b) => getMarketVolume(b) - getMarketVolume(a));
      case 'liquidity':
        return filtered.sort((a, b) => getLiquidity(b) - getLiquidity(a));
      case 'ending':
        return filtered.sort((a, b) => getEndTime(a) - getEndTime(b));
      case 'odds':
        return filtered.sort((a, b) => getMaxYesOdds(b) - getMaxYesOdds(a));
      case 'recent':
      default:
        return filtered;
    }
  }, [markets, sortBy, frequency, marketStatus, isConnected]);

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
        <div className="header-logo-title">
          <div className="header-logo">
            <img 
              src={typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getURL('assets/jaeger_animal.png') : '/assets/jaeger_animal.png'} 
              alt="JAEGER Logo" 
              className="logo-image"
              onError={(e) => {
                console.error('Failed to load logo image');
                e.target.style.display = 'none';
              }}
            />
          </div>
          <h1>JAEGER</h1>
        </div>
        <div className="header-actions">
          {/* Theme Toggle - Always visible */}
          <button 
            onClick={toggleTheme} 
            className="theme-toggle-btn" 
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 1v3M12 20v3M23 12h-3M4 12H1M19.07 4.93l-2.12 2.12M6.05 17.95l-2.12 2.12M19.07 19.07l-2.12-2.12M6.05 6.05l-2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          
          {isConnected && (
            <>
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
                  <button 
                    onClick={handleDisconnect} 
                    className="disconnect-btn"
                    disabled={isDisconnecting}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10.6667 11.3333L14 8L10.6667 4.66667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </header>

      {/* Sign in screen for non-connected users */}
      {!isConnected && (
        <div className="simple-login-screen">
          {/* Animated Background Elements */}
          <div className="animated-bg-element bg-element-1"></div>
          <div className="animated-bg-element bg-element-2"></div>
          <div className="animated-bg-element bg-element-3"></div>
          <div className="animated-bg-element bg-element-4"></div>
          <div className="animated-bg-element bg-element-5"></div>
          <div className="animated-bg-element bg-element-6"></div>
          
          <div className="login-content">
            <div className="login-icon">
              <div className="jaeger-logo">
                <img 
                  src={typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getURL('assets/jaeger_animal.png') : '/assets/jaeger_animal.png'} 
                  alt="JAEGER Logo" 
                  className="logo-image"
                  onError={(e) => {
                    console.error('Failed to load logo image');
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            </div>
            <h2>Sign in with Base</h2>
            <p>Connect your wallet to discover prediction markets</p>
            <div className="login-buttons">
              {baseAccountConnector && (
                <button
                  type="button"
                  onClick={handleBaseAccountConnect}
                  className="sign-in-base-btn"
                  disabled={connectingWallet}
                >
                  {connectingWallet ? 'Connecting…' : 'Sign in with Base'}
                </button>
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
              {isConnected && markets.length > 0 && (
                <FilterBar 
                  markets={sortedMarkets}
                  sortBy={sortBy}
                  viewMode={viewMode}
                  frequency={frequency}
                  marketStatus={marketStatus}
                  onSortChange={setSortBy}
                  onViewChange={setViewMode}
                  onFrequencyChange={setFrequency}
                  onStatusChange={setMarketStatus}
                />
              )}
              
              {/* List of markets - Only show when connected */}
              {isConnected && (
                <div 
                  key={sortBy} 
                  className={`markets-list ${viewMode === 'list' ? 'list-view' : 'grid-view'}`}
                >
                  {markets.length === 0 ? (
                    <div className="no-markets">
                      {processing ? 'Looking for markets...' : 'No relevant markets found'}
                    </div>
                  ) : (
                    sortedMarkets.map((market, index) => (
                      <MarketCard key={market.id || index} market={market} />
                    ))
                  )}
                </div>
              )}
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
        <JaegerContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

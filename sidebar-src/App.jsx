// MAIN REACT APP - Side Panel UI with Base Account Integration
// Uses Base Account connector for seamless wallet onboarding
// Shows: markets, statistics, page info, keywords, and wallet connection

import { useState, useEffect } from 'react';
import { http, createConfig, WagmiProvider, useAccount, useConnect, useDisconnect } from 'wagmi';
import { base } from 'wagmi/chains';
import { baseAccount } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInWithBaseButton } from '@base-org/account-ui/react';

import MarketCard from './components/MarketCard';
import StatsPanel from './components/StatsPanel';
import Spinner from './components/Spinner';

// Wagmi configuration with Base Account connector
const config = createConfig({
  chains: [base],
  connectors: [
    baseAccount({
      appName: 'PolyFinder',
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

  // SETUP: When side panel opens, request data from background script
  useEffect(() => {
    let processingTimeout;
    
    const handleMessage = (msg) => {
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
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    // Request markets immediately
    chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      clearTimeout(processingTimeout);
    };
  }, []);

  // Refresh button handler - fetch markets again
  const handleRefresh = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' });
    chrome.runtime.sendMessage({ action: 'FETCH_MARKETS' });
  };

  // Handle disconnect/logout
  const handleDisconnect = () => {
    console.log('Disconnecting wallet...');
    disconnect();
    setShowWalletMenu(false);
    // Reset any local state if needed
    setMarkets([]);
    setKeywords([]);
    setStats(null);
    setPageTitle('');
    setLoading(true);
  };

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
        <h1>PolyFinder</h1>
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
                <rect width="80" height="80" rx="16" fill="#4285f4"/>
                <path d="M40 20L50 35H30L40 20Z" fill="white"/>
                <path d="M30 40H50L40 60L30 40Z" fill="white" fillOpacity="0.7"/>
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

      {/* Main content for connected users - Scrollable */}
      {isConnected && (
        <div className="markets-content-wrapper">
          {/* Processing banner */}
          {processing && (
            <div className="processing-banner">
              Looking for markets...
            </div>
          )}

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
                  <div className="no-markets">
                    {processing ? 'Looking for markets...' : 'No relevant markets found'}
                  </div>
                ) : (
                  markets.map((market, index) => (
                    <MarketCard key={market.id || index} market={market} />
                  ))
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

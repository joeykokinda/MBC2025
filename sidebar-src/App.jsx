// MAIN REACT APP - Side Panel UI with Base Wallet Integration
// This is the main component that displays in Chrome's side panel
// Shows: markets, statistics, page info, keywords, and wallet connection

import { useState, useEffect } from 'react';
import { http, createConfig, WagmiProvider, useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { 
  Wallet,
  ConnectWallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from '@coinbase/onchainkit/identity';
import '@coinbase/onchainkit/styles.css';

import MarketCard from './components/MarketCard';
import StatsPanel from './components/StatsPanel';
import Spinner from './components/Spinner';

// Wagmi configuration for Base network
const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

function PolyFinderContent() {
  // Get wallet connection status
  const { isConnected } = useAccount();
  
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
        {isConnected && (
          <div className="header-actions">
            <button onClick={handleRefresh} className="refresh-btn" aria-label="Refresh markets">
              ↻
            </button>
            <Wallet>
              <ConnectWallet className="connect-wallet-btn">
                <Avatar className="h-6 w-6" />
                <Name className="wallet-name" />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="wallet-identity" hasCopyAddressOnClick>
                  <Avatar />
                  <Name />
                  <Address />
                  <EthBalance />
                </Identity>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </div>
        )}
      </header>

      {/* Simple login screen for non-connected users */}
      {!isConnected && (
        <div className="simple-login-screen">
          <div className="login-content">
            <div className="login-icon">
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="80" height="80" rx="16" fill="#0052FF"/>
                <path d="M40 20L50 35H30L40 20Z" fill="white"/>
                <path d="M30 40H50L40 60L30 40Z" fill="white" fillOpacity="0.7"/>
              </svg>
            </div>
            <h2>Sign in with Base</h2>
            <p>A fast and secure way to discover prediction markets and make payments onchain</p>
            <div className="login-buttons">
              <Wallet>
                <ConnectWallet className="primary-signin-btn">
                  Sign in
                </ConnectWallet>
              </Wallet>
            </div>
          </div>
        </div>
      )}

      {/* Only show markets content when connected */}
      {isConnected && (
        <>
          {/* Show page title and keywords if available */}
          {pageTitle && (
            <div className="page-info data-panel">
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
        </>
      )}
    </div>
  );
}

// Main App component with providers
export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={import.meta.env.VITE_ONCHAINKIT_API_KEY || undefined}
          chain={base}
          config={{
            appearance: {
              name: 'PolyFinder',
              logo: chrome.runtime.getURL('assets/icon48.png'),
              mode: 'dark',
              theme: 'default',
            },
            wallet: {
              display: 'modal',
              termsUrl: 'https://polymarket.com/terms',
              privacyUrl: 'https://polymarket.com/privacy',
            },
          }}
        >
          <PolyFinderContent />
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

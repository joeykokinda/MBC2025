// MAIN REACT APP - Side Panel UI with Base Wallet Integration
// This is the main component that displays in Chrome's side panel
// Shows: markets, statistics, page info, keywords, and wallet connection

import { useState, useEffect } from 'react';
import { http, createConfig, WagmiProvider } from 'wagmi';
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
        <div className="header-actions">
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
          <button onClick={handleRefresh} className="refresh-btn">
            ↻ Refresh
          </button>
        </div>
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

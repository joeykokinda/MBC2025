// MAIN REACT APP - Side Panel UI with Wallet Integration
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
  AppWithWalletModal,
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

// Wagmi configuration
const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

function PolyFinderContent() {
  const [markets, setMarkets] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('');
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);

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
          <AppWithWalletModal>
            <PolyFinderContent />
          </AppWithWalletModal>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
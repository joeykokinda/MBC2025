// BACKGROUND SERVICE WORKER
// This file runs in the background and handles:
// - Opening the side panel when extension icon is clicked
// - Processing scraped page data
// - Sending market data to the side panel UI
// - Message passing between content script and side panel

// EXAMPLE MARKETS DATA
// Currently returns hardcoded example markets
// TODO: Replace with real Polymarket API calls when ready
function getExampleMarkets() {
  return [
    {
      id: '1',
      question: 'Will Bitcoin reach $100,000 by end of 2025?',
      outcomes: [
        { price: '0.65' },
        { price: '0.35' }
      ],
      volume: '1250000',
      url: '/event/will-bitcoin-reach-100k-2025'
    },
    {
      id: '2',
      question: 'Will the S&P 500 close above 5,500 on Dec 31, 2025?',
      outcomes: [
        { price: '0.72' },
        { price: '0.28' }
      ],
      volume: '890000',
      url: '/event/sp500-5500-dec-2025'
    },
    {
      id: '3',
      question: 'Will there be a recession in the US in 2025?',
      outcomes: [
        { price: '0.38' },
        { price: '0.62' }
      ],
      volume: '2100000',
      url: '/event/us-recession-2025'
    },
    {
      id: '4',
      question: 'Will AI replace 50% of software jobs by 2026?',
      outcomes: [
        { price: '0.45' },
        { price: '0.55' }
      ],
      volume: '1560000',
      url: '/event/ai-replace-software-jobs-2026'
    },
    {
      id: '5',
      question: 'Will Ethereum ETF be approved by SEC in 2025?',
      outcomes: [
        { price: '0.58' },
        { price: '0.42' }
      ],
      volume: '980000',
      url: '/event/ethereum-etf-sec-2025'
    },
    {
      id: '6',
      question: 'Will there be a major cyber attack on US infrastructure in 2025?',
      outcomes: [
        { price: '0.32' },
        { price: '0.68' }
      ],
      volume: '750000',
      url: '/event/cyber-attack-us-infrastructure-2025'
    },
    {
      id: '7',
      question: 'Will Apple release AR glasses in 2025?',
      outcomes: [
        { price: '0.55' },
        { price: '0.45' }
      ],
      volume: '640000',
      url: '/event/apple-ar-glasses-2025'
    },
    {
      id: '8',
      question: 'Will the Fed cut rates by more than 1% in 2025?',
      outcomes: [
        { price: '0.48' },
        { price: '0.52' }
      ],
      volume: '1120000',
      url: '/event/fed-rate-cuts-2025'
    }
  ];
}

// Calculate statistics from markets array
// Returns: totalMarkets, avgYesOdds, avgNoOdds, totalVolume
function calculateStats(markets) {
  if (!markets || markets.length === 0) {
    return {
      totalMarkets: 0,
      avgYesOdds: 0,
      avgNoOdds: 0,
      totalVolume: 0
    };
  }

  const yesOdds = markets
    .map(m => parseFloat(m.outcomes?.[0]?.price || 0))
    .filter(odds => odds > 0);
  
  const noOdds = markets
    .map(m => parseFloat(m.outcomes?.[1]?.price || 0))
    .filter(odds => odds > 0);

  const volumes = markets
    .map(m => parseFloat(m.volume || 0))
    .filter(v => v > 0);

  return {
    totalMarkets: markets.length,
    avgYesOdds: yesOdds.length > 0 ? yesOdds.reduce((a, b) => a + b, 0) / yesOdds.length : 0,
    avgNoOdds: noOdds.length > 0 ? noOdds.reduce((a, b) => a + b, 0) / noOdds.length : 0,
    totalVolume: volumes.reduce((a, b) => a + b, 0)
  };
}

// Process scraped page data and send markets to side panel
// Called when: page loads, user clicks refresh, or manually triggered
async function processPage(payload) {
  const { text, title } = payload;
  
  // TODO: Replace with real keyword extraction (GPT API, etc.)
  const keywords = ['crypto', 'markets', 'finance', 'technology'];
  
  // TODO: Replace with real Polymarket API call
  const markets = getExampleMarkets();
  const stats = calculateStats(markets);

  // Simulate API delay, then send data to side panel
  setTimeout(() => {
    chrome.runtime.sendMessage({
      action: 'MARKETS_READY',
      payload: {
        markets,
        keywords,
        stats,
        pageTitle: title || 'Current Page'
      }
    });
  }, 500);
}

// SETUP: Runs when extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('PolyFinder Extension installed');
  
  // Enable side panel to open when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Open side panel when user clicks extension icon in toolbar
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// MESSAGE HANDLER: Receives messages from content script and side panel
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  // Process page data (from content script or side panel)
  if (msg.action === 'PROCESS_PAGE') {
    processPage(msg.payload);
  }

  // Auto-process when page loads (from content script)
  if (msg.action === 'PAGE_LOADED') {
    processPage(msg.payload);
  }

  // Side panel requests to scrape current page
  if (msg.action === 'SCRAPE_CURRENT_PAGE') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // Ask content script to scrape the page
      chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_PAGE' }, (scraped) => {
        if (scraped) {
          processPage(scraped);
        }
      });
    }
  }

  return true;
});

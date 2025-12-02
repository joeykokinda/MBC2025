// BACKGROUND SERVICE WORKER
// This file runs in the background and handles:
// - Opening the side panel when extension icon is clicked
// - Fetching real markets from Polymarket Gamma API
// - Sending market data to the side panel UI
// - Message passing between content script and side panel

const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';

// Fetch top 3 markets by volume from Polymarket Gamma API
async function fetchRealMarkets() {
  try {
    const url = `${GAMMA_API_URL}?limit=3&offset=0&closed=false&active=true&order=volumeNum&ascending=false`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    return data.slice(0, 3).map(market => {
      let outcomePrices = [0, 0];
      
      if (market.outcomePrices) {
        try {
          const prices = JSON.parse(market.outcomePrices);
          if (Array.isArray(prices) && prices.length >= 2) {
            outcomePrices = prices.map(p => parseFloat(p) || 0);
          }
        } catch (e) {
          console.error('Error parsing outcomePrices:', e);
        }
      }

      const marketId = market.id || '';
      const marketSlug = market.slug || '';
      const eventSlug = market.events?.[0]?.slug || '';
      
      const marketUrl = eventSlug && marketSlug && marketId
        ? `https://polymarket.com/event/${eventSlug}/${marketSlug}?tid=${marketId}`
        : marketSlug && marketId
        ? `https://polymarket.com/event/${marketSlug}?tid=${marketId}`
        : '#';

      return {
        id: marketId,
        question: market.question || 'Unknown Market',
        outcomes: [
          { price: outcomePrices[0].toString() },
          { price: outcomePrices[1].toString() }
        ],
        volume: market.volumeNum || market.volume || 0,
        url: marketUrl
      };
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    return [];
  }
}

// Calculate statistics from markets array
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

// Fetch markets and send to side panel
async function fetchAndSendMarkets() {
  const keywords = [];
  const markets = await fetchRealMarkets();
  const stats = calculateStats(markets);

  chrome.runtime.sendMessage({
    action: 'MARKETS_READY',
    payload: {
      markets,
      keywords,
      stats,
      pageTitle: ''
    }
  });
}

// SETUP: Runs when extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('PolyFinder Extension installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Open side panel when user clicks extension icon in toolbar
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// MESSAGE HANDLER: Receives messages from side panel
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === 'FETCH_MARKETS') {
    fetchAndSendMarkets();
  }

  return true;
});

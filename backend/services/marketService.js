import axios from 'axios';
import { 
  upsertMarkets, 
  getAllMarkets as dbGetAllMarkets,
  searchMarketsByKeywords as dbSearchMarkets,
  getMarketById as dbGetMarketById,
  getMetadata as dbGetMetadata,
  getMarketCount
} from './database.js';

const POLYMARKET_API_URL = process.env.POLYMARKET_API_URL || 'https://gamma-api.polymarket.com/markets';

let lastUpdated = null;

function formatMarketData(market) {
  let outcomePrices = [0, 0];
  
  if (market.outcomePrices) {
    try {
      const prices = typeof market.outcomePrices === 'string' 
        ? JSON.parse(market.outcomePrices) 
        : market.outcomePrices;
      if (Array.isArray(prices) && prices.length >= 2) {
        outcomePrices = prices.map(p => parseFloat(p) || 0);
      }
    } catch (e) {
      console.error('Error parsing outcomePrices:', e);
    }
  }

  return {
    id: market.id || '',
    question: market.question || 'Unknown Market',
    description: market.description || '',
    outcomes: market.outcomes || ['Yes', 'No'],
    outcomePrices: outcomePrices,
    volume: market.volumeNum || market.volume || 0,
    liquidity: market.liquidity || 0,
    active: market.active || false,
    closed: market.closed || false,
    archived: market.archived || false,
    endDate: market.endDate || null,
    events: market.events || [],
    slug: market.slug || '',
    createdAt: market.createdAt || null,
    updatedAt: market.updatedAt || null
  };
}

export async function fetchAllMarkets() {
  try {
    console.log('Fetching markets from Polymarket API...');
    
    const url = `${POLYMARKET_API_URL}?limit=10000&offset=0&closed=false&active=true`;
    const response = await axios.get(url);
    const markets = response.data;

    if (!Array.isArray(markets) || markets.length === 0) {
      return [];
    }

    const allMarkets = markets.map(formatMarketData);
    console.log(`Fetched ${allMarkets.length} markets`);
    
    return allMarkets;
  } catch (error) {
    console.error('Error fetching markets:', error.message);
    throw error;
  }
}

export async function updateMarketsCache() {
  try {
    const markets = await fetchAllMarkets();
    
    console.log(`Upserting ${markets.length} markets into database...`);
    upsertMarkets(markets);
    
    lastUpdated = new Date().toISOString();
    
    const metadata = dbGetMetadata();
    console.log(`Database updated: ${metadata.totalCount} total, ${metadata.activeCount} active, ${metadata.closedCount} closed`);
    
    return { lastUpdated, metadata };
  } catch (error) {
    console.error('Error updating markets cache:', error.message);
    throw error;
  }
}

export function getMarketsFromCache(filters = {}) {
  const markets = dbGetAllMarkets(filters);
  const total = getMarketCount({
    active: filters.active,
    closed: filters.closed
  });

  return {
    markets: markets,
    total: total,
    offset: parseInt(filters.offset) || 0,
    limit: parseInt(filters.limit) || markets.length
  };
}

export function searchMarketsByKeywords(keywords) {
  return dbSearchMarkets(keywords);
}

export function getMarketById(marketId) {
  return dbGetMarketById(marketId);
}

export function getCacheMetadata() {
  return {
    lastUpdated: lastUpdated,
    metadata: dbGetMetadata()
  };
}


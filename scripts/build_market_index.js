import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const PAGE_SIZE = 500;

async function fetchAllMarkets() {
  console.log('Fetching all active markets...');
  
  const allMarkets = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const url = `${GAMMA_API_URL}?limit=${PAGE_SIZE}&offset=${offset}&closed=false&active=true`;
      const response = await fetch(url);
      const batch = await response.json();
      
      if (!Array.isArray(batch) || batch.length === 0) {
        hasMore = false;
        break;
      }
      
      allMarkets.push(...batch);
      console.log(`  Fetched ${allMarkets.length} markets...`);
      
      if (batch.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    } catch (error) {
      console.error(`Error fetching batch at offset ${offset}:`, error);
      hasMore = false;
    }
  }
  
  console.log(`✓ Total markets fetched: ${allMarkets.length}`);
  return allMarkets;
}

function isGoodQuality(market) {
  const volume = market.volumeNum || market.volume || 0;
  const liquidity = market.liquidity || 0;
  
  if (volume < 100) return false;
  if (liquidity < 10) return false;
  
  if (market.resolved === true || market.closed === true) return false;
  if (market.active === false) return false;
  
  return true;
}

function loadKeywords() {
  const entityPath = path.join(__dirname, '../data/entity_keywords.txt');
  const genericPath = path.join(__dirname, '../data/generic_keywords.txt');
  
  const entityText = fs.readFileSync(entityPath, 'utf-8');
  const genericText = fs.readFileSync(genericPath, 'utf-8');
  
  const entities = new Set(
    entityText.split('\n')
      .filter(k => k.trim().length > 0)
      .map(k => k.toLowerCase())
  );
  
  const generic = new Set(
    genericText.split('\n')
      .filter(k => k.trim().length > 0)
      .map(k => k.toLowerCase())
  );
  
  return { entities, generic };
}

function extractKeywords(market, entityKeywords, genericKeywords) {
  const textBlob = `${market.question || ''} ${market.description || ''} ${market.events?.[0]?.title || ''}`.toLowerCase();
  
  const entities = [];
  const generic = [];
  
  for (const keyword of entityKeywords) {
    if (textBlob.includes(keyword)) {
      entities.push(keyword);
    }
  }
  
  for (const keyword of genericKeywords) {
    if (textBlob.includes(keyword)) {
      generic.push(keyword);
    }
  }
  
  return { entities, generic };
}

function buildCompactMarket(market) {
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
  
  const marketSlug = market.slug || '';
  const eventSlug = market.events?.[0]?.slug || '';
  
  return {
    id: market.id || '',
    q: market.question || '',
    p: outcomePrices,
    v: market.volumeNum || market.volume || 0,
    l: market.liquidityNum || market.liquidity || 0,
    s: marketSlug,
    e: eventSlug
  };
}

async function buildIndex() {
  console.log('\n=== Building Market Index ===\n');
  
  const { entities, generic } = loadKeywords();
  console.log(`Loaded ${entities.size} entity keywords, ${generic.size} generic keywords`);
  
  const allMarkets = await fetchAllMarkets();
  const qualityMarkets = allMarkets.filter(isGoodQuality);
  
  console.log(`Quality filter: ${allMarkets.length} → ${qualityMarkets.length} markets`);
  
  console.log('\nBuilding keyword index...');
  
  const keywordToMarkets = {};
  const markets = [];
  
  for (const keyword of entities) {
    keywordToMarkets[keyword] = [];
  }
  
  for (const keyword of generic) {
    keywordToMarkets[keyword] = [];
  }
  
  for (const market of qualityMarkets) {
    const { entities: mEntities, generic: mGeneric } = extractKeywords(market, entities, generic);
    
    if (mEntities.length === 0 && mGeneric.length === 0) continue;
    
    const compact = buildCompactMarket(market);
    compact.ke = mEntities;
    compact.kg = mGeneric;
    
    const marketIdx = markets.length;
    markets.push(compact);
    
    for (const kw of mEntities) {
      keywordToMarkets[kw].push(marketIdx);
    }
    
    for (const kw of mGeneric) {
      keywordToMarkets[kw].push(marketIdx);
    }
  }
  
  const usedKeywords = Object.keys(keywordToMarkets).filter(k => keywordToMarkets[k].length > 0);
  const cleanIndex = {};
  for (const kw of usedKeywords) {
    cleanIndex[kw] = keywordToMarkets[kw];
  }
  
  console.log(`✓ Indexed ${markets.length} markets across ${usedKeywords.length} keywords`);
  
  const index = {
    version: 1,
    timestamp: Date.now(),
    markets,
    index: cleanIndex
  };
  
  const outputPath = path.join(__dirname, '../data/market_index.json');
  fs.writeFileSync(outputPath, JSON.stringify(index), 'utf-8');
  
  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(2);
  console.log(`\n✓ Saved to data/market_index.json (${sizeKB} KB)`);
  console.log(`\nStats:`);
  console.log(`  Markets: ${markets.length}`);
  console.log(`  Keywords: ${usedKeywords.length}`);
  console.log(`  Avg markets per keyword: ${(markets.length / usedKeywords.length).toFixed(1)}`);
}

buildIndex().catch(console.error);


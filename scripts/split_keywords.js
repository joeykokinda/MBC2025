import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTITY_PATTERNS = [
  /^[A-Z][a-z]+\s+[A-Z][a-z]+/,
  /^(btc|eth|sol|ada|matic|avax|link|uni|aave|snx|crv|comp|mkr|yfi|sushi|cake|bnb|doge|shib|pepe|floki)/i,
  /Trump|Biden|Harris|Obama|Xi|Putin|Zelenskyy|Netanyahu|Modi|Musk|Bezos|Zuckerberg|Gates|Buffett/i,
  /Tesla|Apple|Microsoft|Google|Amazon|Meta|Netflix|Nvidia|AMD|Intel|OpenAI|Anthropic/i,
  /Polymarket|Binance|Coinbase|Kraken|FTX|Uniswap|Aave|Compound|MakerDAO|Worldcoin/i,
  /(FC|United|City|Madrid|Barcelona|Bayern|PSG|Arsenal|Chelsea|Liverpool)/,
  /(NBA|NFL|MLB|NHL|UFC|FIFA|Olympics|Premier League|Champions League)/,
  /^[A-Z]{2,}$/,
  /Pudgy Penguins|Bored Ape|CryptoPunks|Azuki|Milady/i,
];

const GENERIC_PATTERNS = [
  /^(price|volume|revenue|profit|loss|gain|increase|decrease|drop|pump|dump|surge|crash)/i,
  /^(success|failure|win|lose|growth|decline|rise|fall|high|low|peak|bottom)/i,
  /^(election|vote|poll|campaign|debate|policy|regulation|ban|law|court)/i,
  /^(crypto|blockchain|token|coin|nft|defi|web3|metaverse|ai|tech)/i,
  /^(market|trading|investment|hedge|risk|volatility|liquidity)/i,
  /^(award|ranking|rating|score|points|win|loss|tie)/i,
  /^\$?\d+/,
  /^\d+[-‒–—]\d+/,
  /^(above|below|over|under|between|more|less|than)/i,
  /^(will|would|could|should|might|may|can)/i,
  /percentage|%|basis points|bps/i,
];

function isEntity(keyword) {
  const lower = keyword.toLowerCase();
  
  if (lower.length <= 2) return false;
  
  for (const pattern of ENTITY_PATTERNS) {
    if (pattern.test(keyword)) {
      return true;
    }
  }
  
  if (/^[A-Z]/.test(keyword) && keyword.includes(' ') && !keyword.includes('20')) {
    return true;
  }
  
  return false;
}

function isGeneric(keyword) {
  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(keyword)) {
      return true;
    }
  }
  
  const genericWords = new Set([
    'price', 'volume', 'revenue', 'profit', 'loss', 'gain', 'increase', 'decrease',
    'success', 'failure', 'growth', 'decline', 'win', 'lose', 'above', 'below',
    'election', 'vote', 'poll', 'campaign', 'debate', 'market', 'trading',
    'crypto', 'token', 'coin', 'blockchain', 'defi', 'nft', 'award', 'ranking',
    'season', 'game', 'match', 'championship', 'tournament', 'league', 'division',
  ]);
  
  return genericWords.has(keyword.toLowerCase());
}

function splitKeywords() {
  const inputPath = path.join(__dirname, '../data/keywords_filtered.txt');
  const content = fs.readFileSync(inputPath, 'utf-8');
  const keywords = content.split('\n').filter(k => k.trim().length > 0);
  
  const entities = [];
  const generic = [];
  const uncertain = [];
  
  for (const keyword of keywords) {
    if (isEntity(keyword)) {
      entities.push(keyword);
    } else if (isGeneric(keyword)) {
      generic.push(keyword);
    } else {
      uncertain.push(keyword);
    }
  }
  
  const entityPath = path.join(__dirname, '../data/entity_keywords.txt');
  const genericPath = path.join(__dirname, '../data/generic_keywords.txt');
  const uncertainPath = path.join(__dirname, '../data/uncertain_keywords.txt');
  
  fs.writeFileSync(entityPath, entities.join('\n'), 'utf-8');
  fs.writeFileSync(genericPath, generic.join('\n'), 'utf-8');
  fs.writeFileSync(uncertainPath, uncertain.join('\n'), 'utf-8');
  
  console.log(`✓ Split complete!`);
  console.log(`  Entities: ${entities.length}`);
  console.log(`  Generic: ${generic.length}`);
  console.log(`  Uncertain: ${uncertain.length} (review manually)`);
  console.log(`\nSample entities:`);
  console.log(entities.slice(0, 10).join(', '));
  console.log(`\nSample generic:`);
  console.log(generic.slice(0, 10).join(', '));
}

splitKeywords();


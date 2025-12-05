import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYWORDS_FILE = path.join(__dirname, '../data/keywords.txt');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Google AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

// Re-initializing with exact requested model
const modelUserRequested = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
// ACTUALLY, let's use the REST API approach requested by user which forces the model name
const GEMINI_REST_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`; 

async function extractKeywordsFromMarkets(markets) {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not found in environment');
    return [];
  }

  console.log(`\n=== EXTRACTING KEYWORDS FOR ${markets.length} MARKETS ===`);
  markets.forEach((m, idx) => {
    console.log(`Input Market ${idx + 1}: "${m.question}" (ID: ${m.id})`);
  });

  const marketsText = markets.map((m, idx) => 
    `${idx + 1}. "${m.question}"`
  ).join('\n');

  const prompt = `Analyze these prediction market questions and extract 3-5 highly specific keywords for each.
  
RULES:
1. Extract ONLY specific entities: Names (Trump, Biden), Assets (Bitcoin, ETH), Organizations (Fed, SEC), Events (Super Bowl, Oscars).
2. DO NOT include generic words like: price, market, will, when, after, before, above, below, yes, no.
3. Return ONLY a JSON array.

Markets:
${marketsText}

Output format:
[{"index": 1, "keywords": ["Bitcoin", "2024 Election", "Donald Trump"]}, ...]`;

  console.log('\n=== CALLING GEMINI API (REST) ===');

  try {
    // Using direct fetch as requested
    const response = await fetch(GEMINI_REST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API Error ${response.status}: ${errorData}`);
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text.trim();
    
    console.log('\n=== GEMINI RESPONSE ===');
    console.log(text);
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const results = JSON.parse(jsonMatch[0]);
    
    console.log('\n=== EXTRACTED KEYWORDS ===');
    const keywordResults = results.map((r, idx) => {
      const result = {
        marketId: markets[idx]?.id,
        keywords: r.keywords || []
      };
      console.log(`Market ${idx + 1} (${markets[idx]?.id}): ${result.keywords.join(', ')}`);
      return result;
    });
    
    return keywordResults;

  } catch (error) {
    console.error('Error calling Gemini API:', error.message);
    return [];
  }
}

export async function updateKeywordsFile() {
  // Fetch ALL keywords from ALL markets
  const result = await pool.query(
    'SELECT unnest(keywords) as keyword FROM markets WHERE keywords IS NOT NULL'
  );
  
  // Use Set to ensure uniqueness
  const uniqueKeywords = new Set(
    result.rows
      .map(row => row.keyword.trim()) // Trim whitespace
      .filter(k => k.length > 0)      // Remove empty strings
  );
  
  // Sort alphabetically case-insensitive
  const sortedKeywords = Array.from(uniqueKeywords).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  await fs.writeFile(KEYWORDS_FILE, sortedKeywords.join('\n'), 'utf-8');
  
  console.log(`Updated keywords.txt with ${sortedKeywords.length} unique keywords`);
}

export async function updateMarketKeywords(batchSize = 20) {
  const result = await pool.query(
    'SELECT id, question FROM markets WHERE keywords IS NULL AND active = true ORDER BY volume DESC LIMIT $1',
    [batchSize]
  );

  if (result.rows.length === 0) {
    console.log('No markets need keyword extraction');
    return 0;
  }

  console.log(`Extracting keywords for ${result.rows.length} markets...`);

  const keywordResults = await extractKeywordsFromMarkets(result.rows);

  let updated = 0;
  console.log('\n=== UPDATING DATABASE ===');
  for (const { marketId, keywords } of keywordResults) {
    if (marketId && keywords.length > 0) {
      await pool.query(
        'UPDATE markets SET keywords = $1 WHERE id = $2',
        [keywords, marketId]
      );
      console.log(`✓ Updated market ${marketId} with keywords: [${keywords.join(', ')}]`);
      updated++;
    }
  }

  console.log(`\n=== COMPLETE: Updated ${updated} markets with keywords ===\n`);
  
  await updateKeywordsFile();
  
  return updated;
}

export async function processAllMarketKeywords() {
  let totalProcessed = 0;
  let batchCount = 0;
  
  while (true) {
    batchCount++;
    console.log(`Processing batch ${batchCount}...`);
    
    const processed = await updateMarketKeywords(20);
    totalProcessed += processed;
    
    if (processed === 0) {
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`Total markets processed: ${totalProcessed}`);
  await updateKeywordsFile();
  
  return totalProcessed;
}

export async function getAllKeywords() {
  try {
    const content = await fs.readFile(KEYWORDS_FILE, 'utf-8');
    return content.split('\n').filter(k => k.trim());
  } catch (error) {
    return [];
  }
}

export { extractKeywordsFromMarkets, updateKeywordsFile };

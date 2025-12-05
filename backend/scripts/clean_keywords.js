import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYWORDS_FILE = path.join(__dirname, '../data/keywords.txt');
const CLEAN_KEYWORDS_FILE = path.join(__dirname, '../data/keywords_clean.txt');

async function cleanKeywords() {
  try {
    console.log('Reading keywords.txt...');
    const content = await fs.readFile(KEYWORDS_FILE, 'utf-8');
    const keywords = content.split('\n');
    
    console.log(`Found ${keywords.length} raw keywords.`);

    // Clean, deduplicate, and sort
    const uniqueKeywords = new Set(
      keywords
        .map(k => k.trim())           // Remove whitespace
        .filter(k => k.length > 0)    // Remove empty lines
        .filter(k => k.length > 1)    // Remove single letters (optional, usually noise)
    );

    // Convert to array and sort alphabetically (case-insensitive)
    const sortedKeywords = Array.from(uniqueKeywords).sort((a, b) => 
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    console.log(`Result: ${sortedKeywords.length} unique, sorted keywords.`);

    // Write to new file (or overwrite original if you prefer)
    await fs.writeFile(CLEAN_KEYWORDS_FILE, sortedKeywords.join('\n'), 'utf-8');
    console.log(`✅ Saved to data/keywords_clean.txt`);
    
    // Optional: overwrite original
    // await fs.writeFile(KEYWORDS_FILE, sortedKeywords.join('\n'), 'utf-8');

  } catch (error) {
    console.error('Error cleaning keywords:', error);
  }
}

cleanKeywords();


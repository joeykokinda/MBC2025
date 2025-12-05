import express from 'express';
import { updateMarketKeywords, processAllMarketKeywords, getAllKeywords, extractKeywordsFromMarkets, updateKeywordsFile } from '../services/keywordService.js';
import pool from '../services/database.js';

const router = express.Router();

router.post('/regenerate-file', async (req, res) => {
  try {
    await updateKeywordsFile();
    const keywords = await getAllKeywords();
    res.json({
      success: true,
      message: 'Keywords file regenerated',
      totalUniqueKeywords: keywords.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/all', async (req, res) => {
  try {
    const keywords = await getAllKeywords();
    res.json({
      success: true,
      keywords: keywords,
      count: keywords.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/extract', async (req, res) => {
  try {
    const batchSize = parseInt(req.query.batch) || 20;
    const processed = await updateMarketKeywords(batchSize);
    
    res.json({
      success: true,
      processed: processed,
      message: `Extracted keywords for ${processed} markets`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/extract-all', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Keyword extraction started in background'
    });
    
    processAllMarketKeywords().catch(err => {
      console.error('Error in background keyword extraction:', err);
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/extract-one/:id', async (req, res) => {
  try {
    const marketId = req.params.id;
    // Fetch specific market from DB (even if it already has keywords, to re-extract)
    const result = await pool.query('SELECT id, question FROM markets WHERE id = $1', [marketId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }

    console.log(`Re-extracting keywords for single market: ${result.rows[0].question}`);
    const keywordResults = await extractKeywordsFromMarkets(result.rows);

    if (keywordResults.length > 0 && keywordResults[0].keywords.length > 0) {
      await pool.query(
        'UPDATE markets SET keywords = $1 WHERE id = $2',
        [keywordResults[0].keywords, marketId]
      );
    }

    res.json({
      success: true,
      market: result.rows[0],
      keywords: keywordResults[0]?.keywords || []
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

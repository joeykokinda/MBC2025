import express from 'express';
import { 
  getMarketsFromCache, 
  searchMarketsByKeywords, 
  getMarketById,
  getCacheMetadata,
  updateMarketsCache 
} from '../services/marketService.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const filters = {
      active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
      closed: req.query.closed === 'true' ? true : req.query.closed === 'false' ? false : undefined,
      minVolume: req.query.minVolume ? parseFloat(req.query.minVolume) : undefined,
      search: req.query.search,
      sortBy: req.query.sortBy || 'volume',
      limit: req.query.limit,
      offset: req.query.offset
    };

    const result = getMarketsFromCache(filters);
    
    res.json({
      success: true,
      ...result,
      metadata: getCacheMetadata()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/search', (req, res) => {
  try {
    const keywords = req.query.keywords;
    
    if (!keywords) {
      return res.status(400).json({
        success: false,
        error: 'Keywords parameter is required'
      });
    }

    const keywordsArray = Array.isArray(keywords) 
      ? keywords 
      : keywords.split(',').map(k => k.trim());

    const markets = searchMarketsByKeywords(keywordsArray);

    res.json({
      success: true,
      keywords: keywordsArray,
      markets: markets,
      count: markets.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/metadata', (req, res) => {
  try {
    const metadata = getCacheMetadata();
    res.json({
      success: true,
      ...metadata
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/:id', (req, res) => {
  try {
    const market = getMarketById(req.params.id);
    
    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found'
      });
    }

    res.json({
      success: true,
      market: market
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    await updateMarketsCache();
    const metadata = getCacheMetadata();
    
    res.json({
      success: true,
      message: 'Markets cache refreshed successfully',
      ...metadata
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;


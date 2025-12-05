import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import marketRoutes from './routes/markets.js';
import keywordRoutes from './routes/keywords.js';
import { updateMarketsCache } from './services/marketService.js';
import { initDatabase } from './services/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json());

app.use('/api/markets', marketRoutes);
app.use('/api/keywords', keywordRoutes);

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'PolyFinder Backend'
  });
});

const startServer = async () => {
  try {
    console.log('Initializing PolyFinder Backend...');
    
    await initDatabase();
    
    await updateMarketsCache();
    console.log('Initial market cache loaded');
    
    const updateInterval = process.env.UPDATE_INTERVAL_MINUTES || 15;
    cron.schedule(`*/${updateInterval} * * * *`, async () => {
      console.log(`Running scheduled market update...`);
      await updateMarketsCache();
    });
    console.log(`Scheduled market updates every ${updateInterval} minutes`);
    
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API endpoints available at /api/markets`);
      console.log(`Health check at /api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();


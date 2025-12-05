import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS markets (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        description TEXT,
        outcomes JSONB,
        outcome_prices JSONB NOT NULL,
        volume REAL DEFAULT 0,
        liquidity REAL DEFAULT 0,
        active BOOLEAN DEFAULT true,
        closed BOOLEAN DEFAULT false,
        archived BOOLEAN DEFAULT false,
        end_date TIMESTAMP,
        events JSONB,
        slug TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        last_fetched TIMESTAMP NOT NULL DEFAULT NOW(),
        keywords TEXT[]
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_active ON markets(active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_volume ON markets(volume DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_closed ON markets(closed)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_keywords ON markets USING GIN(keywords)`);

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

export async function upsertMarket(market) {
  const query = `
    INSERT INTO markets (
      id, question, description, outcomes, outcome_prices, 
      volume, liquidity, active, closed, archived, 
      end_date, events, slug, created_at, updated_at, last_fetched
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
    )
    ON CONFLICT(id) DO UPDATE SET
      question = $2,
      description = $3,
      outcomes = $4,
      outcome_prices = $5,
      volume = $6,
      liquidity = $7,
      active = $8,
      closed = $9,
      archived = $10,
      end_date = $11,
      events = $12,
      slug = $13,
      updated_at = $15,
      last_fetched = NOW()
  `;

  const values = [
    market.id,
    market.question,
    market.description || null,
    JSON.stringify(market.outcomes),
    JSON.stringify(market.outcomePrices),
    market.volume,
    market.liquidity,
    market.active,
    market.closed,
    market.archived,
    market.endDate || null,
    JSON.stringify(market.events),
    market.slug || null,
    market.createdAt || null,
    market.updatedAt || null
  ];

  await pool.query(query, values);
}

export async function upsertMarkets(markets) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const market of markets) {
      const query = `
        INSERT INTO markets (
          id, question, description, outcomes, outcome_prices, 
          volume, liquidity, active, closed, archived, 
          end_date, events, slug, created_at, updated_at, last_fetched
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
        )
        ON CONFLICT(id) DO UPDATE SET
          question = $2,
          description = $3,
          outcomes = $4,
          outcome_prices = $5,
          volume = $6,
          liquidity = $7,
          active = $8,
          closed = $9,
          archived = $10,
          end_date = $11,
          events = $12,
          slug = $13,
          updated_at = $15,
          last_fetched = NOW()
      `;

      const values = [
        market.id,
        market.question,
        market.description || null,
        JSON.stringify(market.outcomes),
        JSON.stringify(market.outcomePrices),
        market.volume,
        market.liquidity,
        market.active,
        market.closed,
        market.archived,
        market.endDate || null,
        JSON.stringify(market.events),
        market.slug || null,
        market.createdAt || null,
        market.updatedAt || null
      ];

      await client.query(query, values);
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAllMarkets(filters = {}) {
  let query = 'SELECT * FROM markets WHERE 1=1';
  const values = [];
  let paramCount = 1;

  if (filters.active !== undefined) {
    query += ` AND active = $${paramCount}`;
    values.push(filters.active);
    paramCount++;
  }

  if (filters.closed !== undefined) {
    query += ` AND closed = $${paramCount}`;
    values.push(filters.closed);
    paramCount++;
  }

  if (filters.minVolume !== undefined) {
    query += ` AND volume >= $${paramCount}`;
    values.push(filters.minVolume);
    paramCount++;
  }

  if (filters.search) {
    query += ` AND (question ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
    values.push(`%${filters.search}%`);
    paramCount++;
  }

  if (filters.sortBy === 'volume') {
    query += ' ORDER BY volume DESC';
  } else if (filters.sortBy === 'liquidity') {
    query += ' ORDER BY liquidity DESC';
  }

  if (filters.limit) {
    query += ` LIMIT $${paramCount}`;
    values.push(filters.limit);
    paramCount++;
  }

  if (filters.offset) {
    query += ` OFFSET $${paramCount}`;
    values.push(filters.offset);
    paramCount++;
  }

  const result = await pool.query(query, values);
  return result.rows.map(parseMarketRow);
}

export async function searchMarketsByKeywords(keywords) {
  const keywordsArray = Array.isArray(keywords) ? keywords : [keywords];
  
  let query = 'SELECT * FROM markets WHERE active = true AND (';
  const conditions = [];
  const values = [];
  let paramCount = 1;

  keywordsArray.forEach((keyword) => {
    const words = keyword.toLowerCase().split(' ');
    const wordConditions = words.map((word) => {
      const condition = `(question ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      values.push(`%${word}%`);
      paramCount++;
      return condition;
    });
    conditions.push(`(${wordConditions.join(' AND ')})`);
  });

  query += conditions.join(' OR ') + ') ORDER BY volume DESC LIMIT 10';

  const result = await pool.query(query, values);
  return result.rows.map(parseMarketRow);
}

export async function getMarketById(marketId) {
  const result = await pool.query('SELECT * FROM markets WHERE id = $1', [marketId]);
  return result.rows.length > 0 ? parseMarketRow(result.rows[0]) : null;
}

export async function getMarketCount(filters = {}) {
  let query = 'SELECT COUNT(*) as count FROM markets WHERE 1=1';
  const values = [];
  let paramCount = 1;

  if (filters.active !== undefined) {
    query += ` AND active = $${paramCount}`;
    values.push(filters.active);
    paramCount++;
  }

  if (filters.closed !== undefined) {
    query += ` AND closed = $${paramCount}`;
    values.push(filters.closed);
    paramCount++;
  }

  const result = await pool.query(query, values);
  return parseInt(result.rows[0].count);
}

export async function getMetadata() {
  const totalResult = await pool.query('SELECT COUNT(*) as count FROM markets');
  const activeResult = await pool.query('SELECT COUNT(*) as count FROM markets WHERE active = true');
  const closedResult = await pool.query('SELECT COUNT(*) as count FROM markets WHERE closed = true');
  
  return {
    totalCount: parseInt(totalResult.rows[0].count),
    activeCount: parseInt(activeResult.rows[0].count),
    closedCount: parseInt(closedResult.rows[0].count)
  };
}

function parseMarketRow(row) {
  return {
    id: row.id,
    question: row.question,
    description: row.description,
    outcomes: row.outcomes,
    outcomePrices: row.outcome_prices,
    volume: row.volume,
    liquidity: row.liquidity,
    active: row.active,
    closed: row.closed,
    archived: row.archived,
    endDate: row.end_date,
    events: row.events,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default pool;

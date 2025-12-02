# Architecture Overview

## Data Flow

```
User visits webpage
    ↓
Content Script (scrape.js) extracts DOM text
    ↓
Sends to Background Worker (background.js)
    ↓
Background calls GPT API → extracts keywords
    ↓
Background calls Polymarket API with keywords
    ↓
Background calculates statistics
    ↓
Background sends results to Sidebar (React app)
    ↓
Sidebar displays markets + stats
```

## Component Responsibilities

### Content Scripts (`content/`)

**inject.js:**
- Injects sidebar iframe into every webpage
- Handles sidebar visibility toggle

**scrape.js:**
- Extracts page title, headings, paragraphs, meta tags
- Combines into clean text payload
- Listens for scrape requests
- Auto-scrapes 2 seconds after page load

### Background Worker (`background/background.js`)

**Responsibilities:**
- Receives scraped text from content scripts
- Calls OpenAI GPT API to extract keywords
- Calls Polymarket API with keywords
- Calculates market statistics (avg odds, volume, etc.)
- Sends processed data to sidebar

**API Integrations:**
- OpenAI GPT-4o-mini for keyword extraction
- Polymarket Strapi API for market search

### Sidebar React App (`sidebar-src/`)

**Components:**
- `App.jsx` - Main container, message handling, state management
- `MarketCard.jsx` - Displays individual market with odds
- `StatsPanel.jsx` - Shows aggregate statistics
- `Spinner.jsx` - Loading indicator

**Features:**
- Real-time market updates
- Refresh button
- Keyword tags display
- Page title display
- Responsive dark theme UI

### Utilities (`utils/`)

**cleanText.js:**
- Text normalization
- Main content extraction helpers

**keywordPostprocess.js:**
- Keyword normalization
- Entity extraction
- Keyword combination

**scoring.js:**
- Relevance scoring
- Market sorting
- Confidence calculation

## Message Passing

### Content → Background
```javascript
{
  action: 'PAGE_LOADED',
  payload: { title, text, url, timestamp }
}
```

### Background → Sidebar
```javascript
{
  action: 'MARKETS_READY',
  payload: {
    markets: [...],
    keywords: [...],
    stats: {...},
    pageTitle: string
  }
}
```

### Sidebar → Content
```javascript
{
  action: 'SCRAPE_PAGE'
}
```

## File Structure

```
extension/
├── manifest.json              # Chrome extension config
├── package.json               # Dependencies & scripts
├── vite.config.js            # Vite build config
│
├── background/
│   └── background.js         # Service worker (GPT + Polymarket)
│
├── content/
│   ├── inject.js             # Sidebar iframe injection
│   └── scrape.js             # DOM scraping logic
│
├── sidebar-src/              # React app source
│   ├── index.html
│   ├── main.jsx
│   ├── App.jsx
│   ├── components/
│   │   ├── MarketCard.jsx
│   │   ├── StatsPanel.jsx
│   │   └── Spinner.jsx
│   └── styles.css
│
├── sidebar/                  # Built React app (generated)
│   ├── index.html
│   └── assets/
│
├── utils/                    # Shared utilities
│   ├── cleanText.js
│   ├── keywordPostprocess.js
│   └── scoring.js
│
└── assets/                   # Icons (optional)
```

## Development Workflow

1. **Edit code** in respective folders
2. **Build sidebar** (if React changes): `npm run build`
3. **Reload extension** in Chrome
4. **Refresh webpage** to test

## Environment Variables

Currently hardcoded in `background/background.js`:
- `GPT_API_KEY` - Your OpenAI API key
- `GPT_API_URL` - OpenAI API endpoint
- `POLYMARKET_API_URL` - Polymarket API endpoint

For production, consider using Chrome storage API or environment variables.


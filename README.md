# PolyFinder

Chrome extension that displays relevant Polymarket markets in a side panel.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the sidebar React app:
```bash
npm run build
```

4. (Optional) Add extension icons:
   - Create 16x16, 48x48, and 128x128 PNG icons
   - Place them in `assets/` as `icon16.png`, `icon48.png`, `icon128.png`
   - Or remove the icons section from `manifest.json` (Chrome will use default)

5. Load extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable Developer Mode
   - Click "Load unpacked"
   - Select this folder

6. Open the side panel:
   - Click the extension icon in Chrome's toolbar
   - Or use Chrome's side panel menu (puzzle icon → your extension)

## Development

- `npm run dev` - Watch mode for sidebar development
- `npm run build` - Build sidebar for production

## Project Structure

- `content/` - Content scripts (scraping)
- `background/` - Service worker (market data)
- `sidebar-src/` - React sidebar app source
- `sidebar/` - Built sidebar (generated after build)
- `utils/` - Shared utility functions

## Team Responsibilities

- **Person A**: Content scraping (`content/scrape.js`, `utils/cleanText.js`)
- **Person B**: Background logic (`background/background.js`, `utils/keywordPostprocess.js`, `utils/scoring.js`)
- **Person C**: React sidebar UI (`sidebar-src/`)
- **Person D**: Integration & build (`vite.config.js`, `manifest.json`)


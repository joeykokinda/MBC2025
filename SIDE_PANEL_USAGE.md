# Using the Side Panel

## How to Open

1. **Click the extension icon** in Chrome's toolbar
   - The side panel will open automatically

2. **Or use Chrome's side panel menu:**
   - Click the puzzle icon (extensions menu) in the toolbar
   - Find "PolyFinder"
   - Click to open the side panel

## Features

- **Automatic scraping:** When you open the side panel, it automatically scrapes the current page
- **Refresh button:** Click "↻ Refresh" to re-scrape and update markets
- **Persistent:** The side panel stays open when you navigate between tabs
- **Native Chrome UI:** Uses Chrome's built-in side panel (not an iframe)

## How It Works

1. You open the side panel on any webpage
2. The extension displays example Polymarket markets
3. Markets are shown with odds, volume, and links

## Troubleshooting

**Side panel doesn't open:**
- Make sure you clicked the extension icon (not just loaded the extension)
- Check that the extension is enabled in `chrome://extensions/`
- Reload the extension if needed

**No markets showing:**
- Open DevTools in the side panel (right-click → Inspect) to see errors
- Check the background service worker console for errors
- Try clicking the refresh button


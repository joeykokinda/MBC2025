# JAEGER

See the market behind every headline @Polymarket.

A **Chrome extension** that finds relevant **Polymarket** prediction markets based on the content of webpages you visit. Works on any website with special features for **Twitter/X**.

## What It Does

Jaeger has two main features that work together:

1. **Sidebar Panel** - Click the extension icon to open a panel that shows prediction markets related to the webpage you're currently viewing
2. **Twitter Integration** - When browsing **Twitter/X**, market cards appear directly in your feed next to relevant tweets

## Features

### Sidebar Panel

- **Wallet Connection** - Sign in with **Base Account** (create a new smart wallet or connect an existing one)
- **Automatic Market Discovery** - Reads the webpage content and finds matching prediction markets
- **Market Filtering** - Filter markets by:
  - **Sort order**: trading volume, odds, or newest first
  - **Time range**: daily, weekly, monthly, or all time
  - **Status**: active markets or resolved markets
- **Theme Toggle** - **Dark mode** (default) or **light mode**, with your preference saved
- **Works Everywhere** - Works on any website, not just Twitter!

### Twitter Integration

- **Inline Market Cards** - Market cards appear directly in your **Twitter/X** timeline
- **DEGEN MODE** - Floating button in the top-right corner to show or hide market cards
- **Real-time Detection** - Automatically finds markets related to tweets as you scroll

## Installation

### Prerequisites

- **Node.js** version 16 or higher
- **npm** (comes with Node.js)
- **Google Chrome** browser

### Steps

1. **Get the code:**
   ```bash
   git clone <repository-url>
   cd MBC2025
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   This installs all the required libraries (**React**, **Wagmi**, etc.)

3. **Build the extension:**
   ```bash
   npm run build
   ```
   This compiles the **React** code and creates the files Chrome needs

4. **Load into Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Turn on **"Developer Mode"** (toggle switch in the top-right corner)
   - Click the **"Load unpacked"** button
   - Select the `MBC2025` folder

5. **Start using:**
   - Click the **Jaeger** icon in Chrome's toolbar
   - Sign in with **Base Account** (create account or connect existing)
   - Visit any webpage or go to **Twitter/X** to see relevant markets

## How It Works

The extension works in four steps:

1. **Content Extraction** - When you visit a webpage, the extension reads the text content (titles, headings, paragraphs)
2. **Keyword Matching** - It looks for important words that might relate to prediction markets using a **keyword database**
3. **Market Search** - The **background script** searches **Polymarket's API** for markets that match those keywords
4. **Display Results** - Markets are shown in the **sidebar panel**, or on **Twitter**, they appear directly in your feed

## Project Structure

```
MBC2025/
├── sidebar-src/              ← Source code for the sidebar (edit here)
│   ├── App.jsx               ← Main React component
│   ├── components/           ← Reusable UI components
│   │   ├── MarketCard.jsx    ← Displays one market card
│   │   ├── FilterBar.jsx     ← Filter controls
│   │   └── Spinner.jsx       ← Loading indicator
│   ├── styles.css            ← All CSS styling
│   ├── index.html            ← HTML template
│   └── main.jsx              ← React entry point
├── sidebar/                  ← Built files (auto-generated, don't edit)
│   ├── index.html
│   └── assets/
├── background/               ← Background script
│   └── background.js         ← Handles market searching and caching
├── content/                  ← Scripts that run on webpages
│   ├── scrape.js             ← Extracts text from webpages
│   └── twitter-ui.js         ← Adds market cards to Twitter
├── assets/                   ← Images and icons
│   ├── jaeger_animal.png
│   └── jaeger_logo_128.png
├── data/                     ← Data files
│   └── keywords.txt          ← List of keywords to search for
├── manifest.json             ← Extension configuration
├── package.json              ← Project dependencies and scripts
└── vite.config.js            ← Build tool configuration
```

**Important Notes:**
- After making changes, run **`npm run build`** to update the **`sidebar/`** folder

## Development

### Making Changes

1. **Edit the source code** in **`sidebar-src/`** folder
2. **Rebuild the extension:**
   ```bash
   npm run build
   ```
   Or use **watch mode** to automatically rebuild when you save files:
   ```bash
   npm run dev
   ```
3. **Reload the extension** in Chrome:
   - Go to `chrome://extensions/`
   - Find **Jaeger** in the list
   - Click the **reload** icon
4. **Test your changes** by opening the sidebar panel

### What Each Part Does

- **`sidebar-src/`** - The sidebar panel interface built with **React**. This is what users see when they click the extension icon.
- **`content/scrape.js`** - Runs on every webpage you visit. Extracts text content from the page.
- **`content/twitter-ui.js`** - Special script for **Twitter/X** that adds market cards directly into the feed.
- **`background/background.js`** - Runs in the background. Searches **Polymarket's API** for markets and sends results to the sidebar.

### Available Scripts

- **`npm run build`** - Build the extension for production
- **`npm run dev`** - Build in **watch mode** (rebuilds automatically on file changes)
- **`npm run preview`** - Preview the built extension (rarely used)

## Design

The extension uses a **gold and black** color scheme:

- **Colors**: Gold accents (**#d4af37**) on dark backgrounds (**#0a0a0a**)
- **Typography**: System fonts (uses your computer's native fonts for a clean look)
- **Layout**: Card-based design with smooth animations
- **Themes**: **Dark mode** is the default, with an optional **light mode**

## Technologies Used

- **React 19** - JavaScript library for building the user interface
- **Wagmi** - Library for connecting cryptocurrency wallets
- **Base Account** - Smart wallet system for easy login
- **Vite** - Build tool that compiles and bundles the code
- **Chrome Extension API** - Chrome's built-in tools for making browser extensions

## Troubleshooting

### Markets Not Showing

- Make sure you're signed in with **Base Account** (check the sidebar header)
- Try refreshing the webpage you're on
- Check the **browser console** for any error messages

### Twitter Cards Not Appearing

- Make sure you're on **twitter.com** or **x.com**
- Refresh the page after installing the extension
- Look for the **toggle button** in the top-right corner (it might be hidden)
- Check that the extension is enabled in `chrome://extensions/`

### Changes Not Appearing After Editing Code

- Make sure you ran **`npm run build`** after making changes
- Reload the extension in `chrome://extensions/`
- Hard refresh the sidebar panel (close and reopen it)
- Check the **browser console** for build errors

### Extension Won't Load

- Make sure all dependencies are installed (**`npm install`**)
- Check that the build completed successfully (**`npm run build`**)
- Verify you selected the correct folder when loading unpacked
- Check `chrome://extensions/` for any error messages

## Follow the Team

Stay updated with the latest **Jaeger** news and updates:

- **Twitter/X**: [@bomJAEGER](https://x.com/bomJAEGER)

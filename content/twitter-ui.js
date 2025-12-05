/**
 * TWITTER UI MODULE
 * Handles all UI rendering for Polymarket cards on Twitter
 * Loaded as a separate content script
 */

// Global toggle state
window.polymarketVisible = localStorage.getItem('polymarketVisible') !== 'false';

/**
 * Creates the Polymarket market card UI
 */
window.createMarketCard = function(marketData) {
  const { keyword, primaryMarket, childMarkets, event } = marketData;
  
  if (!primaryMarket) return null;
  
  const container = document.createElement('div');
  container.className = 'polymarket-card';
  container.style.cssText = `
    display: ${window.polymarketVisible ? 'block' : 'none'};
    margin: 12px 0;
    padding: 12px;
    background: #1a1a1a;
    border: 1px solid #2f3336;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;
  
  let options = [];
  
  if (primaryMarket.outcomePrices && typeof primaryMarket.outcomePrices === 'string') {
    try {
      options = JSON.parse(primaryMarket.outcomePrices);
    } catch (e) {
      options = [];
    }
  } else if (Array.isArray(primaryMarket.outcomePrices)) {
    options = primaryMarket.outcomePrices;
  }
  
  const hasChildMarkets = Array.isArray(childMarkets) && childMarkets.length > 1;
  const isMultiOption = (Array.isArray(options) && options.length > 2 && options[0]?.name) || hasChildMarkets;
  
  const marketUrl = primaryMarket.url || (primaryMarket.slug 
    ? `https://polymarket.com/event/${primaryMarket.slug}`
    : `https://polymarket.com`);
  
  const headerHtml = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span style="color: #1d9bf0; font-weight: bold; font-size: 12px;">POLYMARKET</span>
      <span style="color: #71767b; font-size: 11px;">keyword: ${keyword}</span>
    </div>
    <a href="${marketUrl}" target="_blank" style="color: #e7e9ea; text-decoration: none; display: block; margin-bottom: 10px; font-size: 14px; font-weight: 500; line-height: 1.4;">
      ${primaryMarket.question || 'Unknown Market'}
    </a>
  `;
  
  let optionsHtml = '';
  
  if (isMultiOption) {
    let displayOptions = [];
    
    if (hasChildMarkets) {
      displayOptions = childMarkets.map(child => {
        let childOptions = [];
        try {
          childOptions = child.outcomePrices ? 
            (typeof child.outcomePrices === 'string' ? JSON.parse(child.outcomePrices) : child.outcomePrices) : [];
        } catch (e) {
          childOptions = [];
        }
        const price = parseFloat(childOptions[0] || 0);
        return {
          name: child.question || 'Unknown',
          price: price
        };
      })
      .sort((a, b) => b.price - a.price)
      .slice(0, 4);
    } else if (options.length > 2 && options[0]?.name) {
      displayOptions = [...options]
        .sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0))
        .slice(0, 4);
    }
    
    optionsHtml = displayOptions.map(option => {
      const price = parseFloat(option.price || 0);
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #2a2a2a; border-radius: 6px; margin-bottom: 6px;">
          <span style="color: #e7e9ea; font-size: 13px;">${option.name}</span>
          <span style="color: #1d9bf0; font-size: 14px; font-weight: bold;">${(price * 100).toFixed(0)}%</span>
        </div>
      `;
    }).join('');
    
    const totalOptions = hasChildMarkets ? childMarkets.length : options.length;
    if (totalOptions > 4) {
      optionsHtml += `
        <div style="font-size: 11px; color: #71767b; text-align: center; margin-top: 4px;">
          +${totalOptions - 4} more option${totalOptions - 4 > 1 ? 's' : ''}
        </div>
      `;
    }
  } else {
    const yesPrice = (parseFloat(options[0]?.price || options[0] || 0));
    const noPrice = (parseFloat(options[1]?.price || options[1] || 0));
    
    optionsHtml = `
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <div style="flex: 1; padding: 8px; background: #0a3a1f; border: 1px solid #00ba7c; border-radius: 8px; text-align: center;">
          <div style="color: #00ba7c; font-size: 11px; font-weight: 600; margin-bottom: 2px;">YES</div>
          <div style="color: #00ba7c; font-size: 16px; font-weight: bold;">${(yesPrice * 100).toFixed(0)}¢</div>
        </div>
        <div style="flex: 1; padding: 8px; background: #3a0a0a; border: 1px solid #f91880; border-radius: 8px; text-align: center;">
          <div style="color: #f91880; font-size: 11px; font-weight: 600; margin-bottom: 2px;">NO</div>
          <div style="color: #f91880; font-size: 16px; font-weight: bold;">${(noPrice * 100).toFixed(0)}¢</div>
        </div>
      </div>
      ${childMarkets && childMarkets.length > 1 ? `
        <div style="font-size: 11px; color: #71767b; margin-top: 8px;">
          +${childMarkets.length - 1} more market${childMarkets.length > 2 ? 's' : ''} in this event
        </div>
      ` : ''}
    `;
  }
  
  container.innerHTML = headerHtml + optionsHtml;
  
  return container;
};

/**
 * Toggles visibility of all market cards
 */
function toggleMarkets() {
  window.polymarketVisible = !window.polymarketVisible;
  localStorage.setItem('polymarketVisible', window.polymarketVisible.toString());
  
  // Update all existing cards
  document.querySelectorAll('.polymarket-card').forEach(card => {
    card.style.display = window.polymarketVisible ? 'block' : 'none';
  });
  
  // Update button
  const btn = document.getElementById('polymarket-toggle');
  if (btn) {
    btn.textContent = window.polymarketVisible ? 'Show' : 'Hide';
    btn.style.opacity = window.polymarketVisible ? '1' : '0.5';
    btn.title = window.polymarketVisible ? 'Hide Polymarket' : 'Show Polymarket';
  }
  
  console.log(`[Polymarket] Markets ${window.polymarketVisible ? 'shown' : 'hidden'}`);
}

/**
 * Creates the toggle button - SIMPLE VERSION
 */
function createToggleButton() {
  if (document.getElementById('polymarket-toggle')) return;
  
  const button = document.createElement('button');
  button.id = 'polymarket-toggle';
  button.textContent = '📊';
  button.title = window.polymarketVisible ? 'Hide Polymarket' : 'Show Polymarket';
  button.onclick = toggleMarkets;
  
  button.style.cssText = `
    position: fixed !important;
    top: 12px !important;
    right: 80px !important;
    z-index: 999999 !important;
    width: 36px !important;
    height: 36px !important;
    padding: 0 !important;
    background: rgb(29, 155, 240) !important;
    color: white !important;
    border: 2px solid rgba(255,255,255,0.2) !important;
    border-radius: 50% !important;
    font-size: 16px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
    opacity: ${window.polymarketVisible ? '1' : '0.5'} !important;
    transition: transform 0.1s ease, opacity 0.2s ease !important;
  `;
  
  button.addEventListener('mouseenter', () => button.style.transform = 'scale(1.1)');
  button.addEventListener('mouseleave', () => button.style.transform = 'scale(1)');
  
  document.body.appendChild(button);
  console.log('[Polymarket] ✓ Toggle button added');
}

// Initialize on Twitter
if (window.location.href.includes('twitter.com') || window.location.href.includes('x.com')) {
  setTimeout(createToggleButton, 2000);
  console.log('[Polymarket UI] Loaded');
}

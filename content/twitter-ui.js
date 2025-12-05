/**
 * TWITTER UI MODULE
 * Handles all UI rendering for Polymarket cards on Twitter
 * Loaded as a separate content script
 */

// Global toggle state
window.polymarketVisible = localStorage.getItem('polymarketVisible') !== 'false';
window.polymarketDegenMode = localStorage.getItem('polymarketDegenMode') === 'true';

/**
 * Creates the Polymarket market card UI
 */
function buildPolymarketUrl(market = {}, event = null, isMultiOption = false) {
  const conditionId = market.conditionId || market.condition_id || '';
  const marketId = market.id || '';
  const marketSlug = market.slug || '';
  const eventSlug = event?.slug || market.events?.[0]?.slug || event?.ticker || '';

  if (isMultiOption && eventSlug && marketId) {
    return `https://polymarket.com/event/${eventSlug}?tid=${marketId}`;
  }

  if (eventSlug && marketSlug && marketId) {
    return `https://polymarket.com/event/${eventSlug}/${marketSlug}?tid=${marketId}`;
  }

  if (eventSlug && conditionId) {
    return `https://polymarket.com/event/${eventSlug}?_c=${conditionId}`;
  }

  if (eventSlug && marketId) {
    return `https://polymarket.com/event/${eventSlug}?tid=${marketId}`;
  }

  if (marketSlug && marketId) {
    return `https://polymarket.com/event/${marketSlug}?tid=${marketId}`;
  }

  if (eventSlug) {
    return `https://polymarket.com/event/${eventSlug}`;
  }

  if (conditionId) {
    return `https://polymarket.com/?_c=${conditionId}`;
  }

  return '#';
}

window.createMarketCard = function(marketData) {
  const { keyword, primaryMarket, childMarkets, event } = marketData;
  
  if (!primaryMarket) return null;
  
  const container = document.createElement('div');
  container.className = 'polymarket-card';
  container.style.cssText = `
    position: absolute;
    top: 0;
    left: calc(100% + 12px);
    width: 320px;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    padding: 12px;
    background: #141414;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    z-index: 1000;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(212, 175, 55, 0.1);
    transition: opacity 0.2s ease, visibility 0.2s ease, border-color 0.3s ease, box-shadow 0.3s ease;
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
  
  const marketUrl = buildPolymarketUrl(primaryMarket, event, isMultiOption);
  
  const headerHtml = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span style="color: #d4af37; font-weight: bold; font-size: 12px; letter-spacing: 0.5px;">POLYMARKET</span>
      <span style="color: #6e6e6e; font-size: 11px;">keyword: ${keyword}</span>
    </div>
    <a href="${marketUrl}" target="_blank" style="color: #ffffff; text-decoration: none; display: block; margin-bottom: 10px; font-size: 13px; font-weight: 500; line-height: 1.3; letter-spacing: -0.01em;">
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
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #222222; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; margin-bottom: 6px;">
          <span style="color: #ffffff; font-size: 13px;">${option.name}</span>
          <span style="color: #d4af37; font-size: 14px; font-weight: bold;">${(price * 100).toFixed(0)}%</span>
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
  
  // Prevent clicks and mousedown on the card from opening the tweet
  // Use capture phase to intercept before Twitter's handlers
  const stopPropagation = (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    // Allow default behavior (link navigation) but prevent bubbling to tweet
  };
  
  container.addEventListener('click', stopPropagation, true);
  container.addEventListener('mousedown', stopPropagation, true);
  container.addEventListener('mouseup', stopPropagation, true);
  
  // Also prevent clicks on all links inside the card from bubbling to tweet
  // But allow the link's default behavior (navigation) to work
  requestAnimationFrame(() => {
    const links = container.querySelectorAll('a');
    links.forEach(link => {
      const linkStopPropagation = (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Default behavior (navigation) will still work
      };
      link.addEventListener('click', linkStopPropagation, true);
      link.addEventListener('mousedown', linkStopPropagation, true);
      link.addEventListener('mouseup', linkStopPropagation, true);
    });
  });
  
   // Position card after it's added to DOM to handle stacking for multiple cards
   requestAnimationFrame(() => {
     const article = container.closest('article[data-testid="tweet"]');
     if (article) {
       // Ensure article has position relative for absolute positioning to work
       article.style.position = 'relative';
       article.style.overflow = 'visible';
       
       // Stack multiple cards vertically if there are more than one
       const allCards = Array.from(article.querySelectorAll('.polymarket-card'));
       const currentIndex = allCards.indexOf(container);
       if (currentIndex > 0) {
         // Calculate cumulative height of previous cards
         let totalHeight = 0;
         for (let i = 0; i < currentIndex; i++) {
           const prevCard = allCards[i];
           if (prevCard.offsetHeight > 0) {
             totalHeight += prevCard.offsetHeight + 8; // 8px gap between cards
           }
         }
         container.style.top = `${totalHeight}px`;
       }
       
       // If in degen mode, show the card immediately
       if (window.polymarketDegenMode) {
         container.style.opacity = '1';
         container.style.visibility = 'visible';
         container.style.pointerEvents = 'auto';
       }
       
       // Add hover icon if this is the first card for this tweet
       if (currentIndex === 0 && !article.querySelector('.polymarket-hover-icon')) {
         const totalCards = allCards.length;
         createHoverIcon(article, totalCards);
       } else {
         // If icon already exists, update market count and attach hover listeners to this new card
         const existingIcon = article.querySelector('.polymarket-hover-icon');
         if (existingIcon) {
           // Update market count
           const marketCountText = existingIcon.querySelector('.polymarket-market-count');
           if (marketCountText) {
             const totalCards = article.querySelectorAll('.polymarket-card').length;
             marketCountText.textContent = `${totalCards} market${totalCards > 1 ? 's' : ''} found`;
           }
           attachCardHoverListeners(article, container);
         }
       }
     }
   });
  
  return container;
};

/**
 * Attaches hover listeners to a card
 * Uses shared state from the article to coordinate hover behavior
 */
function attachCardHoverListeners(article, card) {
  // Get or create shared hover state for this article
  if (!article._polymarketHoverState) {
    article._polymarketHoverState = {
      hoverTimeout: null,
      isHovering: false
    };
  }
  const state = article._polymarketHoverState;
  const cards = article.querySelectorAll('.polymarket-card');
  
   const showCards = () => {
     state.isHovering = true;
     if (state.hoverTimeout) {
       clearTimeout(state.hoverTimeout);
       state.hoverTimeout = null;
     }
     cards.forEach(c => {
       c.style.opacity = '1';
       c.style.visibility = 'visible';
       c.style.pointerEvents = 'auto';
     });
   };
   
   const hideCards = () => {
     // Don't hide if in degen mode
     if (window.polymarketDegenMode) return;
     
     state.isHovering = false;
     state.hoverTimeout = setTimeout(() => {
       // Only hide if we're still not hovering and not in degen mode
       if (!state.isHovering && !window.polymarketDegenMode) {
         cards.forEach(c => {
           c.style.opacity = '0';
           c.style.visibility = 'hidden';
           c.style.pointerEvents = 'none';
         });
       }
     }, 300); // Longer delay to allow moving from icon to card
   };
  
  // Remove existing listeners if any, then add new ones
  if (card._polymarketHandlers) {
    card.removeEventListener('mouseenter', card._polymarketHandlers.enter);
    card.removeEventListener('mouseleave', card._polymarketHandlers.leave);
  }
  
  const newCardEnter = () => showCards();
  const newCardLeave = () => hideCards();
  
  card.addEventListener('mouseenter', newCardEnter);
  card.addEventListener('mouseleave', newCardLeave);
  
  // Store handlers for potential cleanup
  card._polymarketHandlers = { enter: newCardEnter, leave: newCardLeave };
}

/**
 * Creates a hover icon next to the tweet time in the header
 */
function createHoverIcon(article, marketCount) {
  // Find the time element in the tweet header
  const timeElement = article.querySelector('time');
  if (!timeElement) {
    // Fallback: try to find the header area
    const header = article.querySelector('[data-testid="User-Name"]')?.parentElement;
    if (!header) {
      console.warn('[Polymarket] Could not find tweet header for icon placement');
      return;
    }
    // Insert after the header content
    insertIconAfterElement(header, marketCount, article);
    return;
  }
  
  // Insert icon after the time element
  insertIconAfterElement(timeElement, marketCount, article);
}

/**
 * Inserts the icon container after a given element
 */
function insertIconAfterElement(referenceElement, marketCount, article) {
  const iconContainer = document.createElement('span');
  iconContainer.className = 'polymarket-hover-icon-container';
  iconContainer.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    vertical-align: middle;
    position: relative;
    z-index: 10;
  `;
  
  // Prevent hover events from bubbling to parent elements (like the time element)
  iconContainer.addEventListener('mouseenter', (e) => {
    e.stopPropagation();
  });
  iconContainer.addEventListener('mouseleave', (e) => {
    e.stopPropagation();
  });
  
  const icon = document.createElement('div');
  icon.className = 'polymarket-hover-icon';
  
  // Create image element for logo
  const logoImg = document.createElement('img');
  const logoUrl = typeof chrome !== 'undefined' && chrome.runtime 
    ? chrome.runtime.getURL('assets/jaeger_logo_128.png')
    : 'assets/jaeger_logo_128.png';
  logoImg.src = logoUrl;
  logoImg.alt = 'Polymarket';
  logoImg.style.cssText = `
    width: 16px;
    height: 16px;
    object-fit: contain;
  `;
  icon.appendChild(logoImg);
  
  icon.style.cssText = `
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s ease;
    pointer-events: auto;
    flex-shrink: 0;
  `;
  
  // Create market count text
  const marketCountText = document.createElement('span');
  marketCountText.className = 'polymarket-market-count';
  marketCountText.textContent = `${marketCount} market${marketCount > 1 ? 's' : ''} found`;
  marketCountText.style.cssText = `
    color: #71767b;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    transition: text-decoration 0.2s ease;
  `;
  
  iconContainer.appendChild(icon);
  iconContainer.appendChild(marketCountText);
  
  // Insert the container after the reference element
  // If it's a time element, insert after its parent to avoid triggering time hover
  if (referenceElement.tagName === 'TIME') {
    const timeParent = referenceElement.parentElement;
    if (timeParent && timeParent !== article) {
      // Insert after the time's parent container
      if (timeParent.nextSibling) {
        timeParent.parentNode.insertBefore(iconContainer, timeParent.nextSibling);
      } else {
        timeParent.parentNode.appendChild(iconContainer);
      }
    } else {
      // Fallback: insert after time element but add isolation
      if (referenceElement.nextSibling) {
        referenceElement.parentNode.insertBefore(iconContainer, referenceElement.nextSibling);
      } else {
        referenceElement.parentNode.appendChild(iconContainer);
      }
    }
  } else {
    // For non-time elements, insert normally
    if (referenceElement.nextSibling) {
      referenceElement.parentNode.insertBefore(iconContainer, referenceElement.nextSibling);
    } else {
      referenceElement.parentNode.appendChild(iconContainer);
    }
  }
  
  // Disable pointer events on the time element when hovering over our icon
  const disableTimeHover = () => {
    const timeEl = article.querySelector('time');
    if (timeEl) {
      timeEl.style.pointerEvents = 'none';
    }
  };
  
  const enableTimeHover = () => {
    const timeEl = article.querySelector('time');
    if (timeEl) {
      timeEl.style.pointerEvents = '';
    }
  };
  
  iconContainer.addEventListener('mouseenter', disableTimeHover);
  iconContainer.addEventListener('mouseleave', enableTimeHover);
  
  // Create shared hover state for this article
  article._polymarketHoverState = {
    hoverTimeout: null,
    isHovering: false
  };
  const state = article._polymarketHoverState;
  const cards = article.querySelectorAll('.polymarket-card');
  
   const showCards = () => {
     state.isHovering = true;
     if (state.hoverTimeout) {
       clearTimeout(state.hoverTimeout);
       state.hoverTimeout = null;
     }
     cards.forEach(card => {
       card.style.opacity = '1';
       card.style.visibility = 'visible';
       card.style.pointerEvents = 'auto';
     });
   };
   
   const hideCards = () => {
     // Don't hide if in degen mode
     if (window.polymarketDegenMode) return;
     
     state.isHovering = false;
     state.hoverTimeout = setTimeout(() => {
       // Only hide if we're still not hovering and not in degen mode
       if (!state.isHovering && !window.polymarketDegenMode) {
         cards.forEach(card => {
           card.style.opacity = '0';
           card.style.visibility = 'hidden';
           card.style.pointerEvents = 'none';
         });
       }
     }, 400); // Longer delay to allow moving from icon to card
   };
  
  // Show cards when hovering over icon or container
  // Stop propagation to prevent triggering time element hover
  const iconEnter = (e) => {
    e.stopPropagation();
    showCards();
  };
  const iconLeave = (e) => {
    e.stopPropagation();
    hideCards();
  };
  
  icon.addEventListener('mouseenter', iconEnter);
  iconContainer.addEventListener('mouseenter', iconEnter);
  icon.addEventListener('mouseleave', iconLeave);
  iconContainer.addEventListener('mouseleave', iconLeave);
  
  // Keep cards visible when hovering over them
  cards.forEach(card => {
    attachCardHoverListeners(article, card);
  });
  
  // Hover effect on icon
  icon.addEventListener('mouseenter', () => {
    icon.style.transform = 'scale(1.1)';
  });
  
  icon.addEventListener('mouseleave', () => {
    icon.style.transform = 'scale(1)';
  });
}

/**
 * Toggles Degen Mode
 */
function toggleDegenMode() {
  window.polymarketDegenMode = !window.polymarketDegenMode;
  localStorage.setItem('polymarketDegenMode', window.polymarketDegenMode.toString());
  
  if (window.polymarketDegenMode) {
    document.querySelectorAll('.polymarket-card').forEach(card => {
      card.style.opacity = '1';
      card.style.visibility = 'visible';
      card.style.pointerEvents = 'auto';
    });
  } else {
    document.querySelectorAll('.polymarket-card').forEach(card => {
      card.style.opacity = '0';
      card.style.visibility = 'hidden';
      card.style.pointerEvents = 'none';
    });
  }
  
  console.log(`[Polymarket] Degen Mode ${window.polymarketDegenMode ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Creates the Degen Mode toggle switch
 */
function createToggleButton() {
  if (document.getElementById('polymarket-degen-toggle')) return;
  
  const container = document.createElement('div');
  container.id = 'polymarket-degen-toggle';
  container.style.cssText = `
    position: fixed !important;
    top: 12px !important;
    right: 80px !important;
    z-index: 999999 !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    cursor: pointer !important;
    user-select: none !important;
  `;
  
  const label = document.createElement('span');
  label.textContent = 'DEGEN MODE';
  label.style.cssText = `
    color: #e7e9ea !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    letter-spacing: 0.5px !important;
  `;
  
  const toggleTrack = document.createElement('div');
  toggleTrack.className = 'polymarket-toggle-track';
  toggleTrack.style.cssText = `
    position: relative !important;
    width: 48px !important;
    height: 28px !important;
    background: ${window.polymarketDegenMode 
      ? 'linear-gradient(135deg, #d4af37 0%, #f4d03f 100%)' 
      : '#39393d'} !important;
    border-radius: 14px !important;
    transition: background 0.3s ease !important;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3) !important;
  `;
  
  const toggleThumb = document.createElement('div');
  toggleThumb.className = 'polymarket-toggle-thumb';
  toggleThumb.style.cssText = `
    position: absolute !important;
    top: 2px !important;
    left: ${window.polymarketDegenMode ? '22px' : '2px'} !important;
    width: 24px !important;
    height: 24px !important;
    background: #ffffff !important;
    border-radius: 12px !important;
    transition: left 0.3s cubic-bezier(0.4, 0.0, 0.2, 1) !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 2px rgba(0, 0, 0, 0.1) !important;
  `;
  
  toggleTrack.appendChild(toggleThumb);
  container.appendChild(label);
  container.appendChild(toggleTrack);
  
  container.onclick = () => {
    toggleDegenMode();
    
    const isOn = window.polymarketDegenMode;
    toggleTrack.style.background = isOn 
      ? 'linear-gradient(135deg, #d4af37 0%, #f4d03f 100%)' 
      : '#39393d';
    toggleThumb.style.left = isOn ? '22px' : '2px';
  };
  
  container.addEventListener('mouseenter', () => {
    toggleTrack.style.transform = 'scale(1.05)';
  });
  
  container.addEventListener('mouseleave', () => {
    toggleTrack.style.transform = 'scale(1)';
  });
  
  toggleTrack.style.transition = 'background 0.3s ease, transform 0.1s ease';
  
  document.body.appendChild(container);
  console.log('[Polymarket] ✓ Degen Mode toggle added');
}

/**
 * Creates the toggle button - SIMPLE VERSION
 */

// Inject CSS to ensure proper positioning context
function injectPositioningStyles() {
  if (document.getElementById('polymarket-positioning-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'polymarket-positioning-styles';
  style.textContent = `
    article[data-testid="tweet"] {
      position: relative !important;
      overflow: visible !important;
    }
    .polymarket-card a:hover {
      text-decoration: underline !important;
    }
    .polymarket-hover-icon-container {
      pointer-events: auto !important;
    }
    .polymarket-market-count:hover {
      text-decoration: underline !important;
    }
  `;
  document.head.appendChild(style);
}

// Initialize on Twitter
if (window.location.href.includes('twitter.com') || window.location.href.includes('x.com')) {
  injectPositioningStyles();
  setTimeout(createToggleButton, 2000);
  console.log('[Polymarket UI] Loaded');
}
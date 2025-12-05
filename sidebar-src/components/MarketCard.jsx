// MARKET CARD COMPONENT - Compact Card Design
// Clean, minimal design showing essential market info

import { useEffect, useRef } from 'react';

export default function MarketCard({ market }) {
  const cardRef = useRef(null);
  const question = market.question || market.title || 'Unknown Market';
  const url = market.url || '#';
  const volume = parseFloat(market.volume) || 0;
  const options = Array.isArray(market.options) ? market.options : [];
  const marketType = market.displayType || (options.length > 1 ? 'grouped' : 'binary');

  const yesPrice = parseFloat(market.outcomes?.[0]?.price) || 0;
  const noPriceValue = parseFloat(market.outcomes?.[1]?.price);
  const noPrice = Number.isFinite(noPriceValue) && noPriceValue > 0
    ? noPriceValue
    : Math.max(0, 1 - yesPrice);

  const yesPercent = yesPrice * 100;
  const noPercent = noPrice * 100;

  const formatPercent = (value) => {
    const numeric = typeof value === 'number' ? value : parseFloat(value) || 0;
    const percent = numeric * 100;
    if (percent > 0 && percent < 1) {
      return '<1%';
    }
    return `${Math.round(percent)}%`;
  };

  const formatVolume = (value) => {
    const numeric = Number(value) || 0;
    if (numeric >= 1000000) {
      return `$${(numeric / 1000000).toFixed(1)}M`;
    }
    if (numeric >= 1000) {
      return `$${(numeric / 1000).toFixed(0)}k`;
    }
    if (numeric > 0) {
      return `$${numeric.toFixed(0)}`;
    }
    return null;
  };

  const renderGroupedOptions = () => {
    const displayOptions = options.slice(0, 3);
    const hasMoreOptions = options.length > 3;

    return (
      <div className="market-options-table">
        <div className="options-header">
          <span>Outcome</span>
          <span>% Chance</span>
        </div>
        {options.length === 0 ? (
          <div className="market-option-row no-options">
            <span>No outcomes available</span>
          </div>
        ) : (
          <>
            {displayOptions.map((option, index) => {
              const label = option.label || option.question;
              const volumeLabel = formatVolume(option.volume);
              return (
                <div
                  className="market-option-row"
                  key={option.id || option.slug || `${market.id || 'market'}-${index}`}
                >
                  <div className="option-left">
                    <div className="option-title">{label}</div>
                    {volumeLabel && (
                      <div className="option-volume">{volumeLabel} Vol.</div>
                    )}
                  </div>
                  <div className="option-percent">{formatPercent(option.yesPrice)}</div>
                </div>
              );
            })}
            {hasMoreOptions && (
              <div className="show-more-row">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="show-more-link"
                >
                  Show more on Polymarket →
                </a>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderBinaryOdds = () => (
    <>
      <div className="odds-bar">
        <div className="odds-bar-yes" style={{ width: `${yesPercent}%` }}></div>
        <div className="odds-bar-no" style={{ width: `${noPercent}%` }}></div>
      </div>

      <div className="market-odds">
        <div className="odds-pill yes">
          <span className="odds-label">Yes</span>
          <span className="odds-value">{Math.round(yesPercent)}%</span>
        </div>
        <div className="odds-pill no">
          <span className="odds-label">No</span>
          <span className="odds-value">{Math.round(noPercent)}%</span>
        </div>
      </div>
    </>
  );

  const parentVolumeLabel = formatVolume(volume);

  // Add visible class when card enters viewport
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Check if card is already visible (for cards at top of list)
    const rect = card.getBoundingClientRect();
    const isAlreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
    
    if (isAlreadyVisible) {
      // Add class immediately if already in view
      card.classList.add('market-card-visible');
      return;
    }

    // Otherwise use IntersectionObserver for scroll-triggered visibility
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('market-card-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(card);

    return () => {
      if (card) observer.unobserve(card);
    };
  }, []);

  return (
    <a 
      ref={cardRef}
      href={url}
      target="_blank" 
      rel="noopener noreferrer"
      className="market-card"
    >
      <div className="market-card-content">
        <div className="market-header">
          <h3 className="market-question">{question}</h3>
          {parentVolumeLabel && (
            <span className="market-volume">{parentVolumeLabel} Vol.</span>
          )}
        </div>

        {marketType === 'grouped' ? renderGroupedOptions() : renderBinaryOdds()}

        <div className="market-link-footer">
          <span className="market-link-text">View on Polymarket</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 3C3.22386 3 3 3.22386 3 3.5C3 3.77614 3.22386 4 3.5 4V3ZM8.5 3.5H9C9 3.22386 8.77614 3 8.5 3V3.5ZM8 8.5C8 8.77614 8.22386 9 8.5 9C8.77614 9 9 8.77614 9 8.5H8ZM2.64645 8.85355C2.45118 8.65829 2.45118 8.34171 2.64645 8.14645L5.82843 4.96447C6.02369 4.7692 6.34027 4.7692 6.53553 4.96447C6.7308 5.15973 6.7308 5.47631 6.53553 5.67157L3.70711 8.5L6.53553 11.3284C6.7308 11.5237 6.7308 11.8403 6.53553 12.0355C6.34027 12.2308 6.02369 12.2308 5.82843 12.0355L2.64645 8.85355ZM3.5 4H8.5V3H3.5V4ZM8 3.5V8.5H9V3.5H8Z" fill="currentColor"/>
          </svg>
        </div>
      </div>
    </a>
  );
}

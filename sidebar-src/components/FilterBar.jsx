import React, { useState } from 'react';

export default function FilterBar({ 
  markets, 
  onSortChange, 
  onViewChange,
  sortBy = 'volume',
  viewMode = 'grid'
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSortChange = (newSort) => {
    onSortChange(newSort);
  };

  const handleViewToggle = (newView) => {
    onViewChange(newView);
  };

  return (
    <div className="filter-bar">
      {/* Top Row: Market Count + Quick Actions */}
      <div className="filter-bar-main">
        <div className="market-count">
          <span className="count-number">{markets.length}</span>
          <span className="count-label">Markets</span>
        </div>

        <div className="filter-actions">
          {/* Sort Dropdown */}
          <div className="filter-group">
            <label className="filter-label">Sort</label>
            <div className="sort-buttons">
              <button
                className={`sort-btn ${sortBy === 'volume' ? 'active' : ''}`}
                onClick={() => handleSortChange('volume')}
                title="Sort by volume"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18M3 12h12M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Volume
              </button>
              <button
                className={`sort-btn ${sortBy === 'odds' ? 'active' : ''}`}
                onClick={() => handleSortChange('odds')}
                title="Sort by odds"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2v20M17 7l-5-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Odds
              </button>
              <button
                className={`sort-btn ${sortBy === 'recent' ? 'active' : ''}`}
                onClick={() => handleSortChange('recent')}
                title="Sort by recent"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Recent
              </button>
            </div>
          </div>

          {/* View Toggle */}
          <div className="filter-group">
            <label className="filter-label">View</label>
            <div className="view-toggle">
              <button
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleViewToggle('grid')}
                title="Grid view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" rx="1"/>
                </svg>
              </button>
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleViewToggle('list')}
                title="List view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Expand/Collapse More Filters */}
          <button 
            className="expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Hide filters' : 'Show more filters'}
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Filters (Optional) */}
      {isExpanded && (
        <div className="filter-bar-expanded">
          <div className="filter-row">
            <div className="filter-item">
              <label className="filter-label-expanded">Min Volume</label>
              <select className="filter-select">
                <option value="0">Any</option>
                <option value="1000">$1k+</option>
                <option value="10000">$10k+</option>
                <option value="100000">$100k+</option>
              </select>
            </div>
            <div className="filter-item">
              <label className="filter-label-expanded">Min Odds</label>
              <select className="filter-select">
                <option value="0">Any</option>
                <option value="60">60%+</option>
                <option value="70">70%+</option>
                <option value="80">80%+</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


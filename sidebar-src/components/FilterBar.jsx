import React, { useState } from 'react';

export default function FilterBar({ 
  markets, 
  onSortChange, 
  onViewChange,
  sortBy = 'recent',
  viewMode = 'grid'
}) {
  const handleSortChange = (e) => {
    onSortChange(e.target.value);
  };

  const handleViewChange = (e) => {
    onViewChange(e.target.value);
  };

  return (
    <div className="filter-bar">
      {/* Single Row: Market Count + Compact Dropdowns */}
      <div className="filter-bar-main">
        <div className="market-count">
          <span className="count-number">{markets.length}</span>
          <span className="count-label">Markets</span>
        </div>

        <div className="filter-actions">
          {/* Sort Dropdown */}
          <div className="filter-dropdown-group">
            <label className="dropdown-label">Sort by</label>
            <select 
              className="filter-dropdown" 
              value={sortBy} 
              onChange={handleSortChange}
            >
              <option value="volume">💰 Volume</option>
              <option value="odds">📊 Odds</option>
              <option value="recent">🕐 Recent</option>
            </select>
          </div>

          {/* View Dropdown */}
          <div className="filter-dropdown-group">
            <label className="dropdown-label">View</label>
            <select 
              className="filter-dropdown" 
              value={viewMode} 
              onChange={handleViewChange}
            >
              <option value="grid">⊞ Grid</option>
              <option value="list">☰ List</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}


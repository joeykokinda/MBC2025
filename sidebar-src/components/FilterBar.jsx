import React, { useState } from 'react';

export default function FilterBar({ 
  markets, 
  onSortChange, 
  onViewChange,
  sortBy = 'volume',
  viewMode = 'grid'
}) {
  const [frequency, setFrequency] = useState('all');
  const [status, setStatus] = useState('active');

  const handleSortChange = (e) => {
    onSortChange(e.target.value);
  };

  const handleViewChange = (e) => {
    onViewChange(e.target.value);
  };

  const handleFrequencyChange = (e) => {
    setFrequency(e.target.value);
  };

  const handleStatusChange = (e) => {
    setStatus(e.target.value);
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
          {/* Sort By Dropdown */}
          <div className="filter-dropdown-group">
            <label className="dropdown-label">Sort by</label>
            <select 
              className="filter-dropdown" 
              value={sortBy} 
              onChange={handleSortChange}
            >
              <option value="volume">24hr Volume</option>
              <option value="totalVolume">Total Volume</option>
              <option value="liquidity">Liquidity</option>
              <option value="recent">Newest</option>
              <option value="ending">Ending Soon</option>
              <option value="odds">Competitive</option>
            </select>
          </div>

          {/* Frequency Dropdown */}
          <div className="filter-dropdown-group">
            <label className="dropdown-label">Frequency</label>
            <select 
              className="filter-dropdown" 
              value={frequency} 
              onChange={handleFrequencyChange}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="all">All</option>
            </select>
          </div>

          {/* Status Dropdown */}
          <div className="filter-dropdown-group">
            <label className="dropdown-label">Status</label>
            <select 
              className="filter-dropdown" 
              value={status} 
              onChange={handleStatusChange}
            >
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}


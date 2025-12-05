import React from 'react';

export default function FilterBar({ 
  markets
}) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-main">
        <div className="market-count">
          <span className="count-number">{markets.length}</span>
          <span className="count-label">Markets</span>
        </div>
      </div>
    </div>
  );
}


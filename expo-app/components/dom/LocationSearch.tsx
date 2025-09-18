'use dom';

import React, { useState, useEffect, useCallback } from 'react';

interface LocationResult {
  id: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  place_type: string[];
  properties?: {
    address?: string;
  };
}

interface LocationSearchProps {
  initialQuery?: string;
  onSelect: (location: {
    latitude: number;
    longitude: number;
    placeName: string;
    placeId: string;
    address?: string;
  }) => void;
  onClose: () => void;
}

export function LocationSearch({ initialQuery = '', onSelect, onClose }: LocationSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            query
          )}.json?access_token=${mapboxToken}&limit=5&types=place,poi,address`
        );

        if (response.ok) {
          const data = await response.json();
          setResults(data.features || []);
          setSelectedIndex(0);
        }
      } catch (error) {
        console.error('Error searching locations:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = useCallback(
    (result: LocationResult) => {
      onSelect({
        latitude: result.center[1],
        longitude: result.center[0],
        placeName: result.place_name.split(',')[0], // First part is usually the main name
        placeId: result.id,
        address: result.place_name,
      });
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % results.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, handleSelect, onClose]
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        width: '400px',
        maxHeight: '500px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            📍 Search Location
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6B7280',
            }}
          >
            ×
          </button>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for a place..."
          autoFocus
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {loading && (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px',
            }}
          >
            Searching...
          </div>
        )}

        {!loading && results.length === 0 && query.length >= 2 && (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px',
            }}
          >
            No results found
          </div>
        )}

        {!loading &&
          results.map((result, index) => (
            <div
              key={result.id}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderRadius: '6px',
                marginBottom: '4px',
                backgroundColor: selectedIndex === index ? '#F3F4F6' : 'transparent',
                transition: 'background-color 0.15s',
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '2px',
                }}
              >
                {result.place_name.split(',')[0]}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#6B7280',
                }}
              >
                {result.place_name.split(',').slice(1).join(',')}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#9CA3AF',
                  marginTop: '2px',
                }}
              >
                {result.center[1].toFixed(4)}, {result.center[0].toFixed(4)}
              </div>
            </div>
          ))}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #E5E7EB',
          fontSize: '12px',
          color: '#6B7280',
        }}
      >
        <span style={{ marginRight: '16px' }}>↑↓ Navigate</span>
        <span style={{ marginRight: '16px' }}>Enter Select</span>
        <span>Esc Close</span>
      </div>
    </div>
  );
}
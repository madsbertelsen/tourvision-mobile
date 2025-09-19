'use dom';

import React, { useEffect, useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LocationData {
  latitude: number;
  longitude: number;
  placeName: string;
  address?: string;
}

interface DocumentMapViewProps {
  locations: LocationData[];
  height?: number;
}

// Set Mapbox access token
if (process.env.EXPO_PUBLIC_MAPBOX_TOKEN) {
  mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
}

export function DocumentMapView({ locations, height = 400 }: DocumentMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || !mapboxgl.accessToken) return;

    // Initialize map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: locations.length > 0 ? [locations[0].longitude, locations[0].latitude] : [12.5683, 55.6761], // Default to Copenhagen
      zoom: locations.length > 0 ? 10 : 11,
    });

    mapRef.current = map;

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add markers for each location
    locations.forEach((location, index) => {
      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.style.width = '30px';
      el.style.height = '30px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#3B82F6';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.style.fontSize = '14px';
      el.innerHTML = `${index + 1}`;

      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div style="padding: 8px;">
          <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">${location.placeName}</h3>
          ${location.address ? `<p style="margin: 0; font-size: 12px; color: #666;">${location.address}</p>` : ''}
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #999;">
            ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}
          </p>
        </div>`
      );

      // Create marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([location.longitude, location.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Fit map to show all markers if there are multiple locations
    if (locations.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      locations.forEach(loc => {
        bounds.extend([loc.longitude, loc.latitude]);
      });
      map.fitBounds(bounds, { padding: 50 });
    }

    // Clean up on unmount
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.remove();
    };
  }, [locations]);

  if (!mapboxgl.accessToken) {
    return (
      <div
        style={{
          height: `${height}px`,
          backgroundColor: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          color: '#6b7280',
        }}
      >
        <p>Map view requires Mapbox token</p>
      </div>
    );
  }

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
      }}
    />
  );
}
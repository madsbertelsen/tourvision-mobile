'use dom';

import 'mapbox-gl/dist/mapbox-gl.css';
import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Map, { Layer, Marker, Popup, Source } from 'react-map-gl/dist/mapbox';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

// Matching colors from the TipTap destination nodes
const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

interface Waypoint {
  lat: number;
  lng: number;
  index: number;
}

interface TransportationRoute {
  id: string;
  mode: string;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  color: string;
  fromPlace: string;
  toPlace: string;
  duration: string;
  waypoints?: Waypoint[];
}

interface MapViewProps {
  locations?: Location[];
  center?: { lat: number; lng: number };
  zoom?: number;
  onLocationClick?: (location: Location) => void;
  onMapClick?: (lat: number, lng: number) => void;
  style?: React.CSSProperties;
  showRoute?: boolean;
  routeGeometry?: {
    type: 'LineString';
    coordinates: number[][];
  };
  routeColor?: string;
  transportationRoutes?: TransportationRoute[];
  onRouteClick?: (routeId: string, lngLat: { lng: number; lat: number }, segmentIndex?: number) => void;
  onWaypointDrag?: (routeId: string, waypointIndex: number, newPosition: { lng: number; lat: number }) => void;
}

export default function MapView({
  locations = [],
  center = { lat: 40.7128, lng: -74.0060 },
  zoom = 10,
  onLocationClick,
  onMapClick,
  style = { width: '100%', height: '400px' },
  showRoute = false,
  routeGeometry,
  routeColor = '#6366F1',
  transportationRoutes = [],
  onRouteClick,
  onWaypointDrag
}: MapViewProps) {

  // Use provided center, or first location, or default
  const initialCenter = center || (locations.length > 0
    ? { lat: locations[0].lat, lng: locations[0].lng }
    : { lat: 40.7128, lng: -74.0060 });
    
  const [viewState, setViewState] = useState({
    longitude: initialCenter.lng,
    latitude: initialCenter.lat,
    zoom: zoom,
  });
  
  const [popupInfo, setPopupInfo] = useState<Location | null>(null);
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPreview, setHoverPreview] = useState<{ lng: number; lat: number; routeId: string; segmentIndex: number } | null>(null);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [draggedRoute, setDraggedRoute] = useState<TransportationRoute | null>(null);

  // Add ResizeObserver to handle container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
        if (map) {
          // Trigger map resize when container size changes
          map.resize();
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    // Only auto-fit bounds if we don't have explicit center/zoom
    if (locations.length > 0 && mapRef.current && !center && !zoom) {
      if (locations.length === 1) {
        // For single location, just fly to it
        mapRef.current.flyTo({
          center: [locations[0].lng, locations[0].lat],
          zoom: 12,
          duration: 1000,
        });
      } else {
        // For multiple locations, fit bounds
        const bounds: [[number, number], [number, number]] = [
          [180, 90],
          [-180, -90]
        ];

        locations.forEach(loc => {
          bounds[0][0] = Math.min(bounds[0][0], loc.lng);
          bounds[0][1] = Math.min(bounds[0][1], loc.lat);
          bounds[1][0] = Math.max(bounds[1][0], loc.lng);
          bounds[1][1] = Math.max(bounds[1][1], loc.lat);
        });

        mapRef.current.fitBounds(bounds, {
          padding: 50,
          duration: 1000,
        });
      }
    }
  }, [locations, center, zoom]);

  const handleMapClick = useCallback((event: any) => {
    if (onMapClick) {
      onMapClick(event.lngLat.lat, event.lngLat.lng);
    }
  }, [onMapClick]);

  const handleMarkerClick = useCallback((location: Location, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopupInfo(location);
    if (onLocationClick) {
      onLocationClick(location);
    }
  }, [onLocationClick]);

  const handleRouteClick = useCallback((routeId: string, e: any) => {
    if (onRouteClick && e.lngLat) {
      onRouteClick(routeId, { lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
  }, [onRouteClick]);

  // Helper to find nearest point on a polyline and which segment it's on
  const findNearestPointOnLine = useCallback((
    point: { lng: number; lat: number },
    lineCoordinates: number[][]
  ): { lng: number; lat: number; segmentIndex: number } => {
    let minDistance = Infinity;
    let nearestPoint = { lng: lineCoordinates[0][0], lat: lineCoordinates[0][1] };
    let nearestSegmentIndex = 0;

    for (let i = 0; i < lineCoordinates.length - 1; i++) {
      const start = { lng: lineCoordinates[i][0], lat: lineCoordinates[i][1] };
      const end = { lng: lineCoordinates[i + 1][0], lat: lineCoordinates[i + 1][1] };

      // Calculate projection of point onto line segment
      const dx = end.lng - start.lng;
      const dy = end.lat - start.lat;
      const t = Math.max(0, Math.min(1, ((point.lng - start.lng) * dx + (point.lat - start.lat) * dy) / (dx * dx + dy * dy)));

      const projection = {
        lng: start.lng + t * dx,
        lat: start.lat + t * dy
      };

      // Calculate distance
      const distance = Math.sqrt(
        Math.pow(projection.lng - point.lng, 2) +
        Math.pow(projection.lat - point.lat, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = projection;
        nearestSegmentIndex = i;
      }
    }

    return { ...nearestPoint, segmentIndex: nearestSegmentIndex };
  }, []);

  const handleMapMouseMove = useCallback((e: any) => {
    if (!mapRef.current || !e.lngLat) return;

    // Skip hover updates when dragging
    if (isDraggingPreview) {
      return;
    }

    // Normal hover behavior when not dragging
    // Check if hovering over any route
    const features = mapRef.current.queryRenderedFeatures(e.point, {
      layers: transportationRoutes.map(r => `transport-route-click-${r.id}`)
    });

    if (features && features.length > 0) {
      const routeId = features[0].properties?.routeId;
      if (routeId) {
        const route = transportationRoutes.find(r => r.id === routeId);
        if (route) {
          const nearestPointData = findNearestPointOnLine(
            { lng: e.lngLat.lng, lat: e.lngLat.lat },
            route.geometry.coordinates
          );
          setHoverPreview({
            lng: nearestPointData.lng,
            lat: nearestPointData.lat,
            routeId,
            segmentIndex: nearestPointData.segmentIndex
          });
          mapRef.current.getCanvas().style.cursor = 'pointer';
        }
      }
    } else {
      setHoverPreview(null);
      mapRef.current.getCanvas().style.cursor = '';
    }
  }, [transportationRoutes, findNearestPointOnLine, isDraggingPreview]);

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  return (
    <div ref={containerRef} style={style}>
      <style>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onLoad={() => {
          // Trigger resize when map loads to ensure it fits container
          if (mapRef.current) {
            const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
            if (map) {
              // Small delay to ensure container is fully rendered
              setTimeout(() => {
                map.resize();
              }, 100);
            }
          }
        }}
        onClick={(e) => {
          // Don't handle clicks when dragging preview
          if (isDraggingPreview) return;

          // Check if clicking on a route
          if (mapRef.current && e.lngLat) {
            const features = mapRef.current.queryRenderedFeatures(e.point, {
              layers: transportationRoutes.map(r => `transport-route-click-${r.id}`)
            });

            if (features && features.length > 0) {
              const routeId = features[0].properties?.routeId;
              if (routeId && onRouteClick) {
                // Find which segment the click was on
                const route = transportationRoutes.find(r => r.id === routeId);
                if (route) {
                  const nearestPointData = findNearestPointOnLine(
                    { lng: e.lngLat.lng, lat: e.lngLat.lat },
                    route.geometry.coordinates
                  );
                  onRouteClick(routeId, { lng: e.lngLat.lng, lat: e.lngLat.lat }, nearestPointData.segmentIndex);
                }
                return; // Don't trigger map click
              }
            }
          }
          handleMapClick(e);
        }}
        onMouseMove={handleMapMouseMove}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={transportationRoutes.map(r => `transport-route-click-${r.id}`)}
      >
        {showRoute && routeGeometry && (
          <Source
            id="route"
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: routeGeometry,
            }}
          >
            <Layer
              id="route-line"
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
              }}
              paint={{
                'line-color': routeColor,
                'line-width': 4,
                'line-opacity': 0.75,
              }}
            />
          </Source>
        )}
        
        {/* Render all transportation routes */}
        {transportationRoutes.map((route) => (
          <React.Fragment key={route.id}>
            <Source
              id={`transport-route-${route.id}`}
              type="geojson"
              data={{
                type: 'Feature',
                properties: {
                  routeId: route.id,
                  mode: route.mode,
                  fromPlace: route.fromPlace,
                  toPlace: route.toPlace,
                  duration: route.duration,
                },
                geometry: route.geometry,
              }}
            >
              <Layer
                id={`transport-route-line-${route.id}`}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': route.color || '#6B7280',
                  'line-width': 3,
                  'line-opacity': 0.6,
                  'line-dasharray': route.mode === 'walking' ? [2, 2] : undefined,
                }}
              />
              {/* Interactive invisible layer for click detection */}
              <Layer
                id={`transport-route-click-${route.id}`}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': 'transparent',
                  'line-width': 40, // Wider for easier clicking
                }}
              />
            </Source>

            {/* Render waypoint markers */}
            {route.waypoints?.map((waypoint, index) => (
              <Marker
                key={`${route.id}-waypoint-${index}`}
                longitude={waypoint.lng}
                latitude={waypoint.lat}
                draggable={true}
                onDragEnd={(e) => {
                  if (onWaypointDrag) {
                    onWaypointDrag(route.id, index, { lng: e.lngLat.lng, lat: e.lngLat.lat });
                  }
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: route.color || '#6B7280',
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    cursor: 'move',
                  }}
                />
              </Marker>
            ))}
          </React.Fragment>
        ))}

        {/* Hover preview dot */}
        {hoverPreview && (
          <Marker
            longitude={hoverPreview.lng}
            latitude={hoverPreview.lat}
            anchor="center"
            draggable={true}
            onDragStart={() => {
              setIsDraggingPreview(true);
              const route = transportationRoutes.find(r => r.id === hoverPreview.routeId);
              setDraggedRoute(route || null);
              // Disable map dragging - use getMap() to access the underlying mapbox instance
              if (mapRef.current) {
                const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
                if (map && map.dragPan) {
                  map.dragPan.disable();
                }
              }
            }}
            onDrag={(e) => {
              // Don't update position during drag - let the marker follow the cursor naturally
              // We'll snap to the route on drag end
            }}
            onDragEnd={(e) => {
              // Re-enable map dragging
              if (mapRef.current) {
                const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
                if (map && map.dragPan) {
                  map.dragPan.enable();
                }
              }

              // Create waypoint at the exact drop position
              if (draggedRoute && e && e.lngLat && hoverPreview) {
                const dropPoint = { lng: e.lngLat.lng, lat: e.lngLat.lat };
                console.log('Waypoint dropped at:', dropPoint, 'from segment:', hoverPreview.segmentIndex);

                // Create waypoint at the exact drop position (not snapped to route)
                // The route will be recalculated to go through this point
                // Pass segment index to help with proper waypoint ordering
                if (onRouteClick) {
                  onRouteClick(draggedRoute.id, dropPoint, hoverPreview.segmentIndex);
                }
              }

              // Reset drag state
              setIsDraggingPreview(false);
              setDraggedRoute(null);
              setHoverPreview(null);
            }}
          >
            <div
              style={{
                width: isDraggingPreview ? '20px' : '16px',
                height: isDraggingPreview ? '20px' : '16px',
                borderRadius: '50%',
                backgroundColor: isDraggingPreview ? '#4ade80' : 'white',
                border: `2px solid ${isDraggingPreview ? '#166534' : '#333'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                cursor: isDraggingPreview ? 'grabbing' : 'grab',
                animation: isDraggingPreview ? 'none' : 'pulse 1.5s ease-in-out infinite',
                transition: 'all 0.2s ease',
              }}
            />
          </Marker>
        )}

        {locations.map((location, index) => {
          const colorIndex = location.colorIndex ?? index;
          const markerColor = MARKER_COLORS[colorIndex % MARKER_COLORS.length];
          
          return (
            <Marker
              key={location.id}
              longitude={location.lng}
              latitude={location.lat}
              anchor="bottom"
              onClick={(e) => handleMarkerClick(location, e)}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: markerColor,
                  border: '3px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                }}
              />
            </Marker>
          );
        })}
        
        {popupInfo && (
          <Popup
            anchor="top"
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            onClose={() => setPopupInfo(null)}
            closeButton={true}
            closeOnClick={false}
          >
            <div style={{ padding: '8px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold' }}>
                {popupInfo.name}
              </h3>
              {popupInfo.description && (
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                  {popupInfo.description}
                </p>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
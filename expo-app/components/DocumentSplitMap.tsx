import React, { useRef, useState, useEffect, useCallback, memo, ReactNode } from 'react';
import { StyleSheet, View, Text } from 'react-native';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl/mapbox';
import * as turf from '@turf/turf';
import { usePresentation } from '@/contexts/presentation-context';
import { calculateMapBounds } from '@/utils/parse-presentation-blocks';
import PresentationOverlay from './PresentationOverlay';

interface Location {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex?: number;
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: Array<{lat: number, lng: number}> | null;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface DocumentSplitMapProps {
  locations: Location[];
  sidebarContent?: ReactNode;
  arrowContent?: ReactNode;
  searchResults?: SearchResult[];
  selectedSearchIndex?: number;
  onSearchResultSelect?: (index: number) => void;
  previewRoute?: {
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number };
    geometry?: {
      type: 'LineString';
      coordinates: number[][];
    };
  } | null;
}

// Color array starting with Purple (to match expected first location color)
const COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'
  // Purple,   Blue,     Green,    Orange,   Red
];

const DocumentSplitMap = memo(function DocumentSplitMap({
  locations,
  sidebarContent,
  arrowContent,
  searchResults = [],
  selectedSearchIndex = 0,
  onSearchResultSelect,
  previewRoute,
}: DocumentSplitMapProps) {
  const mapRef = useRef<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);

  // Presentation mode
  const { isPresenting, currentBlockIndex, blocks } = usePresentation();

  // Fetch routes between consecutive locations (only when transportation is defined)
  useEffect(() => {
    const fetchRoutes = async () => {
      if (locations.length < 2) {
        setRoutes([]);
        return;
      }

      const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
      const routePromises = [];

      // Only fetch routes for locations that have transportFrom defined
      for (let i = 0; i < locations.length; i++) {
        const to = locations[i];

        // Skip if no transport connection is defined
        if (!to.transportFrom) {
          continue;
        }

        // Find the "from" location by geoId
        const from = locations.find(loc => loc.geoId === to.transportFrom);
        if (!from) {
          console.warn(`Transport from location ${to.transportFrom} not found for ${to.placeName}`);
          continue;
        }

        // Use waypoints if defined, otherwise direct route
        let coordinates;
        if (to.waypoints && to.waypoints.length > 0) {
          // Include waypoints in the route
          const waypointCoords = to.waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
          coordinates = `${from.lng},${from.lat};${waypointCoords};${to.lng},${to.lat}`;
        } else {
          coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
        }

        // Determine transport profile (default to walking)
        const profile = to.transportProfile || 'walking';
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

        routePromises.push(
          fetch(url)
            .then(res => res.json())
            .then(data => {
              if (data.routes && data.routes[0]) {
                return {
                  geometry: data.routes[0].geometry,
                  from: from.geoId,
                  to: to.geoId,
                  colorIndex: from.colorIndex || 0
                };
              }
              return null;
            })
            .catch(err => {
              console.error('Error fetching route:', err);
              return null;
            })
        );
      }

      const fetchedRoutes = await Promise.all(routePromises);
      setRoutes(fetchedRoutes.filter(r => r !== null));
    };

    fetchRoutes();
  }, [locations]);

  // Calculate initial view state to fit all locations and search results
  const getInitialViewState = () => {
    // If we have search results, focus on the selected one
    if (searchResults && searchResults.length > 0 && selectedSearchIndex < searchResults.length) {
      const selected = searchResults[selectedSearchIndex];
      if (selected && selected.lat && selected.lon) {
        return {
          latitude: parseFloat(selected.lat),
          longitude: parseFloat(selected.lon),
          zoom: 12
        };
      }
    }

    if (locations.length === 0) {
      return {
        latitude: 0,
        longitude: 0,
        zoom: 1
      };
    }

    if (locations.length === 1) {
      return {
        latitude: locations[0].lat,
        longitude: locations[0].lng,
        zoom: 12
      };
    }

    // Calculate bounds for multiple locations
    const lats = locations.map(l => l.lat);
    const lngs = locations.map(l => l.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    // Calculate zoom based on bounds
    const latDiff = Math.max(...lats) - Math.min(...lats);
    const lngDiff = Math.max(...lngs) - Math.min(...lngs);
    const maxDiff = Math.max(latDiff, lngDiff);

    let zoom = 10;
    if (maxDiff > 10) zoom = 3;
    else if (maxDiff > 5) zoom = 5;
    else if (maxDiff > 2) zoom = 7;
    else if (maxDiff > 1) zoom = 9;

    return {
      latitude: centerLat,
      longitude: centerLng,
      zoom
    };
  };

  const [viewState, setViewState] = useState(getInitialViewState());
  const animationRef = useRef<number | null>(null);

  // Simple animation state
  const animationStateRef = useRef<{
    phase: 'zoom-out' | 'pan' | 'zoom-in';
    startViewState: any;
    targetViewState: any;
    progress: number; // 0 to 1
  } | null>(null);

  // Smooth camera animation: zoom out → pan → zoom in
  const animateToLocation = useCallback((targetLat: number, targetLng: number, targetZoom: number = 12) => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const currentLat = viewState.latitude;
    const currentLng = viewState.longitude;
    const currentZoom = viewState.zoom;

    // Calculate zoom level that fits both points
    const startPoint = turf.point([currentLng, currentLat]);
    const endPoint = turf.point([targetLng, targetLat]);
    const distance = turf.distance(startPoint, endPoint, { units: 'kilometers' });

    // Determine zoom-out level based on distance
    let zoomOutLevel = currentZoom - 2;
    if (distance > 1000) zoomOutLevel = Math.min(zoomOutLevel, 3);
    else if (distance > 500) zoomOutLevel = Math.min(zoomOutLevel, 4);
    else if (distance > 200) zoomOutLevel = Math.min(zoomOutLevel, 5);
    else if (distance > 100) zoomOutLevel = Math.min(zoomOutLevel, 6);
    zoomOutLevel = Math.max(1, zoomOutLevel); // Never zoom out too far

    // Animation phases with durations
    const ZOOM_OUT_DURATION = 0.3; // 30% of animation
    const PAN_DURATION = 0.4;       // 40% of animation
    const ZOOM_IN_DURATION = 0.3;   // 30% of animation

    // Calculate animation speed based on distance
    // Short distances (< 50km): 1.5s total
    // Medium distances (100-500km): 2-3s total
    // Long distances (> 1000km): 4s total
    let animationSpeed;
    if (distance < 50) {
      animationSpeed = 0.011; // ~1.5s
    } else if (distance < 100) {
      animationSpeed = 0.008; // ~2s
    } else if (distance < 500) {
      animationSpeed = 0.006; // ~2.7s
    } else if (distance < 1000) {
      animationSpeed = 0.005; // ~3.3s
    } else {
      animationSpeed = 0.004; // ~4s
    }

    animationStateRef.current = {
      phase: 'zoom-out',
      startViewState: { ...viewState },
      targetViewState: {
        latitude: targetLat,
        longitude: targetLng,
        zoom: targetZoom
      },
      progress: 0
    };

    const easeInOutCubic = (t: number) => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    // Smoother easing for pan - slower acceleration/deceleration
    const easeInOutQuint = (t: number) => {
      return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
    };

    const animate = () => {
      if (!animationStateRef.current) return;

      const state = animationStateRef.current;
      state.progress += animationSpeed; // Distance-based animation speed

      const t = Math.min(1, state.progress);

      let newViewState;

      if (t < ZOOM_OUT_DURATION) {
        // Phase 1: Zoom out
        const phaseProgress = easeInOutCubic(t / ZOOM_OUT_DURATION);
        newViewState = {
          ...viewState,
          latitude: currentLat,
          longitude: currentLng,
          zoom: currentZoom + (zoomOutLevel - currentZoom) * phaseProgress
        };
      } else if (t < ZOOM_OUT_DURATION + PAN_DURATION) {
        // Phase 2: Pan to target (with smoother easing)
        const rawProgress = (t - ZOOM_OUT_DURATION) / PAN_DURATION;
        const phaseProgress = easeInOutQuint(rawProgress);
        newViewState = {
          ...viewState,
          latitude: currentLat + (targetLat - currentLat) * phaseProgress,
          longitude: currentLng + (targetLng - currentLng) * phaseProgress,
          zoom: zoomOutLevel
        };
      } else {
        // Phase 3: Zoom in
        const rawProgress = (t - ZOOM_OUT_DURATION - PAN_DURATION) / ZOOM_IN_DURATION;
        const phaseProgress = easeInOutCubic(rawProgress);
        newViewState = {
          ...viewState,
          latitude: targetLat,
          longitude: targetLng,
          zoom: zoomOutLevel + (targetZoom - zoomOutLevel) * phaseProgress
        };
      }

      setViewState(newViewState);

      if (state.progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Final position
        setViewState(state.targetViewState);
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [viewState]);

  // Track previous selected index to avoid unnecessary animations
  const prevSelectedIndexRef = useRef(selectedSearchIndex);
  const prevSearchResultsLengthRef = useRef(0);

  // Animate to first result when search results first appear
  useEffect(() => {
    // Check if search results just became available
    if (searchResults && searchResults.length > 0 && prevSearchResultsLengthRef.current === 0) {
      prevSearchResultsLengthRef.current = searchResults.length;

      // Animate to the selected result (usually the first one)
      const selected = searchResults[selectedSearchIndex];
      if (selected && selected.lon && selected.lat) {
        const lat = parseFloat(selected.lat);
        const lng = parseFloat(selected.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          animateToLocation(lat, lng, 12);
        }
      }
    } else if (!searchResults || searchResults.length === 0) {
      // Reset when search results are cleared
      prevSearchResultsLengthRef.current = 0;
    }
  }, [searchResults, selectedSearchIndex, animateToLocation]);

  // Update view when selected search result changes with animation
  useEffect(() => {
    // Only animate if the index actually changed
    if (prevSelectedIndexRef.current === selectedSearchIndex) {
      return;
    }
    prevSelectedIndexRef.current = selectedSearchIndex;

    if (searchResults && searchResults.length > 0 && selectedSearchIndex >= 0 && selectedSearchIndex < searchResults.length) {
      const selected = searchResults[selectedSearchIndex];
      if (selected && selected.lon && selected.lat) {
        const lat = parseFloat(selected.lat);
        const lng = parseFloat(selected.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          animateToLocation(lat, lng, 12);
        }
      }
    }
  }, [selectedSearchIndex, searchResults, animateToLocation]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Presentation mode: animate to locations in current block
  useEffect(() => {
    if (!isPresenting || blocks.length === 0) return;

    const currentBlock = blocks[currentBlockIndex];
    if (!currentBlock || currentBlock.locations.length === 0) {
      console.log('[DocumentSplitMap] No locations in current block');
      return;
    }

    console.log('[DocumentSplitMap] Presenting block', currentBlockIndex, 'with', currentBlock.locations.length, 'locations');

    // Calculate bounds for all locations in this block
    const bounds = calculateMapBounds(currentBlock.locations);
    if (!bounds) return;

    // Animate to the calculated bounds
    animateToLocation(bounds.center.lat, bounds.center.lng, bounds.zoom);
  }, [isPresenting, currentBlockIndex, blocks, animateToLocation]);

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
        {...viewState}
        onMove={(evt: any) => {
          // Update viewState for manual user interactions
          setViewState(evt.viewState);
        }}
      >
        {/* Navigation controls */}
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />

        {/* Preview route (shown while configuring transportation) */}
        {previewRoute && previewRoute.geometry && (
          <Source
            key="preview-route"
            id="preview-route"
            type="geojson"
            data={previewRoute.geometry}
          >
            <Layer
              id="preview-route-line"
              type="line"
              paint={{
                'line-color': '#3B82F6',
                'line-width': 4,
                'line-opacity': 0.6,
                'line-dasharray': [2, 2], // Dashed line to indicate it's a preview
              }}
            />
          </Source>
        )}

        {/* Route lines */}
        {routes.map((route, index) => {
          const routeColor = COLORS[(route.colorIndex || 0) % 5];
          return (
            <Source
              key={`route-${index}`}
              id={`route-${index}`}
              type="geojson"
              data={route.geometry}
            >
              <Layer
                id={`route-line-${index}`}
                type="line"
                paint={{
                  'line-color': routeColor,
                  'line-width': 3,
                  'line-opacity': 0.75
                }}
              />
            </Source>
          );
        })}

        {/* Search result markers - show in orange/yellow */}
        {searchResults && searchResults.length > 0 && searchResults
          .filter(result => result && result.lat && result.lon)
          .map((result, index) => {
            const isSelected = index === selectedSearchIndex;
            return (
              <Marker
                key={`search-${index}`}
                latitude={parseFloat(result.lat)}
                longitude={parseFloat(result.lon)}
                anchor="center"
                onClick={() => onSearchResultSelect?.(index)}
              >
                <View style={[
                  styles.searchMarker,
                  isSelected && styles.searchMarkerSelected
                ]}>
                  <View style={styles.searchMarkerInner}>
                    <Text style={styles.searchMarkerText}>{index + 1}</Text>
                  </View>
                </View>
              </Marker>
            );
          })}

        {/* Location markers */}
        {locations.map((location, index) => (
          <Marker
            key={location.geoId || `marker-${index}-${location.lat}-${location.lng}`}
            latitude={location.lat}
            longitude={location.lng}
            anchor="center"
          >
            <View style={[
              styles.marker,
              { backgroundColor: COLORS[(location.colorIndex || 0) % 5] }
            ]}>
              <View style={styles.markerInner} />
            </View>
          </Marker>
        ))}
      </Map>

      {/* Sidebar - rendered within map container */}
      {sidebarContent}

      {/* Arrow segments - rendered within map container */}
      {arrowContent}

      {/* Presentation overlay - shown when presenting */}
      <PresentationOverlay />
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Re-render if locations changed or modal content changed
  if (prevProps.locations.length !== nextProps.locations.length) {
    return false; // Re-render
  }

  // Check if sidebar content changed
  if (prevProps.sidebarContent !== nextProps.sidebarContent) {
    return false; // Re-render
  }

  // Check if arrow content changed
  if (prevProps.arrowContent !== nextProps.arrowContent) {
    return false; // Re-render
  }

  // Check if search results changed
  if (prevProps.searchResults?.length !== nextProps.searchResults?.length ||
      prevProps.selectedSearchIndex !== nextProps.selectedSearchIndex) {
    return false; // Re-render
  }

  // Check if any location changed
  for (let i = 0; i < prevProps.locations.length; i++) {
    const prev = prevProps.locations[i];
    const next = nextProps.locations[i];

    if (prev.geoId !== next.geoId ||
        prev.lat !== next.lat ||
        prev.lng !== next.lng ||
        prev.colorIndex !== next.colorIndex) {
      return false; // Re-render
    }
  }

  return true; // Skip re-render
});

export default DocumentSplitMap;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  markerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
  },
  searchMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'white',
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  searchMarkerSelected: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    backgroundColor: '#F97316',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  searchMarkerInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchMarkerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});

import React, { useRef, useState, useEffect, useCallback, memo, ReactNode } from 'react';
import { StyleSheet, View, Text } from 'react-native';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl/mapbox';
import * as turf from '@turf/turf';

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
  searchResults?: SearchResult[];
  selectedSearchIndex?: number;
  onSearchResultSelect?: (index: number) => void;
}

// Color array starting with Purple (to match expected first location color)
const COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'
  // Purple,   Blue,     Green,    Orange,   Red
];

const DocumentSplitMap = memo(function DocumentSplitMap({
  locations,
  sidebarContent,
  searchResults = [],
  selectedSearchIndex = 0,
  onSearchResultSelect,
}: DocumentSplitMapProps) {
  const mapRef = useRef<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);

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

  // State for animated dot and arc trajectory as GeoJSON
  const [animatedDotGeoJSON, setAnimatedDotGeoJSON] = useState<any>(null);

  const [arcTrajectoryGeoJSON, setArcTrajectoryGeoJSON] = useState<any>({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: []
    }
  });

  // Physics-based animation parameters
  const animationStateRef = useRef<{
    startLat: number;
    startLng: number;
    targetLat: number;
    targetLng: number;
    velocity: number;
    t: number; // progress from 0 to 1
    arcHeight: number; // height of the arc
  } | null>(null);

  // Generate great circle arc trajectory using turf.js
  const generateArcTrajectory = (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    // Create a great circle arc between the two points
    const startPoint = turf.point([start.lng, start.lat]);
    const endPoint = turf.point([end.lng, end.lat]);

    // Generate the great circle arc
    const greatCircleArc = turf.greatCircle(startPoint, endPoint, {
      npoints: 100  // Number of points along the arc for smooth animation
    });

    // Return the coordinates of the great circle
    if (greatCircleArc.geometry.type === 'LineString') {
      return greatCircleArc.geometry.coordinates;
    } else if (greatCircleArc.geometry.type === 'MultiLineString') {
      // For very long distances, turf might return MultiLineString
      // Concatenate all the coordinates
      return greatCircleArc.geometry.coordinates.flat();
    }

    return [[start.lng, start.lat], [end.lng, end.lat]];
  };

  // Get a point along the arc at position t (0 to 1)
  const getPointAlongArc = (arcCoordinates: number[][], t: number) => {
    if (!arcCoordinates || arcCoordinates.length === 0) {
      return { lng: 0, lat: 0 };
    }

    // Create a line from the arc coordinates
    const line = turf.lineString(arcCoordinates);
    const length = turf.length(line);
    const targetDistance = length * t;

    // Get the point at the target distance along the line
    const point = turf.along(line, targetDistance);

    return {
      lng: point.geometry.coordinates[0],
      lat: point.geometry.coordinates[1]
    };
  };

  // Store the last animated position in a ref to avoid recreating the animation function
  const lastAnimatedPosition = useRef<{lat: number, lng: number} | null>(null);

  // CAMERA ANIMATION DISABLED
  // Keeping camera state ref for potential future use, but not actively using it
  // The viewport remains static while only the red dot animates
  /*
  const cameraStateRef = useRef({
    lat: viewState.latitude,
    lng: viewState.longitude,
    zoom: viewState.zoom,
  });
  */

  // Physics-based animation with red dot
  const animateToLocation = useCallback((targetLat: number, targetLng: number, targetZoom: number = 12) => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Get current position from the last animated position or view center
    const currentLat = lastAnimatedPosition.current?.lat ?? viewState.latitude;
    const currentLng = lastAnimatedPosition.current?.lng ?? viewState.longitude;

    // Camera animation disabled - viewport remains static

    // Generate the arc trajectory
    const arcCoordinates = generateArcTrajectory(
      { lat: currentLat, lng: currentLng },
      { lat: targetLat, lng: targetLng }
    );

    // Set the arc trajectory line
    setArcTrajectoryGeoJSON({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: arcCoordinates
      }
    });

    // Initialize animation state
    animationStateRef.current = {
      startLat: currentLat,
      startLng: currentLng,
      targetLat,
      targetLng,
      velocity: 0,
      t: 0,
      arcHeight: 0.3
    };

    const animate = (timestamp: number) => {
      if (!animationStateRef.current) return;

      const state = animationStateRef.current;

      // Much simpler constant speed motion
      // This prevents the camera from having to chase an accelerating target
      if (state.t < 0.95) {
        // Constant speed for most of the journey
        state.velocity = 0.008;
      } else {
        // Slow down at the very end to ensure arrival
        state.velocity = Math.max(0.002, (1 - state.t) / 5);
      }

      state.t = Math.min(1, state.t + state.velocity);

      // Get position along the arc
      const position = getPointAlongArc(arcCoordinates, state.t);

      // Update the dot position
      setAnimatedDotGeoJSON({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [position.lng, position.lat]
        }
      });

      // Update last position ref
      lastAnimatedPosition.current = { lat: position.lat, lng: position.lng };

      // CAMERA ANIMATION DISABLED - Only visualizing with red dot and arc line
      // The viewport stays static while the dot animates along the path

      if (state.t < 0.999) {  // Use 0.999 to ensure we get very close
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Snap dot to final position
        state.t = 1;
        setAnimatedDotGeoJSON({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [targetLng, targetLat]
          }
        });

        // Update last position ref
        lastAnimatedPosition.current = { lat: targetLat, lng: targetLng };

        animationRef.current = null;

        // Clear the arc line and dot after a short delay
        setTimeout(() => {
          setAnimatedDotGeoJSON(null);
          setArcTrajectoryGeoJSON({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: []
            }
          });
        }, 500);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [viewState]);

  // Track previous selected index to avoid unnecessary animations
  const prevSelectedIndexRef = useRef(selectedSearchIndex);

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

        {/* Arc trajectory line */}
        <Source
          id="arc-trajectory"
          type="geojson"
          data={arcTrajectoryGeoJSON}
        >
          <Layer
            id="arc-trajectory-line"
            type="line"
            paint={{
              'line-color': '#EF4444',
              'line-width': 3,
              'line-opacity': 0.8,
              'line-dasharray': [3, 1]
            }}
          />
        </Source>

        {/* Animated red dot */}
        {animatedDotGeoJSON && (
          <Source
            id="animated-dot"
            type="geojson"
            data={animatedDotGeoJSON}
          >
            <Layer
              id="animated-dot-layer"
              type="circle"
              paint={{
                'circle-radius': 10,
                'circle-color': '#EF4444',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
                'circle-opacity': 1
              }}
            />
          </Source>
        )}
      </Map>

      {/* Sidebar - rendered within map container */}
      {sidebarContent}
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

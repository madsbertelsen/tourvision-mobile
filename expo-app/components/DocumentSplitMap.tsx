import React, { useRef, useState, useEffect, useCallback, memo, ReactNode } from 'react';
import { StyleSheet, View, Text } from 'react-native';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl/mapbox';
import * as turf from '@turf/turf';
import { usePresentation, FocusedGeoLocation } from '@/contexts/presentation-context';
import { calculateMapBounds } from '@/utils/parse-presentation-blocks';
import CurrentWordOverlay from './CurrentWordOverlay';
import { MapboxRouteLayers } from './MapboxRouteLayers';

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
  onWaypointsChange?: (locationId: string, waypoints: Array<{lat: number, lng: number}>) => void;
}

// Color array - Blue first to match location marker colors
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

// Same threshold as in EditableRouteOverlay
const PROXIMITY_THRESHOLD = 0.002;

const DocumentSplitMap = memo(function DocumentSplitMap({
  locations,
  sidebarContent,
  arrowContent,
  searchResults = [],
  selectedSearchIndex = 0,
  onSearchResultSelect,
  previewRoute,
  onWaypointsChange,
}: DocumentSplitMapProps) {
  const mapRef = useRef<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  // Edit mode is always enabled - users can always add waypoints
  const editMode = true;
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null); // Auto-select based on proximity
  const [cursorPosition, setCursorPosition] = useState<[number, number] | null>(null);
  const [proximityPoint, setProximityPoint] = useState<[number, number] | null>(null);
  const [isDraggingWaypoint, setIsDraggingWaypoint] = useState(false);
  const [draggedWaypoint, setDraggedWaypoint] = useState<{position: [number, number], routeIndex: number, segmentIndex?: number} | null>(null);

  // Presentation mode
  const { isPresenting, currentBlockIndex, blocks, focusedGeoLocation } = usePresentation();

  // Handle route waypoint updates from dragging
  const handleRouteUpdate = useCallback(async (toLocationId: string, waypoints: Array<{lat: number, lng: number}>, insertAtSegment?: number) => {
    console.log('[DocumentSplitMap] Route updated for location:', toLocationId, 'waypoints:', waypoints, 'segment:', insertAtSegment);

    // Find the route and its start/end locations
    const route = routes.find(r => r.toLocationId === toLocationId);
    if (!route) return;

    const fromLocation = locations.find(l => l.geoId === route.fromLocationId);
    const toLocation = locations.find(l => l.geoId === route.toLocationId);

    if (!fromLocation || !toLocation) return;

    // Update the location's waypoints in the document
    if (onWaypointsChange && toLocation) {
      console.log('[DocumentSplitMap] Updating waypoints in document for location:', toLocation.placeName);
      onWaypointsChange(toLocation.geoId, waypoints);
    }

    // Recalculate route through waypoints using Mapbox API
    const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!mapboxToken) {
      console.error('[DocumentSplitMap] No Mapbox token found');
      return;
    }

    try {
      // Build coordinates string: origin;waypoint1;waypoint2;...;destination
      let coordinates = `${fromLocation.lng},${fromLocation.lat}`;

      // Add waypoints
      waypoints.forEach(wp => {
        coordinates += `;${wp.lng},${wp.lat}`;
      });

      // Add destination
      coordinates += `;${toLocation.lng},${toLocation.lat}`;

      const url = `https://api.mapbox.com/directions/v5/mapbox/${route.transportProfile || 'driving'}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

      console.log('[DocumentSplitMap] Fetching route with waypoints:', url);

      const response = await fetch(url);
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const updatedRoute = {
          ...route,
          geometry: data.routes[0].geometry,
          duration: data.routes[0].duration,
          distance: data.routes[0].distance,
          waypoints: waypoints
        };

        // Update the routes state with the new geometry
        setRoutes(prevRoutes => {
          return prevRoutes.map(r => {
            if (r.toLocationId === toLocationId) {
              return updatedRoute;
            }
            return r;
          });
        });

        console.log('[DocumentSplitMap] Route recalculated with waypoints successfully');
      }
    } catch (error) {
      console.error('[DocumentSplitMap] Error recalculating route:', error);
    }
  }, [routes, locations]);

  // Fetch routes between consecutive locations (only when transportation is defined)
  useEffect(() => {
    const fetchRoutes = async () => {
      console.log('[DocumentSplitMap] Starting route fetch for locations:', locations);

      if (locations.length < 2) {
        console.log('[DocumentSplitMap] Not enough locations for routes (need at least 2)');
        setRoutes([]);
        return;
      }

      const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
      const routePromises = [];

      // Toggle this to show routes between ALL consecutive locations vs only those with transportFrom
      const SHOW_ALL_ROUTES = true; // Set to false to only show routes where transportFrom is defined

      if (SHOW_ALL_ROUTES) {
        // OPTION 2: Create routes between ALL consecutive locations
        for (let i = 1; i < locations.length; i++) {
          const from = locations[i - 1];
          const to = locations[i];
          console.log(`[DocumentSplitMap] Creating route from ${from.placeName} to ${to.placeName}`);

          // Use waypoints if defined, otherwise direct route
          let coordinates;
          if (to.waypoints && to.waypoints.length > 0) {
            // Include waypoints in the route
            const waypointCoords = to.waypoints.map((wp: {lng: number, lat: number}) => `${wp.lng},${wp.lat}`).join(';');
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
                    id: `route-${from.geoId}-${to.geoId}`,
                    fromLocationId: from.geoId,
                    toLocationId: to.geoId,
                    geometry: data.routes[0].geometry,
                    from: from.geoId,
                    to: to.geoId,
                    colorIndex: from.colorIndex || 0,
                    waypoints: to.waypoints
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
      } else {
        // OPTION 1: Only fetch routes for locations that have transportFrom defined
        for (let i = 0; i < locations.length; i++) {
          const to = locations[i];
          console.log(`[DocumentSplitMap] Checking location ${i}: ${to.placeName}, transportFrom: ${to.transportFrom}`);

          // Skip if no transport connection is defined
          if (!to.transportFrom) {
            console.log(`[DocumentSplitMap] Skipping ${to.placeName} - no transportFrom defined`);
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
            const waypointCoords = to.waypoints.map((wp: {lng: number, lat: number}) => `${wp.lng},${wp.lat}`).join(';');
            coordinates = `${from.lng},${from.lat};${waypointCoords};${to.lng},${to.lat}`;
          } else {
            coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
          }

          // Determine transport profile (default to walking)
          const profile = to.transportProfile || 'walking';
          const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;
          console.log('[DocumentSplitMap] Fetching route with waypoints:', url);

          routePromises.push(
            fetch(url)
              .then(res => res.json())
              .then(data => {
                if (data.routes && data.routes[0]) {
                  return {
                    id: `route-${from.geoId}-${to.geoId}`,
                    fromLocationId: from.geoId,
                    toLocationId: to.geoId,
                    geometry: data.routes[0].geometry,
                    from: from.geoId,
                    to: to.geoId,
                    colorIndex: from.colorIndex || 0,
                    waypoints: to.waypoints
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
      }

      const fetchedRoutes = await Promise.all(routePromises);
      const validRoutes = fetchedRoutes.filter(r => r !== null);
      console.log('[DocumentSplitMap] Fetched routes:', validRoutes);
      setRoutes(validRoutes);
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

  // Update map view when locations change
  useEffect(() => {
    // Skip if in presentation mode (presentation handles its own map focus)
    if (isPresenting) return;

    // Skip if there are search results (they take priority)
    if (searchResults && searchResults.length > 0) return;

    // Skip if there's a preview route (user is actively adding a location)
    if (previewRoute) return;

    // Calculate new view state based on current locations
    const newViewState = getInitialViewState();

    // Only update if the view state actually changed significantly
    const hasSignificantChange =
      Math.abs(newViewState.latitude - viewState.latitude) > 0.01 ||
      Math.abs(newViewState.longitude - viewState.longitude) > 0.01 ||
      Math.abs(newViewState.zoom - viewState.zoom) > 0.5;

    if (hasSignificantChange) {
      console.log('[DocumentSplitMap] Locations changed, updating map view:', {
        locationsCount: locations.length,
        newView: newViewState,
      });
      setViewState(newViewState);
    }
  }, [locations, isPresenting, searchResults, previewRoute]);

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
  const prevBlockIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (!isPresenting || blocks.length === 0) {
      prevBlockIndexRef.current = -1;
      return;
    }

    // Only animate if block actually changed
    if (prevBlockIndexRef.current === currentBlockIndex) {
      return;
    }

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

    // Track this block index
    prevBlockIndexRef.current = currentBlockIndex;
  }, [isPresenting, currentBlockIndex, blocks]);

  // Animate to focused geo-location during narration
  const prevFocusedLocationRef = useRef<FocusedGeoLocation | null>(null);

  useEffect(() => {
    if (!focusedGeoLocation || !focusedGeoLocation.triggeredBySpeech) return;

    const prevLocation = prevFocusedLocationRef.current;

    // Only animate if the location actually changed (compare placeName to avoid duplicate animations)
    const locationChanged =
      !prevLocation ||
      prevLocation.placeName !== focusedGeoLocation.placeName ||
      prevLocation.lat !== focusedGeoLocation.lat ||
      prevLocation.lng !== focusedGeoLocation.lng;

    if (!locationChanged) return;

    console.log('[DocumentSplitMap] 🗺️ Animating to geo-location:', focusedGeoLocation.placeName, `(${focusedGeoLocation.lat}, ${focusedGeoLocation.lng})`);

    // Animate to the geo-marked location
    animateToLocation(focusedGeoLocation.lat, focusedGeoLocation.lng, 13);

    // Track this location
    prevFocusedLocationRef.current = focusedGeoLocation;
  }, [focusedGeoLocation, animateToLocation]);

  // Handle mouse/touch movement to track cursor position
  const handleMapMouseMove = useCallback((event: any) => {
    // Get the coordinates from the event
    const { lngLat } = event;
    if (lngLat) {
      setCursorPosition([lngLat.lng, lngLat.lat]);
      // console.log('[DocumentSplitMap] Cursor position:', lngLat.lng, lngLat.lat); // Too spammy
    }
  }, []);

  // Handle proximity point updates from the overlay
  const handleProximityPoint = useCallback((point: [number, number] | null, routeIndex: number | null) => {
    setProximityPoint(point);
    // Auto-select the route when cursor is near it
    if (routeIndex !== null && routeIndex !== selectedRouteIndex) {
      setSelectedRouteIndex(routeIndex);
      console.log('[DocumentSplitMap] Auto-selected route:', routeIndex);
    }
  }, [selectedRouteIndex]);

  // Handle drag start
  const handleDragStart = useCallback((waypoint: {position: [number, number], routeIndex: number, segmentIndex?: number}) => {
    console.log('[DocumentSplitMap] Starting waypoint drag from segment', waypoint.segmentIndex);
    setIsDraggingWaypoint(true);
    setDraggedWaypoint(waypoint);

    // Disable map dragging - try different approaches for react-map-gl
    if (mapRef.current) {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
      if (map && map.dragPan) {
        map.dragPan.disable();
      }
    }
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    console.log('[DocumentSplitMap] Ending waypoint drag');

    // Add waypoint at the final position
    if (draggedWaypoint && cursorPosition) {
      const route = routes[draggedWaypoint.routeIndex];
      if (route && route.toLocationId) {
        const newWaypoint = {
          lat: cursorPosition[1],
          lng: cursorPosition[0]
        };

        const existingWaypoints = route.waypoints || [];

        // Calculate insertion index based on segment position
        let insertIndex = existingWaypoints.length; // Default to end

        if (draggedWaypoint.segmentIndex !== undefined && route.geometry) {
          const totalSegments = route.geometry.coordinates.length - 1;
          const newWaypointProgress = draggedWaypoint.segmentIndex / totalSegments;

          // Find the correct position to insert based on route progress
          // We need to estimate the progress of existing waypoints along the route
          insertIndex = 0;

          for (let i = 0; i < existingWaypoints.length; i++) {
            const wp = existingWaypoints[i];
            // Find which segment this waypoint is closest to
            const wpNearestInfo = findNearestPointOnRoute(
              [wp.lng, wp.lat],
              route.geometry.coordinates
            );

            if (wpNearestInfo) {
              const wpProgress = wpNearestInfo.segmentIndex / totalSegments;
              if (newWaypointProgress > wpProgress) {
                insertIndex = i + 1;
              }
            }
          }
        }

        // Insert waypoint at calculated position
        const updatedWaypoints = [...existingWaypoints];
        updatedWaypoints.splice(insertIndex, 0, newWaypoint);

        handleRouteUpdate(route.toLocationId, updatedWaypoints, draggedWaypoint.segmentIndex);
        console.log('[DocumentSplitMap] Inserted waypoint at index', insertIndex, 'for segment', draggedWaypoint.segmentIndex);
      }
    }

    setIsDraggingWaypoint(false);
    setDraggedWaypoint(null);

    // Re-enable map dragging - try different approaches for react-map-gl
    if (mapRef.current) {
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
      if (map && map.dragPan) {
        map.dragPan.enable();
      }
    }
  }, [draggedWaypoint, cursorPosition, routes, handleRouteUpdate]);

  // Helper function to find the nearest point on a route
  const findNearestPointOnRoute = (
    point: [number, number],
    routeCoordinates: [number, number][]
  ): { point: [number, number]; distance: number; segmentIndex: number } | null => {
    if (!routeCoordinates || routeCoordinates.length < 2) return null;

    let minDistance = Infinity;
    let nearestPoint: [number, number] = routeCoordinates[0];
    let nearestSegmentIndex = 0;

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const nearPoint = nearestPointOnSegment(
        point,
        routeCoordinates[i],
        routeCoordinates[i + 1]
      );
      const dist = geoDistance(point, nearPoint);

      if (dist < minDistance) {
        minDistance = dist;
        nearestPoint = nearPoint;
        nearestSegmentIndex = i;
      }
    }

    return {
      point: nearestPoint,
      distance: minDistance,
      segmentIndex: nearestSegmentIndex
    };
  };

  // Find the nearest point on a line segment
  const nearestPointOnSegment = (
    point: [number, number],
    segStart: [number, number],
    segEnd: [number, number]
  ): [number, number] => {
    const dx = segEnd[0] - segStart[0];
    const dy = segEnd[1] - segStart[1];
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) return segStart;

    const t = Math.max(0, Math.min(1,
      ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / lengthSquared
    ));

    return [
      segStart[0] + t * dx,
      segStart[1] + t * dy
    ];
  };

  // Calculate distance between two geographic points
  const geoDistance = (p1: [number, number], p2: [number, number]): number => {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
  };

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
        {...viewState}
        onMove={(evt: any) => {
          // Only update viewState if not dragging a waypoint
          if (!isDraggingWaypoint) {
            setViewState(evt.viewState);
          }
        }}
        dragPan={!isDraggingWaypoint} // Disable pan when dragging waypoint
        scrollZoom={!isDraggingWaypoint} // Also disable zoom when dragging
        onMouseMove={handleMapMouseMove}
        onTouchMove={handleMapMouseMove}
        onMouseDown={(evt: any) => {
          // Check if clicking on proximity indicator
          if (proximityPoint && editMode && !isDraggingWaypoint) {
            const { lngLat } = evt;
            if (lngLat) {
              const dist = Math.sqrt(
                Math.pow(lngLat.lng - proximityPoint[0], 2) +
                Math.pow(lngLat.lat - proximityPoint[1], 2)
              );

              // If clicking near the proximity point, start dragging
              if (dist < PROXIMITY_THRESHOLD) {
                const routeIdx = selectedRouteIndex ?? 0;
                const route = routes[routeIdx];
                if (route && route.geometry && route.geometry.coordinates) {
                  // Find the segment index for this proximity point
                  const nearestInfo = findNearestPointOnRoute(
                    [lngLat.lng, lngLat.lat],
                    route.geometry.coordinates
                  );

                  handleDragStart({
                    position: proximityPoint,
                    routeIndex: routeIdx,
                    segmentIndex: nearestInfo?.segmentIndex || 0
                  });
                }
              }
            }
          }
        }}
        onMouseUp={() => {
          if (isDraggingWaypoint) {
            handleDragEnd();
          }
        }}
        onTouchEnd={() => {
          if (isDraggingWaypoint) {
            handleDragEnd();
          }
        }}
      >
        {/* Navigation controls */}
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />

        {/* Route rendering using Mapbox layers */}
        <MapboxRouteLayers
          routes={routes}
          onWaypointUpdate={handleRouteUpdate}
          editingEnabled={editMode}
          cursorPosition={cursorPosition}
          onProximityPoint={handleProximityPoint}
          zoom={viewState.zoom}
        />

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

        {/* Route lines - now rendered via deck.gl overlay, keeping this as fallback */}
        {false && routes.map((route, index) => {
          const routeColor = COLORS[(route.colorIndex || 0) % COLORS.length];
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
        {locations
          .filter(location => {
            // Filter out invalid coordinates
            const validLat = location.lat && !isNaN(location.lat) && location.lat >= -90 && location.lat <= 90;
            const validLng = location.lng && !isNaN(location.lng) && location.lng >= -180 && location.lng <= 180;
            if (!validLat || !validLng) {
              console.warn('[DocumentSplitMap] Invalid location coordinates:', location);
              return false;
            }
            return true;
          })
          .map((location, index) => (
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

        {/* Focused location marker during presentation */}
        {focusedGeoLocation && focusedGeoLocation.triggeredBySpeech && (
          <Marker
            key={`focused-${focusedGeoLocation.placeName}`}
            latitude={focusedGeoLocation.lat}
            longitude={focusedGeoLocation.lng}
            anchor="center"
          >
            <View style={styles.focusedMarker}>
              <View style={styles.focusedMarkerPulse} />
              <View style={styles.focusedMarkerInner} />
            </View>
          </Marker>
        )}
      </Map>

      {/* Current word overlay - displayed during presentation */}
      <CurrentWordOverlay />

      {/* Sidebar - rendered within map container */}
      {sidebarContent}

      {/* Arrow segments - rendered within map container */}
      {arrowContent}
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

  // Note: focusedGeoLocation comes from context hook, not props,
  // so it will trigger re-renders automatically when it changes

  return true; // Skip re-render
});

export default DocumentSplitMap;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  editModeButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editModeButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  editModeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  editModeButtonTextActive: {
    color: '#fff',
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
  focusedMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: 'white',
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  focusedMarkerPulse: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3B82F6',
    opacity: 0.3,
  },
  focusedMarkerInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
  },
});

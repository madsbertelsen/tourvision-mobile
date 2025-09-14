'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import MapGL, {
  Marker,
  Source,
  Layer,
  type MapRef,
  type MarkerDragEvent,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Location } from './location-parser';
import { parseAndGeocodeLocations } from './location-parser';
import type {
  TransportationSegment,
} from './location-parser-json';
import {
  fetchRouteGeometry,
  getModeColor,
  formatDistance,
  formatDuration,
  type RouteSegment,
  type Waypoint,
} from './route-utils';
import {
  getLocationColor,
  type LocationColorMap,
} from './location-color-assignment';
import { getMarkerColor } from './marker-colors';
import { WaypointMarker, addWaypointAtPosition } from './waypoint-marker';
import { 
  getTransportationExpansionState, 
  onExpansionChange 
} from '@/components/editor/transportation-node';

interface MapViewProps {
  locations: Location[];
  content?: string; // Raw itinerary content for geocoding
  mapboxToken?: string;
  visibleLocationNames?: string[]; // Optional filter for visible locations
  hoveredLocationName?: string; // Currently hovered location from text
  onLocationHover?: (locationName: string | null) => void; // Callback when hovering on map marker
  colorMap?: LocationColorMap | null; // Centralized color assignment
  transportationSegments?: TransportationSegment[]; // Transportation nodes from document
  onWaypointsChange?: (segmentIndex: number, waypoints: Array<[number, number]>) => void; // Callback when waypoints change
}

export function MapView({
  locations: initialLocations,
  content,
  mapboxToken,
  visibleLocationNames,
  hoveredLocationName,
  onLocationHover,
  colorMap = null,
  transportationSegments = [],
  onWaypointsChange,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const [locations, setLocations] = useState<Location[]>(initialLocations);
  const [routes, setRoutes] = useState<RouteSegment[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState(0);
  const [hoveredRoute, setHoveredRoute] = useState<number | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);

  // State for managing waypoints per route
  const [routeWaypoints, setRouteWaypoints] = useState<Map<number, Waypoint[]>>(
    new Map<number, Waypoint[]>(),
  );
  // Map route index to transportation segment index
  const [routeToSegmentMap, setRouteToSegmentMap] = useState<Map<number, number>>(
    new Map<number, number>(),
  );
  const [draggingWaypoint, setDraggingWaypoint] = useState<{
    routeIndex: number;
    waypointIndex: number;
  } | null>(null);
  
  // State for potential waypoint placement preview
  const [potentialWaypoint, setPotentialWaypoint] = useState<{
    routeIndex: number;
    coordinates: [number, number];
  } | null>(null);
  
  // State to track which transportation nodes are expanded
  const [, forceUpdate] = useState({});

  // Filter locations with coordinates
  const validLocations = useMemo(() => {
    const withCoords = locations.filter((loc) => loc.coordinates !== undefined);
    console.log(
      '[MapView] Locations with coordinates:',
      withCoords.length,
      withCoords.map((l) => ({
        name: l.name,
        coords: l.coordinates,
        day: l.day,
        time: l.time,
      })),
    );
    return withCoords;
  }, [locations]);

  // Apply visibility filter if provided (only in split view)
  const displayLocations = useMemo(() => {
    if (!visibleLocationNames || visibleLocationNames.length === 0) {
      console.log(
        '[MapView] No visibility filter, showing all',
        validLocations.length,
        'locations',
      );
      return validLocations;
    }
    const filtered = validLocations.filter((loc) =>
      visibleLocationNames.includes(loc.name),
    );
    console.log(
      '[MapView] Visibility filtered to',
      filtered.length,
      'locations:',
      visibleLocationNames,
    );
    console.log(
      '[MapView] Valid locations for filtering:',
      validLocations.map((l) => l.name),
    );
    return filtered;
  }, [validLocations, visibleLocationNames]);

  // Also filter routes to only show those between visible locations
  const displayRoutes = useMemo(() => {
    if (!visibleLocationNames || visibleLocationNames.length === 0) {
      return routes;
    }
    return routes.filter(
      (route) =>
        visibleLocationNames.includes(route.from.name) &&
        visibleLocationNames.includes(route.to.name),
    );
  }, [routes, visibleLocationNames]);

  // Only geocode if we have content but no pre-geocoded locations
  // This is a fallback - normally locations should come pre-enriched from backend
  useEffect(() => {
    // Only geocode if we have content, no initial locations, and haven't tried yet
    if (
      content &&
      initialLocations.length === 0 &&
      locations.length === 0 &&
      !isGeocoding
    ) {
      // Check if content has links (indicating it's already enriched)
      const hasLinks = /\[([^\]]+)\]\(https?:\/\/[^)]+\)/.test(content);

      if (!hasLinks) {
        // Content is not enriched yet, geocode it
        setIsGeocoding(true);
        parseAndGeocodeLocations(content, setGeocodingProgress)
          .then((geocodedLocations) => {
            setLocations(geocodedLocations);
            setIsGeocoding(false);
          })
          .catch((error) => {
            console.error('Failed to geocode locations:', error);
            setIsGeocoding(false);
          });
      }
    }
  }, [content, initialLocations.length, locations.length, isGeocoding]);

  // Calculate bounds to fit displayed markers
  useEffect(() => {
    if (displayLocations.length > 0 && mapRef.current) {
      if (displayLocations.length === 1) {
        // Single location: center on it
        const [lng, lat] = displayLocations[0].coordinates!;
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          duration: 1000,
        });
      } else {
        // Multiple locations: fit bounds
        const bounds = displayLocations.reduce(
          (acc, loc) => {
            const [lng, lat] = loc.coordinates!;
            return [
              [Math.min(acc[0][0], lng), Math.min(acc[0][1], lat)],
              [Math.max(acc[1][0], lng), Math.max(acc[1][1], lat)],
            ];
          },
          [
            [
              displayLocations[0].coordinates?.[0],
              displayLocations[0].coordinates?.[1],
            ],
            [
              displayLocations[0].coordinates?.[0],
              displayLocations[0].coordinates?.[1],
            ],
          ] as [[number, number], [number, number]],
        );

        mapRef.current.fitBounds(bounds, {
          padding: 50,
          duration: 1000,
        });
      }
    }
  }, [displayLocations]);

  // Fetch actual routes from Mapbox API - DISABLED for now
  // Routes will only be shown when explicitly added by the user
  useEffect(() => {
    // Automatic route generation is disabled
    // Uncomment below to re-enable automatic routes between locations
    /*
    if (validLocations.length < 2) return;
    
    const loadRoutes = async () => {
      setIsLoadingRoutes(true);
      try {
        const fetchedRoutes = await fetchAllRoutes(validLocations);
        setRoutes(fetchedRoutes);
      } catch (error) {
        console.error('Error loading routes:', error);
      } finally {
        setIsLoadingRoutes(false);
      }
    };
    
    loadRoutes();
    */
  }, [validLocations]);

  // Fetch routes based on transportation segments
  useEffect(() => {
    if (transportationSegments.length === 0) return;

    const loadRoutes = async () => {
      setIsLoadingRoutes(true);
      const newRoutes: RouteSegment[] = [];
      const newRouteToSegmentMap = new Map<number, number>();

      try {
        // Process each transportation segment
        for (let segmentIndex = 0; segmentIndex < transportationSegments.length; segmentIndex++) {
          const segment = transportationSegments[segmentIndex];
          // Skip segments without both coordinates
          if (!segment.fromCoordinates || !segment.toCoordinates) {
            console.log(
              '[MapView] Skipping segment without coordinates:',
              segment,
            );
            continue;
          }

          // Create location objects for the segment
          const fromLocation: Location = {
            name: segment.fromLocation || 'Start',
            coordinates: segment.fromCoordinates,
          };

          const toLocation: Location = {
            name: segment.toLocation || 'End',
            coordinates: segment.toCoordinates,
          };

          // Convert segment waypoints to Waypoint objects if they exist
          const waypoints =
            segment.waypoints?.map((coords, idx) => ({
              coordinates: coords,
              id: `segment-${segment.index}-waypoint-${idx}`,
            })) || [];

          // Fetch route geometry for this segment
          const route = await fetchRouteGeometry(
            fromLocation,
            toLocation,
            segment.mode,
            waypoints,
          );

          if (route) {
            console.log(
              '[MapView] Fetched route:',
              fromLocation.name,
              '->',
              toLocation.name,
              segment.mode,
            );
            const routeIndex = newRoutes.length;
            newRoutes.push(route);
            
            // Map route index to segment index
            newRouteToSegmentMap.set(routeIndex, segment.index ?? segmentIndex);

            // Initialize waypoints in the map state
            if (waypoints.length > 0) {
              setRouteWaypoints((prev) => {
                const newMap = new Map(prev);
                newMap.set(routeIndex, waypoints);
                return newMap;
              });
            }
          }
        }

        setRoutes(newRoutes);
        setRouteToSegmentMap(newRouteToSegmentMap);
      } catch (error) {
        console.error('[MapView] Error loading routes:', error);
      } finally {
        setIsLoadingRoutes(false);
      }
    };

    loadRoutes();
  }, [transportationSegments]);

  // Listen for expansion state changes from transportation nodes
  useEffect(() => {
    const unsubscribe = onExpansionChange(() => {
      // Force re-render when expansion state changes
      forceUpdate({});
    });
    
    return unsubscribe;
  }, []);

  // Handle waypoint drag start
  const handleWaypointDragStart = useCallback(
    (routeIndex: number, waypointIndex: number) => {
      setDraggingWaypoint({ routeIndex, waypointIndex });
    },
    [],
  );

  // Handle waypoint drag
  const handleWaypointDrag = useCallback(
    (routeIndex: number, waypointIndex: number, event: MarkerDragEvent) => {
      // Update waypoint position in real-time (optional, for visual feedback)
      const newWaypoints = new Map(routeWaypoints);
      const waypoints = newWaypoints.get(routeIndex) || [];
      if (waypoints[waypointIndex]) {
        waypoints[waypointIndex] = {
          ...waypoints[waypointIndex],
          coordinates: [event.lngLat.lng, event.lngLat.lat],
          isDragging: true,
        };
        newWaypoints.set(routeIndex, [...waypoints]);
        setRouteWaypoints(newWaypoints);
      }
    },
    [routeWaypoints],
  );

  // Handle waypoint drag end - recalculate route
  const handleWaypointDragEnd = useCallback(
    async (
      routeIndex: number,
      waypointIndex: number,
      event: MarkerDragEvent,
    ) => {
      setDraggingWaypoint(null);

      const route = routes[routeIndex];
      if (!route) return;

      // Update waypoint position
      const newWaypoints = new Map(routeWaypoints);
      const waypoints = newWaypoints.get(routeIndex) || [];

      if (waypoints[waypointIndex]) {
        waypoints[waypointIndex] = {
          ...waypoints[waypointIndex],
          coordinates: [event.lngLat.lng, event.lngLat.lat],
          isDragging: false,
        };
        newWaypoints.set(routeIndex, [...waypoints]);
        setRouteWaypoints(newWaypoints);
        
        // Notify parent about waypoint change
        const segmentIndex = routeToSegmentMap.get(routeIndex);
        if (segmentIndex !== undefined && onWaypointsChange) {
          const waypointCoords = waypoints.map(wp => wp.coordinates);
          onWaypointsChange(segmentIndex, waypointCoords);
        }

        // Recalculate route with new waypoints
        setIsLoadingRoutes(true);
        try {
          const updatedRoute = await fetchRouteGeometry(
            route.from,
            route.to,
            route.mode,
            waypoints,
          );

          if (updatedRoute) {
            const newRoutes = [...routes];
            newRoutes[routeIndex] = updatedRoute;
            setRoutes(newRoutes);
          }
        } catch (error) {
          console.error('[MapView] Error updating route:', error);
        } finally {
          setIsLoadingRoutes(false);
        }
      }
    },
    [routes, routeWaypoints, routeToSegmentMap, onWaypointsChange],
  );

  // Handle waypoint removal
  const handleWaypointRemove = useCallback(
    async (routeIndex: number, waypointIndex: number) => {
      const route = routes[routeIndex];
      if (!route) return;

      // Remove waypoint
      const newWaypoints = new Map(routeWaypoints);
      const waypoints = newWaypoints.get(routeIndex) || [];
      waypoints.splice(waypointIndex, 1);
      newWaypoints.set(routeIndex, [...waypoints]);
      setRouteWaypoints(newWaypoints);
      
      // Notify parent about waypoint change
      const segmentIndex = routeToSegmentMap.get(routeIndex);
      if (segmentIndex !== undefined && onWaypointsChange) {
        const waypointCoords = waypoints.map(wp => wp.coordinates);
        onWaypointsChange(segmentIndex, waypointCoords);
      }

      // Recalculate route without the removed waypoint
      setIsLoadingRoutes(true);
      try {
        const updatedRoute = await fetchRouteGeometry(
          route.from,
          route.to,
          route.mode,
          waypoints,
        );

        if (updatedRoute) {
          const newRoutes = [...routes];
          newRoutes[routeIndex] = updatedRoute;
          setRoutes(newRoutes);
        }
      } catch (error) {
        console.error('[MapView] Error updating route:', error);
      } finally {
        setIsLoadingRoutes(false);
      }
    },
    [routes, routeWaypoints, routeToSegmentMap, onWaypointsChange],
  );

  // Handle mouse move over route to show potential waypoint
  const handleRouteMouseMove = useCallback(
    (routeIndex: number, lngLat: [number, number]) => {
      const route = routes[routeIndex];
      if (!route || !route.geometry) return;

      const existingWaypoints = routeWaypoints.get(routeIndex) || [];
      const potentialPoint = addWaypointAtPosition(
        route.geometry.coordinates,
        lngLat,
        existingWaypoints,
      );

      if (potentialPoint) {
        setPotentialWaypoint({
          routeIndex,
          coordinates: potentialPoint.coordinates,
        });
      } else {
        setPotentialWaypoint(null);
      }
    },
    [routes, routeWaypoints],
  );

  // Handle mouse leave from route
  const handleRouteMouseLeave = useCallback(() => {
    setPotentialWaypoint(null);
  }, []);

  // Handle adding waypoint on route click
  const handleRouteClick = useCallback(
    async (routeIndex: number, lngLat: [number, number]) => {
      const route = routes[routeIndex];
      if (!route || !route.geometry) return;

      const existingWaypoints = routeWaypoints.get(routeIndex) || [];
      const newWaypoint = addWaypointAtPosition(
        route.geometry.coordinates,
        lngLat,
        existingWaypoints,
      );

      if (newWaypoint) {
        setPotentialWaypoint(null); // Clear preview
        // Add new waypoint
        const newWaypoints = new Map(routeWaypoints);
        const waypoints = [...existingWaypoints, newWaypoint];
        newWaypoints.set(routeIndex, waypoints);
        setRouteWaypoints(newWaypoints);
        
        // Notify parent about waypoint change
        const segmentIndex = routeToSegmentMap.get(routeIndex);
        if (segmentIndex !== undefined && onWaypointsChange) {
          const waypointCoords = waypoints.map(wp => wp.coordinates);
          onWaypointsChange(segmentIndex, waypointCoords);
        }

        // Recalculate route with new waypoint
        setIsLoadingRoutes(true);
        try {
          const updatedRoute = await fetchRouteGeometry(
            route.from,
            route.to,
            route.mode,
            waypoints,
          );

          if (updatedRoute) {
            const newRoutes = [...routes];
            newRoutes[routeIndex] = updatedRoute;
            setRoutes(newRoutes);
          }
        } catch (error) {
          console.error('[MapView] Error updating route:', error);
        } finally {
          setIsLoadingRoutes(false);
        }
      }
    },
    [routes, routeWaypoints, routeToSegmentMap, onWaypointsChange],
  );


  // Create route line data for each segment with different colors
  const routeLayers = useMemo(() => {
    return displayRoutes
      .map((route, index) => {
        if (!route.geometry) return null;

        return {
          id: `route-${index}`,
          data: {
            type: 'Feature' as const,
            properties: {
              mode: route.mode,
              distance: route.distance,
              duration: route.duration,
              from: route.from.name,
              to: route.to.name,
            },
            geometry: route.geometry,
          },
        };
      })
      .filter(Boolean);
  }, [displayRoutes]);

  // Default to a public token if not provided (for demo purposes)
  // In production, always use environment variable
  const token = mapboxToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

  if (!token) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900">
        <div className="text-center p-4">
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Map view requires a Mapbox token
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to your environment variables
          </p>
        </div>
      </div>
    );
  }

  if (isGeocoding) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 dark:bg-gray-900">
        <div className="text-center p-4">
          <div className="mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Finding locations on map...
          </p>
          <div className="w-48 bg-gray-200 rounded-full h-2 mx-auto">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${geocodingProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            {Math.round(geocodingProgress)}%
          </p>
        </div>
      </div>
    );
  }

  if (validLocations.length === 0 && !content) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">
          No locations found in itinerary
        </p>
      </div>
    );
  }

  // Default to Stockholm center if no locations have coordinates yet
  const defaultCenter: [number, number] = validLocations[0]?.coordinates || [
    18.0686, 59.3293,
  ]; // Stockholm center

  return (
    <>
      <style>{`
        @keyframes pulse {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0.1;
          }
          100% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
        }
      `}</style>
      <MapGL
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={{
          longitude: defaultCenter[0],
          latitude: defaultCenter[1],
          zoom: 10,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        attributionControl={false}
        interactiveLayerIds={routes.map((_, index) => `route-${index}-clickable`)}
        onMouseMove={(e) => {
          // Check if hovering over a route
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            if (feature.layer?.id) {
              const match = feature.layer.id.match(/route-(\d+)-clickable/);
              if (match) {
                const routeIndex = Number.parseInt(match[1]);
                setHoveredRoute(routeIndex);
                handleRouteMouseMove(routeIndex, [e.lngLat.lng, e.lngLat.lat]);
                e.target.getCanvas().style.cursor = 'pointer';
              }
            }
          } else {
            if (hoveredRoute !== null) {
              setHoveredRoute(null);
              handleRouteMouseLeave();
              e.target.getCanvas().style.cursor = '';
            }
          }
        }}
        onClick={(e) => {
          // Check if clicking on a route
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            if (feature.layer?.id) {
              const match = feature.layer.id.match(/route-(\d+)-clickable/);
              if (match) {
                const routeIndex = Number.parseInt(match[1]);
                handleRouteClick(routeIndex, [e.lngLat.lng, e.lngLat.lat]);
              }
            }
          }
        }}
      >
        {/* Loading indicator for routes */}
        {isLoadingRoutes && (
          <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-md">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
              <span className="text-sm">Loading routes...</span>
            </div>
          </div>
        )}

        {/* Route info panel */}
        {hoveredRoute !== null && routes[hoveredRoute] && (
          <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 px-4 py-3 rounded-lg shadow-lg max-w-xs">
            <div className="flex items-center space-x-2 mb-2">
              <div
                className={`w-3 h-3 rounded-full`}
                style={{
                  backgroundColor: getModeColor(routes[hoveredRoute].mode),
                }}
              />
              <span className="text-sm font-semibold capitalize">
                {routes[hoveredRoute].mode}
              </span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <div>
                {routes[hoveredRoute].from.name} →{' '}
                {routes[hoveredRoute].to.name}
              </div>
              <div className="flex space-x-3 mt-1">
                {routes[hoveredRoute].distance && (
                  <span>
                    📏 {formatDistance(routes[hoveredRoute].distance)}
                  </span>
                )}
                {routes[hoveredRoute].duration && (
                  <span>⏱️ {formatDuration(routes[hoveredRoute].duration)}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Route lines with different colors for different modes */}
        {routeLayers.map((layer, index) => {
          if (!layer) return null;
          const route = routes[index];
          const isHovered = hoveredRoute === index;

          return (
            <Source
              key={layer.id}
              id={layer.id}
              type="geojson"
              data={layer.data}
            >
              {/* Shadow layer for depth */}
              <Layer
                id={`${layer.id}-shadow`}
                type="line"
                paint={{
                  'line-color': '#000000',
                  'line-width': isHovered ? 8 : 6,
                  'line-opacity': 0.1,
                  'line-blur': 3,
                }}
              />

              {/* Main route line */}
              <Layer
                id={`${layer.id}-line`}
                type="line"
                paint={{
                  'line-color': getModeColor(route.mode),
                  'line-width': isHovered ? 5 : 4,
                  'line-opacity': isHovered ? 1 : 0.8,
                  'line-dasharray': route.mode === 'walking' ? [2, 2] : [1, 0],
                }}
              />
              
              {/* Invisible clickable area for better interaction */}
              <Layer
                id={`${layer.id}-clickable`}
                type="line"
                paint={{
                  'line-color': 'transparent',
                  'line-width': 30, // Much wider for easier clicking
                  'line-opacity': 0,
                }}
              />

              {/* Direction arrows */}
              <Layer
                id={`${layer.id}-arrows`}
                type="symbol"
                layout={{
                  'symbol-placement': 'line',
                  'text-field': '→',
                  'text-size': 20,
                  'text-rotation-alignment': 'map',
                  'text-allow-overlap': true,
                  'symbol-spacing': 100,
                }}
                paint={{
                  'text-color': getModeColor(route.mode),
                  'text-opacity': 0.7,
                }}
              />
            </Source>
          );
        })}

        {/* Location markers - show all but style differently based on visibility */}
        {displayLocations.map((location, index) => {
          // Check if this location is hovered (from text or map)
          const isHovered =
            hoveredLocationName === location.name ||
            hoveredMarker === location.name;

          // Get unique color for each location - prefer colorIndex from location data, then fallback to colorMap
          const markerColor =
            location.colorIndex !== undefined
              ? getMarkerColor(location.colorIndex)
              : colorMap
                ? getLocationColor(location.name, colorMap)
                : '#3B82F6';

          // Debug logging to see what's happening with colors
          console.log(
            `[MapView] Location "${location.name}" - colorIndex: ${location.colorIndex}, color: ${markerColor}`,
          );

          // Log only when hovering changes
          if (isHovered) {
            console.log(`[MapView] Hovered marker:`, location.name);
          }

          return (
            <Marker
              key={`${location.name}-${index}`}
              longitude={location.coordinates?.[0]}
              latitude={location.coordinates?.[1]}
              anchor="center"
            >
              <div
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={() => {
                  setHoveredMarker(location.name);
                  onLocationHover?.(location.name);
                }}
                onMouseLeave={() => {
                  setHoveredMarker(null);
                  onLocationHover?.(null);
                }}
              >
                {/* Label with location name - always visible */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '36px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    color: markerColor,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    fontSize: '12px',
                    fontWeight: '500',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    border: `1px solid ${markerColor}30`,
                    zIndex: isHovered ? 10 : 1,
                    opacity: isHovered ? 1 : 0.9,
                    transition: 'all 0.2s',
                    maxWidth: '180px',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  className="marker-label"
                >
                  {location.name}
                  {location.time && (
                    <div
                      style={{
                        fontSize: '10px',
                        opacity: 0.8,
                        marginTop: '1px',
                      }}
                    >
                      {location.time}
                    </div>
                  )}
                </div>

                {/* Marker circle */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: `${markerColor}40`, // 25% opacity for subtle fill
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isHovered
                      ? '0 4px 12px rgba(0,0,0,0.15)'
                      : '0 2px 4px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: isHovered
                      ? `2px solid ${markerColor}`
                      : `2px solid ${markerColor}80`,
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                  }}
                  className="marker-circle"
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      backgroundColor: markerColor,
                      borderRadius: '50%',
                    }}
                  />
                </div>

                {/* Pulse animation for first location */}
                {index === 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '24px',
                      height: '24px',
                      backgroundColor: markerColor,
                      borderRadius: '50%',
                      opacity: 0.1,
                      animation: 'pulse 2s infinite',
                    }}
                  />
                )}
              </div>
            </Marker>
          );
        })}

        {/* Render potential waypoint preview */}
        {potentialWaypoint && (() => {
          // Check if the transportation node for this route is expanded
          const segmentIndex = routeToSegmentMap.get(potentialWaypoint.routeIndex);
          const segment = segmentIndex !== undefined ? transportationSegments[segmentIndex] : null;
          const isExpanded = segment ? getTransportationExpansionState(
            segment.fromLocation,
            segment.toLocation,
            segment.mode
          ) : false;
          
          // Only show preview if the node is expanded
          if (!isExpanded) return null;
          
          return (
          <Marker
            longitude={potentialWaypoint.coordinates[0]}
            latitude={potentialWaypoint.coordinates[1]}
            anchor="center"
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: '4px solid #3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                cursor: 'pointer',
                animation: 'pulse 1s infinite',
                pointerEvents: 'none',
                position: 'absolute',
                transform: 'translate(-50%, -50%)',
                top: '50%',
                left: '50%',
              }}
            />
          </Marker>
          );
        })()}

        {/* Render waypoint markers for each route */}
        {routes.map((_, routeIndex) => {
          const waypoints = routeWaypoints.get(routeIndex) || [];
          
          // Check if the corresponding transportation node is expanded
          const segmentIndex = routeToSegmentMap.get(routeIndex);
          const segment = segmentIndex !== undefined ? transportationSegments[segmentIndex] : null;
          const isExpanded = segment ? getTransportationExpansionState(
            segment.fromLocation,
            segment.toLocation,
            segment.mode
          ) : false;
          
          // Only show waypoints if the node is expanded
          if (!isExpanded) return null;
          
          return waypoints.map((waypoint, waypointIndex) => (
            <WaypointMarker
              key={`${routeIndex}-${waypointIndex}-${waypoint.id || waypointIndex}`}
              waypoint={waypoint}
              index={waypointIndex}
              onDragStart={() =>
                handleWaypointDragStart(routeIndex, waypointIndex)
              }
              onDrag={(event) =>
                handleWaypointDrag(routeIndex, waypointIndex, event)
              }
              onDragEnd={(event) =>
                handleWaypointDragEnd(routeIndex, waypointIndex, event)
              }
              onRemove={() => handleWaypointRemove(routeIndex, waypointIndex)}
              isActive={
                draggingWaypoint?.routeIndex === routeIndex &&
                draggingWaypoint?.waypointIndex === waypointIndex
              }
            />
          ));
        })}
      </MapGL>
    </>
  );
}

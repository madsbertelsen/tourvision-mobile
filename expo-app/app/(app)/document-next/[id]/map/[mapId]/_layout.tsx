import { Slot, useGlobalSearchParams } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDocumentNextWebRTCContext } from '../../_layout';

// Transport mode type
type TransportMode = 'walking' | 'driving' | 'cycling';

// Route data interface
interface RouteData {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  transportMode: TransportMode;
  geometry: any; // GeoJSON LineString
  distance: number; // meters
  duration: number; // seconds
  waypoints: Array<{ lat: number; lng: number }>;
  color: string;
}

// Map location interface (from document context)
interface MapLocation {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  displayText?: string;
  colorIndex?: number;
  color?: string;
  description?: string;
  transportProfile?: TransportMode;
  transportFrom?: string;
  waypoints?: Array<{ lat: number; lng: number }>;
}

// Context for sharing map state with routes
interface MapContextType {
  mapId: string;
  locations: MapLocation[];
  routes: RouteData[];
  updateRoute: (routeId: string, updates: Partial<RouteData>, skipGeoMarkUpdate?: boolean) => Promise<void>;
  isAddingWaypoint: boolean;
  setIsAddingWaypoint: (adding: boolean) => void;
  pendingWaypoints: Array<{ lat: number; lng: number }>;
  setPendingWaypoints: React.Dispatch<React.SetStateAction<Array<{ lat: number; lng: number }>>>;
  onWaypointsChanged: () => void;
  waypointChangeVersion: number;
}

const MapContext = createContext<MapContextType | null>(null);

export function useMapContext() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within MapLayout');
  }
  return context;
}

// Define color array
const COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

export default function MapLayout() {
  const params = useGlobalSearchParams();
  const mapId = params.mapId as string;
  const { locations: docLocations, setGeoMarkUpdate } = useDocumentNextWebRTCContext();

  console.log('[MapLayout] mapId:', mapId);
  console.log('[MapLayout] docLocations from parent context:', docLocations);
  console.log('[MapLayout] docLocations length:', docLocations.length);

  // Process locations to add colors and ensure numeric coordinates
  const locations: MapLocation[] = useMemo(() => {
    const processed = docLocations.map((loc, index) => ({
      ...loc,
      geoId: loc.geoId || `loc-${index}`,
      lat: typeof loc.lat === 'string' ? parseFloat(loc.lat) : loc.lat,
      lng: typeof loc.lng === 'string' ? parseFloat(loc.lng) : loc.lng,
      colorIndex: loc.colorIndex ?? index,
      color: COLORS[(loc.colorIndex ?? index) % COLORS.length],
    }));
    console.log('[MapLayout] Processed locations:', processed);
    console.log('[MapLayout] Processed locations length:', processed.length);
    return processed;
  }, [docLocations]);

  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [pendingWaypoints, setPendingWaypoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [waypointChangeVersion, setWaypointChangeVersion] = useState(0);

  // Callback to trigger waypoint update
  const onWaypointsChanged = useCallback(() => {
    setWaypointChangeVersion(prev => prev + 1);
  }, []);

  // Fetch routes based on geo-mark transport attributes
  useEffect(() => {
    const fetchRoutes = async () => {
      console.log('[MapLayout] Fetching routes');
      console.log('[MapLayout] Total locations:', locations.length);

      if (locations.length < 2) {
        setRoutes([]);
        return;
      }

      const newRoutes: RouteData[] = [];

      // Check all locations for transportFrom relationships
      for (let i = 0; i < locations.length; i++) {
        const toLoc = locations[i];

        // Skip if no transport configuration
        if (!toLoc.transportProfile || !toLoc.transportFrom) {
          continue;
        }

        // Find the source location
        const fromLoc = locations.find(loc => loc.geoId === toLoc.transportFrom);
        if (!fromLoc) {
          console.log(`[MapLayout] Could not find source location ${toLoc.transportFrom}`);
          continue;
        }

        console.log(`[MapLayout] Found route: ${fromLoc.placeName} → ${toLoc.placeName} (${toLoc.transportProfile})`);

        try {
          const transportMode = toLoc.transportProfile;
          const profile = transportMode === 'walking' ? 'walking' :
                         transportMode === 'cycling' ? 'cycling' :
                         'driving-traffic';

          // Construct waypoints query if they exist
          let waypointsQuery = '';
          if (toLoc.waypoints && toLoc.waypoints.length > 0) {
            const waypointCoords = toLoc.waypoints
              .map(wp => `${wp.lng},${wp.lat}`)
              .join(';');
            waypointsQuery = `;${waypointCoords}`;
          }

          const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLoc.lng},${fromLoc.lat}${waypointsQuery};${toLoc.lng},${toLoc.lat}?geometries=geojson&overview=full&access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN}`;

          const response = await fetch(url);
          const data = await response.json();

          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            newRoutes.push({
              id: `route-${fromLoc.geoId}-${toLoc.geoId}`,
              fromLocationId: fromLoc.geoId,
              toLocationId: toLoc.geoId,
              transportMode,
              geometry: route.geometry,
              distance: route.distance,
              duration: route.duration,
              waypoints: toLoc.waypoints || [],
              color: toLoc.color || COLORS[1],
            });
          }
        } catch (error) {
          console.error(`Error fetching route from ${fromLoc.placeName} to ${toLoc.placeName}:`, error);
        }
      }

      setRoutes(newRoutes);
    };

    fetchRoutes();
  }, [locations]);

  // Update or create route function
  const updateRoute = useCallback(async (routeId: string, updates: Partial<RouteData>, skipGeoMarkUpdate = false) => {
    // Check if route exists
    const existingRoute = routes.find(r => r.id === routeId);

    if (existingRoute) {
      // Update existing route
      setRoutes(prev => prev.map(r =>
        r.id === routeId ? { ...r, ...updates } : r
      ));
    } else {
      // Create new route - extract location IDs from routeId
      const match = routeId.match(/route-(.+)-(.+)/);
      if (match) {
        const [_, fromId, toId] = match;
        const newRoute: RouteData = {
          id: routeId,
          fromLocationId: fromId,
          toLocationId: toId,
          transportMode: updates.transportMode || 'walking',
          geometry: updates.geometry!,
          distance: updates.distance || 0,
          duration: updates.duration || 0,
          waypoints: updates.waypoints || [],
          color: locations.find(loc => loc.geoId === toId)?.color || '#3B82F6',
        };
        setRoutes(prev => [...prev, newRoute]);
      }
    }

    // Only update geo-mark if explicitly requested (not skipped)
    if (!skipGeoMarkUpdate) {
      // Find the location that this route leads to
      const match = routeId.match(/route-(.+)-(.+)/);
      if (match && updates.transportMode) {
        const [_, fromId, toId] = match;
        const location = locations.find(loc => loc.geoId === toId);
        if (location) {
          // Update document via context
          setGeoMarkUpdate({
            geoId: location.geoId,
            updatedAttrs: {
              transportProfile: updates.transportMode,
              transportFrom: fromId,
              waypoints: updates.waypoints || null,
            }
          });
        }
      }
    }
  }, [routes, locations, setGeoMarkUpdate]);

  return (
    <MapContext.Provider value={{
      mapId,
      locations,
      routes,
      updateRoute,
      isAddingWaypoint,
      setIsAddingWaypoint,
      pendingWaypoints,
      setPendingWaypoints,
      onWaypointsChanged,
      waypointChangeVersion,
    }}>
      {/* No visual rendering - WebView handles the map */}
      {/* Just provide context and render child routes via Slot */}
      <View style={styles.container}>
        <Slot />
      </View>
    </MapContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

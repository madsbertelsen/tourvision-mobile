import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { RouteDetails } from '@/utils/transportation-api';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
  color?: string;
  photoName?: string;
}

export interface RouteWithMetadata extends RouteDetails {
  id: string; // Unique route ID (e.g., "loc-1-to-loc-2")
  fromId: string; // Origin location ID
  toId: string; // Destination location ID
  profile: 'walking' | 'driving' | 'cycling' | 'transit';
}

interface MockContextType {
  visibleLocations: Location[];
  updateVisibleLocations: (locations: Location[]) => void;
  selectedLocation: Location | null;
  setSelectedLocation: (location: Location | null) => void;
  focusedLocation: Location | null;
  setFocusedLocation: (location: Location | null) => void;
  followMode: boolean;
  setFollowMode: (enabled: boolean) => void;
  routes: RouteWithMetadata[];
  setRoutes: (routes: RouteWithMetadata[]) => void;
  selectedRoute: string | null; // Route ID
  setSelectedRoute: (routeId: string | null) => void;
}

const MockContext = createContext<MockContextType | undefined>(undefined);

export function MockProvider({ children }: { children: ReactNode }) {
  const [visibleLocations, setVisibleLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<Location | null>(null);
  const [followMode, setFollowMode] = useState<boolean>(false);
  const [routes, setRoutes] = useState<RouteWithMetadata[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  return (
    <MockContext.Provider
      value={{
        visibleLocations,
        updateVisibleLocations: setVisibleLocations,
        selectedLocation,
        setSelectedLocation,
        focusedLocation,
        setFocusedLocation,
        followMode,
        setFollowMode,
        routes,
        setRoutes,
        selectedRoute,
        setSelectedRoute
      }}
    >
      {children}
    </MockContext.Provider>
  );
}

export function useMockContext() {
  const context = useContext(MockContext);
  if (!context) {
    throw new Error('useMockContext must be used within a MockProvider');
  }
  return context;
}
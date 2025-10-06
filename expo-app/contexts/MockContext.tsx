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
  selectedLocationModal: Location | null;
  setSelectedLocationModal: (location: Location | null) => void;
  followMode: boolean;
  routes: RouteWithMetadata[];
  setRoutes: (routes: RouteWithMetadata[]) => void;
  selectedRoute: string | null; // Route ID
  setSelectedRoute: (routeId: string | null) => void;
  showItinerary: boolean;
  setShowItinerary: (show: boolean) => void;
  mapCenter: { lat: number; lng: number };
  setMapCenter: (center: { lat: number; lng: number }) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
}

const MockContext = createContext<MockContextType | undefined>(undefined);

export function MockProvider({ children }: { children: ReactNode }) {
  const [visibleLocations, setVisibleLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<Location | null>(null);
  const [selectedLocationModal, setSelectedLocationModal] = useState<Location | null>(null);
  const [followMode] = useState<boolean>(true); // Always enabled
  const [routes, setRoutes] = useState<RouteWithMetadata[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [showItinerary, setShowItinerary] = useState<boolean>(false); // Hidden by default
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const [mapZoom, setMapZoom] = useState<number>(2);

  return (
    <MockContext.Provider
      value={{
        visibleLocations,
        updateVisibleLocations: setVisibleLocations,
        selectedLocation,
        setSelectedLocation,
        focusedLocation,
        setFocusedLocation,
        selectedLocationModal,
        setSelectedLocationModal,
        followMode,
        routes,
        setRoutes,
        selectedRoute,
        setSelectedRoute,
        showItinerary,
        setShowItinerary,
        mapCenter,
        setMapCenter,
        mapZoom,
        setMapZoom
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
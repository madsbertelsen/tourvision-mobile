import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
  color?: string;
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
}

const MockContext = createContext<MockContextType | undefined>(undefined);

export function MockProvider({ children }: { children: ReactNode }) {
  const [visibleLocations, setVisibleLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<Location | null>(null);
  const [followMode, setFollowMode] = useState<boolean>(false);

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
        setFollowMode
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
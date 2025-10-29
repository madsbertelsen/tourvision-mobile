import { useGlobalSearchParams, Stack } from 'expo-router';
import React, { createContext, useContext, useState } from 'react';

// Context for sharing document state across nested routes
interface TripContextType {
  tripId: string;
  currentDoc: any;
  setCurrentDoc: (doc: any) => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
  locations: Array<{
    geoId: string;
    placeName: string;
    lat: number;
    lng: number;
  }>;
  setLocations: (locations: any[]) => void;
}

const TripContext = createContext<TripContextType | null>(null);

export function useTripContext() {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTripContext must be used within TripLayout');
  }
  return context;
}

export default function TripLayout() {
  const params = useGlobalSearchParams();
  const tripId = params.id as string;

  const [currentDoc, setCurrentDoc] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false); // Start in read mode
  const [locations, setLocations] = useState<any[]>([]);

  return (
    <TripContext.Provider
      value={{
        tripId,
        currentDoc,
        setCurrentDoc,
        isEditMode,
        setIsEditMode,
        locations,
        setLocations,
      }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </TripContext.Provider>
  );
}

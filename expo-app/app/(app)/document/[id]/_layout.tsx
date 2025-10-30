import { useGlobalSearchParams, Stack } from 'expo-router';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

  // Location modal state
  locationModal: {
    visible: boolean;
    step: 'location' | 'transport';
    locationSearchResults: any[];
    selectedResultIndex: number;
    isLoadingLocation: boolean;
    selectedLocation: { placeName: string; lat: number; lng: number } | null;
    selectionRange: { from: number; to: number } | null;
    transportConfig: {
      from: { lat: number; lng: number; name: string } | null;
      mode: 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';
      routeGeometry: any | null;
      routeDistance: number | null;
      routeDuration: number | null;
      waypoints: Array<{ lat: number; lng: number }>;
    };
    isLoadingRoute: boolean;
  };
  setLocationModal: (state: Partial<TripContextType['locationModal']>) => void;
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

  const [currentDoc, setCurrentDocState] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false); // Start in read mode
  const [locations, setLocations] = useState<any[]>([]);

  // Location modal state
  const [locationModal, setLocationModalState] = useState<TripContextType['locationModal']>({
    visible: false,
    step: 'location',
    locationSearchResults: [],
    selectedResultIndex: 0,
    isLoadingLocation: false,
    selectedLocation: null,
    selectionRange: null,
    transportConfig: {
      from: null,
      mode: 'walking',
      routeGeometry: null,
      routeDistance: null,
      routeDuration: null,
      waypoints: [],
    },
    isLoadingRoute: false,
  });

  // Helper to update location modal state
  const setLocationModal = useCallback((updates: Partial<TripContextType['locationModal']>) => {
    setLocationModalState(prev => ({ ...prev, ...updates }));
  }, []);

  // Load document from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('@tourvision_documents');
      if (stored) {
        const documents = JSON.parse(stored);
        // Find document by ID
        const doc = documents.find((d: any) => d.id === tripId);
        if (doc && doc.content) {
          console.log('[TripLayout] Loading document from localStorage:', tripId);
          setCurrentDocState(doc.content);
        }
      }
    } catch (error) {
      console.error('[TripLayout] Error loading from localStorage:', error);
    }
  }, [tripId]);

  // Custom setCurrentDoc that also saves to localStorage
  const setCurrentDoc = useCallback((doc: any) => {
    setCurrentDocState(doc);

    // Save to localStorage
    try {
      const stored = localStorage.getItem('@tourvision_documents');
      let documents = stored ? JSON.parse(stored) : [];

      // Find and update existing document or create new one
      const existingIndex = documents.findIndex((d: any) => d.id === tripId);

      if (existingIndex >= 0) {
        // Update existing document's content
        documents[existingIndex].content = doc;
        documents[existingIndex].updatedAt = Date.now();
      } else {
        // Create new document entry
        documents.push({
          id: tripId,
          title: 'Document',
          description: '',
          content: doc,
          messages: [],
          locations: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      localStorage.setItem('@tourvision_documents', JSON.stringify(documents));
      console.log('[TripLayout] Saved document to localStorage:', tripId);
    } catch (error) {
      console.error('[TripLayout] Error saving to localStorage:', error);
    }
  }, [tripId]);

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
        locationModal,
        setLocationModal,
      }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </TripContext.Provider>
  );
}

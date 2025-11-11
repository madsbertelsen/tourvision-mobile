import { useGlobalSearchParams, Stack } from 'expo-router';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { storage } from '@/utils/storage';

// Transport mode type
type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

// Geo-mark data type
interface GeoMarkData {
  placeName: string;
  lat: number;
  lng: number;
  transportMode?: TransportMode;
  transportFrom?: string;
  waypoints?: Array<{ lat: number; lng: number }>;
}

// Geo-mark update type
interface GeoMarkUpdate {
  geoId: string;
  updatedAttrs: Partial<{
    placeName: string;
    lat: number;
    lng: number;
    transportFrom: string | null;
    transportProfile: TransportMode | null;
    waypoints: Array<{ lat: number; lng: number }> | null;
  }>;
}

// Location flow state for route-based navigation
interface LocationFlowState {
  active: boolean;
  geoId: string; // Generated upfront when flow starts
  selectedText: string;
  selectionFrom: number;
  selectionTo: number;
  searchQuery: string;
  searchResults: any[];
  selectedLocation: { placeName: string; lat: number; lng: number } | null;
  transportMode: TransportMode | null;
  transportOriginGeoId: string | null;
  result: GeoMarkData | null;
}

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

  // Location modal state (legacy - keeping for backward compat)
  locationModal: {
    visible: boolean;
    step: 'location' | 'transport';
    locationSearchResults: any[];
    selectedResultIndex: number;
    isLoadingLocation: boolean;
    selectedLocation: { placeName: string; lat: number; lng: number } | null;
    selectionRange: { from: number; to: number } | null;
    selectionTop?: number;
    transportConfig: {
      from: { lat: number; lng: number; name: string } | null;
      mode: TransportMode;
      routeGeometry: any | null;
      routeDistance: number | null;
      routeDuration: number | null;
      waypoints: Array<{ lat: number; lng: number }>;
    };
    isLoadingRoute: boolean;
  };
  setLocationModal: (state: Partial<TripContextType['locationModal']>) => void;

  // Location flow state (new route-based approach)
  locationFlowState: LocationFlowState;
  startLocationFlow: (selectedText: string, from: number, to: number) => void;
  updateLocationFlow: (updates: Partial<LocationFlowState>) => void;
  setLocationFlowResult: (data: GeoMarkData) => void;
  clearLocationFlow: () => void;

  // Geo-mark update state
  geoMarkUpdate: GeoMarkUpdate | null;
  setGeoMarkUpdate: (update: GeoMarkUpdate | null) => void;
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

  // Ref to store the latest document for debounced saving
  const latestDocRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Location modal state
  const [locationModal, setLocationModalState] = useState<TripContextType['locationModal']>({
    visible: false,
    step: 'location',
    locationSearchResults: [],
    selectedResultIndex: 0,
    isLoadingLocation: false,
    selectedLocation: null,
    selectionRange: null,
    selectionTop: 200,
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

  // Location flow state (new route-based approach)
  const [locationFlowState, setLocationFlowState] = useState<LocationFlowState>({
    active: false,
    geoId: '',
    selectedText: '',
    selectionFrom: 0,
    selectionTo: 0,
    searchQuery: '',
    searchResults: [],
    selectedLocation: null,
    transportMode: null,
    transportOriginGeoId: null,
    result: null,
  });

  // Geo-mark update state
  const [geoMarkUpdate, setGeoMarkUpdate] = useState<GeoMarkUpdate | null>(null);

  // Start location flow
  const startLocationFlow = useCallback((selectedText: string, from: number, to: number) => {
    // Generate geoId upfront when starting the flow
    const geoId = `loc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    setLocationFlowState({
      active: true,
      geoId,
      selectedText,
      selectionFrom: from,
      selectionTo: to,
      searchQuery: selectedText,
      searchResults: [],
      selectedLocation: null,
      transportMode: 'walking',
      transportOriginGeoId: null,
      result: null,
    });

    return geoId; // Return the generated geoId
  }, []);

  // Update location flow state
  const updateLocationFlow = useCallback((updates: Partial<LocationFlowState>) => {
    setLocationFlowState(prev => ({ ...prev, ...updates }));
  }, []);

  // Set final result
  const setLocationFlowResult = useCallback((data: GeoMarkData) => {
    setLocationFlowState(prev => ({ ...prev, result: data }));
  }, []);

  // Clear location flow
  const clearLocationFlow = useCallback(() => {
    setLocationFlowState({
      active: false,
      geoId: '',
      selectedText: '',
      selectionFrom: 0,
      selectionTo: 0,
      searchQuery: '',
      searchResults: [],
      selectedLocation: null,
      transportMode: null,
      transportOriginGeoId: null,
      result: null,
    });
  }, []);

  // Load document from storage on mount
  useEffect(() => {
    const loadDocument = async () => {
      // Clear any pending save timeout when changing documents
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      try {
        const stored = await storage.getItem('@tourvision_documents');
        if (stored) {
          const documents = JSON.parse(stored);
          // Find document by ID
          const doc = documents.find((d: any) => d.id === tripId);
          if (doc) {
            console.log('Loading document from storage:', tripId, 'content:', JSON.stringify(doc.content).substring(0, 100));
            setCurrentDocState(doc.content);
            latestDocRef.current = doc.content;
          } else {
            // Document not found - clear to empty state
            console.log('Document not found:', tripId, 'setting empty state');
            setCurrentDocState(null);
            latestDocRef.current = null;
          }
        } else {
          // No documents in storage - clear to empty state
          console.log('No documents in storage, setting empty state');
          setCurrentDocState(null);
          latestDocRef.current = null;
        }
      } catch (error) {
        console.error('Error loading from storage:', error);
        setCurrentDocState(null);
        latestDocRef.current = null;
      }
    };

    loadDocument();
  }, [tripId]);

  // Function to save document to storage
  const saveToStorage = useCallback(async (doc: any) => {
    try {
      const stored = await storage.getItem('@tourvision_documents');
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

      await storage.setItem('@tourvision_documents', JSON.stringify(documents));
      console.log('Saved document to storage:', tripId);
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }, [tripId]);

  // Custom setCurrentDoc that also saves to storage (debounced)
  const setCurrentDoc = useCallback((doc: any) => {
    // Check if document actually changed (avoid unnecessary updates)
    if (latestDocRef.current === doc) {
      return;
    }

    // Update state immediately
    setCurrentDocState(doc);

    // Store latest document in ref
    latestDocRef.current = doc;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule save after 1 second of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      if (latestDocRef.current) {
        saveToStorage(latestDocRef.current);
      }
    }, 1000);
  }, [saveToStorage]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Save immediately on unmount if there's pending changes
        if (latestDocRef.current) {
          saveToStorage(latestDocRef.current);
        }
      }
    };
  }, [saveToStorage]);

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
        locationFlowState,
        startLocationFlow,
        updateLocationFlow,
        setLocationFlowResult,
        clearLocationFlow,
        geoMarkUpdate,
        setGeoMarkUpdate,
      }}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="geo-edit"
          options={({ route }) => ({
            presentation: 'modal',
            headerShown: true,
            headerTitle: (route.params as any)?.selectedText || '',
          })}
        />
        <Stack.Screen
          name="geo-search/[geoId]"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="geo-transport/[geoId]"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="options"
          options={{
            presentation: 'formSheet',
            headerShown: false,
          }}
        />
      </Stack>
    </TripContext.Provider>
  );
}

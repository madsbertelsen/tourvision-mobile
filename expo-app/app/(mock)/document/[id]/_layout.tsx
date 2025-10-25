import { getTrip, saveTrip, type SavedTrip } from '@/utils/documents-storage';
import { useRouter, useLocalSearchParams, useGlobalSearchParams, useFocusEffect, Stack } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react';

// Context for sharing document state across nested routes
interface TripContextType {
  tripId: string;
  currentTrip: SavedDocument | null;
  setCurrentTrip: (document: SavedDocument | null) => void;
  currentDoc: any;
  setCurrentDoc: (doc: any) => void;
  yjsState: string | null;
  setYjsState: (state: string | null) => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
  selectionEmpty: boolean;
  setSelectionEmpty: (empty: boolean) => void;
  geoMarkDataToCreate: any;
  setGeoMarkDataToCreate: (data: any) => void;
  handleDocumentChange: (doc: any) => void;
  handleShowGeoMarkEditor: (data: any, locations: any[]) => void;
  documentRef: React.MutableRefObject<any>;
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
  const router = useRouter();
  const params = useGlobalSearchParams();
  const tripId = params.id as string;

  // Verbose rendering logging removed - component renders frequently

  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [currentDoc, setCurrentDoc] = useState<any>(null);
  const [yjsState, setYjsState] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(true);
  const [selectionEmpty, setSelectionEmpty] = useState(true);
  const [geoMarkDataToCreate, setGeoMarkDataToCreate] = useState<any>(null);
  const documentRef = useRef<any>(null);
  const lastProcessedLocationRef = useRef<string | null>(null);
  const lastLoadedTripIdRef = useRef<string | null>(null);

  // Update when tripId from params changes (testing useGlobalSearchParams)
  useEffect(() => {
    console.log('[TripLayout] tripId from params changed to:', tripId);
    console.log('[TripLayout] useEffect triggered - this proves params updated!');
    // Reset state when document changes
    setCurrentTrip(null);
    setCurrentDoc(null);
    setYjsState(null);
    lastLoadedTripIdRef.current = null; // Force reload
  }, [tripId]);

  // Listen for location data returned from create-location modal
  useFocusEffect(
    useCallback(() => {
      if (params.savedLocation) {
        const locationStr = typeof params.savedLocation === 'string'
          ? params.savedLocation
          : JSON.stringify(params.savedLocation);

        if (lastProcessedLocationRef.current === locationStr) {
          console.log('[TripLayout] Already processed this location, skipping');
          return;
        }

        try {
          const locationData = typeof params.savedLocation === 'string'
            ? JSON.parse(params.savedLocation)
            : params.savedLocation;

          console.log('[TripLayout] Received location data from modal:', locationData);
          lastProcessedLocationRef.current = locationStr;

          // Set the data to create - this will be picked up by the WebView
          setGeoMarkDataToCreate(locationData);

          // Clear the params immediately to avoid re-processing
          router.setParams({ savedLocation: undefined });

          // Clear the data after a longer timeout to ensure component has processed it
          setTimeout(() => {
            console.log('[TripLayout] Clearing geoMarkDataToCreate');
            setGeoMarkDataToCreate(null);
          }, 1000);
        } catch (error) {
          console.error('[TripLayout] Failed to parse saved location:', error);
        }
      }
    }, [params.savedLocation, router])
  );

  // Load document data whenever tripId changes
  useEffect(() => {
    if (!tripId) return;

    const loadTripData = async () => {
      try {
        console.log('[TripLayout] Loading document data for tripId:', tripId, 'prev:', lastLoadedTripIdRef.current);

        // Skip if we already loaded this trip
        if (lastLoadedTripIdRef.current === tripId && currentTrip?.id === tripId) {
          console.log('[TripLayout] Trip already loaded, skipping');
          return;
        }

        lastLoadedTripIdRef.current = tripId;

        const document = await getDocument(tripId);

        if (!trip) {
          console.error('[TripLayout] Trip not found:', tripId);
          // Reset state when document not found
          setCurrentTrip(null);
          setCurrentDoc(null);
          return;
        }

        console.log('[TripLayout] Trip loaded:', trip.title, 'Y.js state exists:', !!trip.yjsState);
        setCurrentTrip(trip);

        // Load Y.js state from document (preferred)
        if (trip.yjsState) {
          console.log('[TripLayout] Loading Y.js state from document:', tripId);
          console.log('[TripLayout] Y.js state length:', trip.yjsState.length);
          setYjsState(trip.yjsState);
        } else {
          console.log('[TripLayout] No Y.js state found for document:', tripId);
          setYjsState(null);
        }

        // Load document from document (deprecated, for backward compatibility)
        if (trip.document) {
          console.log('[TripLayout] Loading document from document:', tripId);
          console.log('[TripLayout] Document content length:', JSON.stringify(trip.document).length);
          console.log('[TripLayout] Document preview:', JSON.stringify(trip.document).substring(0, 200));
          setCurrentDoc(trip.document);
        } else {
          console.log('[TripLayout] No document found for document:', tripId, '- creating blank');
          const blankDoc = {
            type: 'doc',
            content: [
              { type: 'paragraph', attrs: { id: `node-${Date.now()}` }, content: [] }
            ]
          };
          setCurrentDoc(blankDoc);
        }
      } catch (error) {
        console.error('[TripLayout] Error loading document:', error);
      }
    };

    loadTripData();
  }, [tripId]);

  const handleDocumentChange = useCallback(
    async (doc: any) => {
      // Verbose logging removed - document changes frequently
      setCurrentDoc(doc);

      if (!currentTrip) {
        console.error('[TripLayout] No currentTrip, cannot save');
        return;
      }

      const updatedTrip = {
        ...currentTrip,
        document: doc,
        updatedAt: Date.now(),
      };

      await saveDocument(updatedTrip);
      setCurrentTrip(updatedTrip);
    },
    [currentTrip]
  );

  const handleShowGeoMarkEditor = useCallback((data: any, locations: any[]) => {
    console.log('[TripLayout] Opening geo-mark editor with data:', data);

    router.push({
      pathname: '/(mock)/create-location',
      params: {
        tripId: tripId,
        placeName: data?.placeName || '',
        lat: data?.lat || '',
        lng: data?.lng || '',
      },
    });
  }, [router, tripId]);

  // Global handler for Y.js state saves from WebView
  useEffect(() => {
    (global as any).handleSaveYjsState = async (state: string) => {
      console.log('[TripLayout] Saving Y.js state to AsyncStorage (from WebView)');

      setYjsState(state);

      if (!currentTrip) {
        console.error('[TripLayout] No currentTrip, cannot save Y.js state');
        return;
      }

      const updatedTrip = {
        ...currentTrip,
        yjsState: state,
        updatedAt: Date.now(),
      };

      await saveDocument(updatedTrip);
      setCurrentTrip(updatedTrip);
      console.log('[TripLayout] Y.js state saved to local storage');
    };

    return () => {
      delete (global as any).handleSaveYjsState;
    };
  }, [currentTrip]);

  const contextValue: TripContextType = {
    tripId,
    currentTrip,
    setCurrentTrip,
    currentDoc,
    setCurrentDoc,
    yjsState,
    setYjsState,
    isEditMode,
    setIsEditMode,
    selectionEmpty,
    setSelectionEmpty,
    geoMarkDataToCreate,
    setGeoMarkDataToCreate,
    handleDocumentChange,
    handleShowGeoMarkEditor,
    documentRef,
  };

  return (
    <TripContext.Provider value={contextValue}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#ffffff' },
        }}
      />
    </TripContext.Provider>
  );
}

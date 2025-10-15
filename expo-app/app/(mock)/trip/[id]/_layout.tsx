import { getTrip, saveTrip, type SavedTrip } from '@/utils/trips-storage';
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react';

// Context for sharing trip state across nested routes
interface TripContextType {
  tripId: string;
  currentTrip: SavedTrip | null;
  setCurrentTrip: (trip: SavedTrip | null) => void;
  currentDoc: any;
  setCurrentDoc: (doc: any) => void;
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
  const params = useLocalSearchParams();
  const tripId = params.id as string;

  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [currentDoc, setCurrentDoc] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectionEmpty, setSelectionEmpty] = useState(true);
  const [geoMarkDataToCreate, setGeoMarkDataToCreate] = useState<any>(null);
  const documentRef = useRef<any>(null);
  const lastProcessedLocationRef = useRef<string | null>(null);

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

  // Load trip data on mount
  useEffect(() => {
    const loadTripData = async () => {
      try {
        const trip = await getTrip(tripId);

        if (!trip) {
          console.error('Trip not found:', tripId);
          return;
        }

        setCurrentTrip(trip);

        // Load document from trip
        if (trip.document) {
          console.log('[TripLayout] Loading document from trip');
          console.log('[TripLayout] Loaded document structure:', JSON.stringify(trip.document));
          setCurrentDoc(trip.document);
        } else {
          console.log('[TripLayout] No document found, creating blank');
          const blankDoc = {
            type: 'doc',
            content: [
              { type: 'paragraph', attrs: { id: `node-${Date.now()}` }, content: [] }
            ]
          };
          setCurrentDoc(blankDoc);
        }
      } catch (error) {
        console.error('Error loading trip:', error);
      }
    };

    loadTripData();
  }, [tripId]);

  const handleDocumentChange = useCallback(
    async (doc: any) => {
      console.log('[TripLayout] Document changed, saving...');
      console.log('[TripLayout] Document structure:', JSON.stringify(doc));
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

      await saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
      console.log('[TripLayout] Document saved to local storage');
      console.log('[TripLayout] Saved document structure:', JSON.stringify(doc));
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

  const contextValue: TripContextType = {
    tripId,
    currentTrip,
    setCurrentTrip,
    currentDoc,
    setCurrentDoc,
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

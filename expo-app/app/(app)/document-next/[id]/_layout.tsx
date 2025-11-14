import { useGlobalSearchParams, Stack } from 'expo-router';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { storage } from '@/utils/storage';
import { extractLocationsFromDoc } from '@/utils/extract-locations-from-doc';

// Transport mode type
type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

// Geo-mark data type
interface GeoMarkData {
  geoId?: string;
  placeName: string;
  lat: number;
  lng: number;
  displayText?: string;
  colorIndex?: number;
  description?: string;
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

// Context for sharing document state across nested routes
interface DocumentNextContextType {
  documentId: string;
  currentDoc: any;
  setCurrentDoc: (doc: any) => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
  locations: GeoMarkData[];
  setLocations: (locations: GeoMarkData[]) => void;

  // Geo-mark update state
  geoMarkUpdate: GeoMarkUpdate | null;
  setGeoMarkUpdate: (update: GeoMarkUpdate | null) => void;
}

const DocumentNextContext = createContext<DocumentNextContextType | null>(null);

export function useDocumentNextContext() {
  const context = useContext(DocumentNextContext);
  if (!context) {
    throw new Error('useDocumentNextContext must be used within DocumentNextLayout');
  }
  return context;
}

export default function DocumentNextLayout() {
  const params = useGlobalSearchParams();
  const documentId = params.id as string;

  const [currentDoc, setCurrentDocState] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [locations, setLocations] = useState<GeoMarkData[]>([]);

  // Ref to store the latest document for debounced saving
  const latestDocRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Geo-mark update state
  const [geoMarkUpdate, setGeoMarkUpdateState] = useState<GeoMarkUpdate | null>(null);

  // Wrapper to log when geoMarkUpdate changes
  const setGeoMarkUpdate = useCallback((update: GeoMarkUpdate | null) => {
    console.log('[DocumentNextContext] setGeoMarkUpdate called with:', update);
    setGeoMarkUpdateState(update);
    console.log('[DocumentNextContext] State updated to:', update);
  }, []);

  // Load document from storage on mount
  useEffect(() => {
    // Clear any pending save timeout when changing documents
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // For agent editor, document loads from external source
    console.log('[DocumentNextLayout] Document will be loaded from agent editor');
    setCurrentDocState(null);
    latestDocRef.current = null;
  }, [documentId]);

  // Function to save document to storage
  const saveToStorage = useCallback(async (doc: any) => {
    try {
      const stored = await storage.getItem('@tourvision_documents');
      let documents = stored ? JSON.parse(stored) : [];

      // Find and update existing document or create new one
      const existingIndex = documents.findIndex((d: any) => d.id === documentId);

      if (existingIndex >= 0) {
        // Update existing document's content
        documents[existingIndex].content = doc;
        documents[existingIndex].updatedAt = Date.now();
      } else {
        // Create new document entry
        documents.push({
          id: documentId,
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
      console.log('Saved document to storage:', documentId);
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }, [documentId]);

  // Custom setCurrentDoc with debounced saving
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

    // Set new timeout for debounced save (1 second)
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

  // Automatically extract locations when document changes
  useEffect(() => {
    if (currentDoc) {
      console.log('[DocumentNextLayout] Extracting locations from document');
      const extractedLocations = extractLocationsFromDoc(currentDoc);
      console.log(`[DocumentNextLayout] Extracted ${extractedLocations.length} locations:`, extractedLocations);
      setLocations(extractedLocations);
    }
  }, [currentDoc]);

  return (
    <DocumentNextContext.Provider
      value={{
        documentId,
        currentDoc,
        setCurrentDoc,
        isEditMode,
        setIsEditMode,
        locations,
        setLocations,
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
          name="options"
          options={{
            presentation: 'formSheet',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="map"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </DocumentNextContext.Provider>
  );
}
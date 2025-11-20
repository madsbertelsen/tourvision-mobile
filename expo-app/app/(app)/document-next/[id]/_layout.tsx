import { extractLocationsFromDoc } from '@/utils/extract-locations-from-doc';
import { storage } from '@/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetHandle, BottomSheetHandleProps } from '@gorhom/bottom-sheet';
import { Slot, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DocumentNextWebRTCScreen from './index';

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

// Sheet header info interface
interface SheetHeaderInfo {
  title: string;
  colorDot?: string;
  onBack?: () => void;
}

// Context for sharing document state across nested routes
interface DocumentNextWebRTCContextType {
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

  // Bottom sheet state
  bottomSheetRef: React.RefObject<BottomSheet>;
  sheetHeaderInfo: SheetHeaderInfo | null;
  setSheetHeaderInfo: (info: SheetHeaderInfo | null) => void;
}

const DocumentNextWebRTCContext = createContext<DocumentNextWebRTCContextType | null>(null);

export function useDocumentNextWebRTCContext() {
  const context = useContext(DocumentNextWebRTCContext);
  if (!context) {
    throw new Error('useDocumentNextWebRTCContext must be used within DocumentNextWebRTCLayout');
  }
  return context;
}

export default function DocumentNextWebRTCLayout() {
  const params = useGlobalSearchParams();
  const router = useRouter();
  const segments = useSegments();
  const documentId = params.id as string;

  const [currentDoc, setCurrentDocState] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [locations, setLocations] = useState<GeoMarkData[]>([]);

  // Ref to store the latest document for debounced saving
  const latestDocRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Bottom sheet refs and state
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [sheetHeaderInfo, setSheetHeaderInfo] = useState<SheetHeaderInfo | null>(null);

  // Geo-mark update state
  const [geoMarkUpdate, setGeoMarkUpdateState] = useState<GeoMarkUpdate | null>(null);

  // Wrapper to log when geoMarkUpdate changes
  const setGeoMarkUpdate = useCallback((update: GeoMarkUpdate | null) => {
    console.log('[DocumentNextWebRTCContext] setGeoMarkUpdate called with:', update);
    setGeoMarkUpdateState(update);
    console.log('[DocumentNextWebRTCContext] State updated to:', update);
  }, []);

  // Load document from storage on mount
  useEffect(() => {
    // Clear any pending save timeout when changing documents
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // For WebRTC editor, document loads from external source
    console.log('[DocumentNextWebRTCLayout] Document will be loaded from WebRTC editor');
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
      console.log('[DocumentNextWebRTCLayout] Saved document to storage:', documentId);
    } catch (error) {
      console.error('[DocumentNextWebRTCLayout] Error saving to storage:', error);
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
      console.log('[DocumentNextWebRTCLayout] Extracting locations from document');
      const extractedLocations = extractLocationsFromDoc(currentDoc);
      console.log(`[DocumentNextWebRTCLayout] Extracted ${extractedLocations.length} locations:`, extractedLocations);
      setLocations(extractedLocations);
    }
  }, [currentDoc]);

  // Auto-open bottom sheet when on location/edit routes
  useEffect(() => {
    const lastSegment = segments[segments.length - 1];

    if (lastSegment === 'location' || lastSegment === 'edit') {
      // Open bottom sheet to 50%
      bottomSheetRef.current?.snapToIndex(0);
    } else if (lastSegment === 'index') {
      // Close bottom sheet on index route
      bottomSheetRef.current?.close();
    }
  }, [segments]);

  // Snap points for bottom sheet
  const snapPoints = useMemo(() => ['50%', '90%'], []);

  // Custom handle component with header
  const CustomHandle = useCallback((props: BottomSheetHandleProps) => (
    <View>
      <BottomSheetHandle {...props} />
      {sheetHeaderInfo && (
        <View style={styles.sheetHeader}>
          {sheetHeaderInfo.onBack && (
            <TouchableOpacity onPress={sheetHeaderInfo.onBack} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
          {sheetHeaderInfo.colorDot && (
            <View style={[
              styles.headerColorDot,
              { backgroundColor: sheetHeaderInfo.colorDot }
            ]} />
          )}
          <Text style={styles.sheetHeaderTitle}>{sheetHeaderInfo.title}</Text>
        </View>
      )}
    </View>
  ), [sheetHeaderInfo]);

  // Check if we're on a bottom sheet route (location or edit)
  const lastSegment = segments[segments.length - 1];
  const isBottomSheetRoute = lastSegment === 'location' || lastSegment === 'edit' ||
                             segments.includes('location') || segments.includes('edit');

  return (
    <GestureHandlerRootView style={styles.container}>
      <DocumentNextWebRTCContext.Provider
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
          bottomSheetRef,
          sheetHeaderInfo,
          setSheetHeaderInfo,
        }}
      >
        <View style={styles.container}>
          {/* Main editor - always visible as background */}
          <DocumentNextWebRTCScreen />

          {/* Bottom sheet for location details/edit - overlays the editor */}
          {/* Always render BottomSheet so it's mounted and ready */}
          <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={snapPoints}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            onClose={() => {
              // When bottom sheet closes, navigate back to index
              router.replace(`/document-next/${documentId}`);
            }}
            backgroundStyle={styles.bottomSheetBackground}
            handleIndicatorStyle={styles.bottomSheetIndicator}
            handleComponent={CustomHandle}
            style={styles.bottomSheetShadow}
          >
            {/* Always render nested routes */}
            <Slot />
          </BottomSheet>
        </View>
      </DocumentNextWebRTCContext.Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bottomSheetBackground: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomSheetIndicator: {
    backgroundColor: '#D1D5DB',
    width: 36,
    height: 4,
  },
  bottomSheetShadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  backButton: {
    marginRight: 12,
  },
  headerColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  sheetHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
});

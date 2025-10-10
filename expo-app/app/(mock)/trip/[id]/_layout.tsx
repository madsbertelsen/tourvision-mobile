import { MapViewSimpleWrapper } from '@/components/MapViewSimpleWrapper';
import { ProseMirrorToolbar } from '@/components/ProseMirrorToolbar';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { htmlToProsemirror } from '@/utils/prosemirror-html';
import { schema } from '@/utils/prosemirror-schema';
import { stateFromJSON } from '@/utils/prosemirror-transactions';
import { fetchRouteWithCache } from '@/utils/transportation-api';
import { getTrip, saveTrip, type SavedTrip } from '@/utils/trips-storage';
import { useChat } from '@ai-sdk/react';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { DefaultChatTransport } from 'ai';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { fetch as expoFetch } from 'expo/fetch';
import { EditorState } from 'prosemirror-state';
import React, { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Context for sharing trip state across nested routes
interface TripContextType {
  tripId: string;
  currentTrip: SavedTrip | null;
  setCurrentTrip: (trip: SavedTrip | null) => void;
  editorState: EditorState;
  setEditorState: (state: EditorState) => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;
  focusedLocation: { id: string; name: string; lat: number; lng: number } | null;
  setFocusedLocation: (loc: { id: string; name: string; lat: number; lng: number } | null) => void;
  handleNodeFocus: (nodeId: string | null) => void;
  handleDocumentChange: (newDoc: any) => Promise<void>;
  handleShowGeoMarkEditor: (data: any, locations: any[]) => void;
  handleToolbarCommand: (command: string, params?: any) => void;
  handleSelectionChange: (empty: boolean) => void;
  documentRef: React.MutableRefObject<any>;
  bottomSheetRef: React.MutableRefObject<BottomSheet | null>;
  documentLocations: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    description?: string;
    colorIndex?: number;
    photoName?: string;
  }>;
  fetchedRoutes: any[];
  handleRouteWaypointUpdate: (routeId: string, waypoint: { lat: number; lng: number }, segmentIndex: number) => void;
  handleRouteWaypointRemove: (routeId: string, waypointIndex: number) => void;
  chatHelpers: ReturnType<typeof useChat>;
  geoMarkDataToCreate: any;
  setGeoMarkDataToCreate: (data: any) => void;
  selectionEmpty: boolean;
  sheetHeight: number;
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
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const tripId = params.id as string;
  const initialMessage = params.initialMessage as string | undefined;
  const insets = useSafeAreaInsets();

  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<{ id: string; name: string; lat: number; lng: number } | null>(null);
  const [editorState, setEditorState] = useState<EditorState>(() =>
    EditorState.create({ schema })
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const initialMessageSentRef = useRef(false);
  const lastProcessedMessageIdRef = useRef<string | null>(null);
  const wasInEditModeRef = useRef(false);
  const [fetchedRoutes, setFetchedRoutes] = useState<any[]>([]);
  const pendingWaypointUpdateRef = useRef<string | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const documentRef = useRef<any>(null);
  const [selectionEmpty, setSelectionEmpty] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const snapPoints = useMemo(() => ['15%', '50%', '90%', '100%'], []);
  const [mapDimensions, setMapDimensions] = useState<{ width: number; height: number } | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [geoMarkDataToCreate, setGeoMarkDataToCreate] = useState<any>(null);

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

          setGeoMarkDataToCreate(locationData);

          router.setParams({ savedLocation: undefined });

          setTimeout(() => {
            setGeoMarkDataToCreate(null);
          }, 100);
        } catch (error) {
          console.error('[TripLayout] Failed to parse saved location:', error);
        }
      }
    }, [params.savedLocation, router])
  );

  // API URL for chat
  const apiUrl = generateAPIUrl('/api/chat-simple');

  // Initialize chat
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      api: apiUrl,
    }),
    onError: (error) => {
      console.error('Chat error:', error);
    },
    id: tripId,
  });

  const {
    messages = [],
    setMessages,
    sendMessage,
    status = 'idle',
  } = chatHelpers;

  const isChatLoading = status === 'submitted';

  // Handle edit mode changes
  useEffect(() => {
    if (isEditMode && !wasInEditModeRef.current) {
      console.log('[TripLayout] Entering edit mode, expanding sheet to 100%');
      wasInEditModeRef.current = true;
      if (bottomSheetRef.current) {
        bottomSheetRef.current.snapToIndex(3);
      }
    } else if (!isEditMode && wasInEditModeRef.current) {
      console.log('[TripLayout] Exiting edit mode, restoring sheet to 50%');
      wasInEditModeRef.current = false;
      if (bottomSheetRef.current) {
        bottomSheetRef.current.snapToIndex(1);
      }
    }
  }, [isEditMode]);

  // Keyboard listeners
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        console.log('[TripLayout] Keyboard height:', e.endCoordinates.height);
        setKeyboardHeight(e.endCoordinates.height);

        if (bottomSheetRef.current) {
          console.log('[TripLayout] Expanding sheet to 100% due to keyboard');
          bottomSheetRef.current.snapToIndex(3);
        }
      }
    );

    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);

        if (bottomSheetRef.current && !isEditMode) {
          console.log('[TripLayout] Restoring sheet to 50% after keyboard hide');
          bottomSheetRef.current.snapToIndex(1);
        }
      }
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [isEditMode]);

  // Load trip data
  useEffect(() => {
    const loadTripData = async () => {
      try {
        setIsLoadingTrip(true);
        const trip = await getTrip(tripId);

        if (!trip) {
          console.error('Trip not found:', tripId);
          return;
        }

        setCurrentTrip(trip);

        if (trip.messages && trip.messages.length > 0) {
          setMessages(trip.messages);
        }

        if (trip.itineraries && trip.itineraries.length > 0) {
          console.log('[TripLayout] Loading document from itineraries, count:', trip.itineraries.length);
          const latestItinerary = trip.itineraries[trip.itineraries.length - 1];
          if (latestItinerary.document) {
            const state = stateFromJSON(latestItinerary.document);
            setEditorState(state);
            console.log('[TripLayout] EditorState loaded from itinerary');
          }
        } else {
          console.log('[TripLayout] No itineraries found, creating blank document');

          const blankDocument = {
            type: 'doc',
            content: [
              { type: 'paragraph', attrs: { id: `node-${Date.now()}` }, content: [] }
            ]
          };

          const blankItinerary = {
            messageId: 'manual',
            document: blankDocument,
            createdAt: Date.now(),
          };

          const updatedTrip = {
            ...trip,
            itineraries: [blankItinerary],
          };

          await saveTrip(updatedTrip);
          setCurrentTrip(updatedTrip);

          const state = stateFromJSON(blankDocument);
          setEditorState(state);
          console.log('[TripLayout] Blank itinerary created and loaded');
        }
      } catch (error) {
        console.error('Error loading trip:', error);
      } finally {
        setIsLoadingTrip(false);
      }
    };

    loadTripData();
  }, [tripId]);

  // Save messages to trip
  useEffect(() => {
    const saveMessages = async () => {
      if (!currentTrip || messages.length === 0) return;

      const updatedTrip = {
        ...currentTrip,
        messages: messages,
        updatedAt: Date.now(),
      };

      await saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
    };

    saveMessages();
  }, [messages]);

  // Sync editor state with itineraries
  useEffect(() => {
    if (!currentTrip?.itineraries || currentTrip.itineraries.length === 0) {
      return;
    }

    const latestItinerary = currentTrip.itineraries[currentTrip.itineraries.length - 1];
    if (!latestItinerary.document) {
      return;
    }

    const newState = stateFromJSON(latestItinerary.document);
    setEditorState(newState);
  }, [currentTrip?.itineraries?.length, currentTrip]);

  // Parse and save itinerary from messages
  useEffect(() => {
    const parseItinerary = async () => {
      if (!currentTrip || messages.length === 0) {
        return;
      }

      if (isChatLoading) {
        return;
      }

      const lastAssistantMessage = messages.findLast((msg: any) => msg.role === 'assistant');
      if (!lastAssistantMessage) {
        return;
      }

      const textParts = lastAssistantMessage.parts?.filter((part: any) => part.type === 'text') || [];
      const textContent = textParts.map((part: any) => part.text).join('');

      if (!textContent.includes('<itinerary')) {
        return;
      }

      const isComplete = textContent.includes('</itinerary>');
      if (!isComplete) {
        return;
      }

      if (lastProcessedMessageIdRef.current === lastAssistantMessage.id) {
        return;
      }

      const existingItinerary = currentTrip.itineraries?.find(
        (it: any) => it.messageId === lastAssistantMessage.id
      );
      if (existingItinerary) {
        lastProcessedMessageIdRef.current = lastAssistantMessage.id;
        return;
      }

      try {
        const proseMirrorDoc = htmlToProsemirror(textContent);

        const newItinerary = {
          messageId: lastAssistantMessage.id,
          document: proseMirrorDoc,
          sourceHtml: textContent,
          createdAt: Date.now(),
        };

        const updatedItineraries = [...(currentTrip.itineraries || []), newItinerary];
        const updatedTrip = {
          ...currentTrip,
          itineraries: updatedItineraries,
        };

        await saveTrip(updatedTrip);
        setCurrentTrip(updatedTrip);

        const newState = stateFromJSON(proseMirrorDoc);
        setEditorState(newState);

        lastProcessedMessageIdRef.current = lastAssistantMessage.id;
      } catch (error) {
        console.error('[TripLayout] Failed to parse itinerary:', error);
      }
    };

    parseItinerary();
  }, [messages, isChatLoading, currentTrip]);

  // Handle initial message
  useEffect(() => {
    if (initialMessage && !isLoadingTrip && !initialMessageSentRef.current && currentTrip) {
      initialMessageSentRef.current = true;
      setTimeout(() => {
        sendMessage({
          role: 'user',
          parts: [{ type: 'text', text: initialMessage }],
        });
        router.setParams({ initialMessage: undefined });
      }, 100);
    }
  }, [initialMessage, isLoadingTrip, currentTrip, sendMessage, router]);

  // Real-time streaming update
  useEffect(() => {
    if (!messages || messages.length === 0) {
      return;
    }

    const lastAssistantMessage = messages.findLast((msg: any) => msg.role === 'assistant');
    if (!lastAssistantMessage) {
      return;
    }

    const textParts = lastAssistantMessage.parts?.filter((part: any) => part.type === 'text') || [];
    const textContent = textParts.map((part: any) => part.text).join('');

    if (!textContent.includes('<itinerary')) {
      return;
    }

    try {
      const match = textContent.match(/<itinerary[^>]*>([\s\S]*?)(<\/itinerary>|$)/);
      if (!match) {
        return;
      }

      const htmlContent = match[1];

      if (!htmlContent || !htmlContent.trim()) {
        return;
      }

      const jsonContent = htmlToProsemirror(htmlContent);
      const parsedState = stateFromJSON(jsonContent);

      if (parsedState && parsedState.doc) {
        setEditorState(parsedState);
      }
    } catch (error) {
      console.error('[TripLayout] Error parsing streaming HTML:', error);
    }
  }, [messages]);

  const handleNodeFocus = useCallback((nodeId: string | null) => {
    setFocusedNodeId(nodeId);

    if (nodeId && editorState?.doc) {
      let foundLocation: any = null;

      editorState.doc.descendants((node) => {
        if (node.type.name === 'geoMark' && node.attrs?.geoId === nodeId) {
          const lat = parseFloat(node.attrs.lat);
          const lng = parseFloat(node.attrs.lng);

          if (!isNaN(lat) && !isNaN(lng)) {
            foundLocation = {
              id: node.attrs.geoId,
              name: node.attrs.placeName || 'Location',
              lat,
              lng,
              description: node.attrs.description,
              colorIndex: node.attrs.colorIndex,
            };
          }
          return false;
        }
      });

      if (foundLocation) {
        console.log('[TripLayout] Focusing map on geo-mark:', foundLocation.name);
        setFocusedLocation(foundLocation);
      }
    } else {
      setFocusedLocation(null);
    }
  }, [editorState, setFocusedLocation]);

  const handleDocumentChange = useCallback(
    async (newDoc: any) => {
      if (!currentTrip) return;

      console.log('[TripLayout] Document changed, persisting to storage');

      const newState = stateFromJSON(newDoc);
      setEditorState(newState);

      if (!currentTrip.itineraries || currentTrip.itineraries.length === 0) {
        const newItinerary = {
          messageId: 'manual',
          document: newDoc,
          createdAt: Date.now(),
        };

        const updatedTrip = {
          ...currentTrip,
          itineraries: [newItinerary],
        };

        await saveTrip(updatedTrip);
        setCurrentTrip(updatedTrip);
        return;
      }

      const updatedItineraries = [...currentTrip.itineraries];
      updatedItineraries[updatedItineraries.length - 1] = {
        ...updatedItineraries[updatedItineraries.length - 1],
        document: newDoc,
      };

      const updatedTrip = {
        ...currentTrip,
        itineraries: updatedItineraries,
      };

      await saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
    },
    [currentTrip]
  );

  const handleShowGeoMarkEditor = useCallback((data: any, locations: any[]) => {
    console.log('[TripLayout] Opening geo-mark editor with data:', data);

    router.push({
      pathname: '/create-location',
      params: {
        placeName: data?.placeName || '',
        lat: data?.lat || '',
        lng: data?.lng || '',
      },
    });
  }, [router]);

  const handleToolbarCommand = useCallback((command: string, params?: any) => {
    console.log('[TripLayout] Toolbar command:', command, params);
    documentRef.current?.sendCommand(command, params);
  }, []);

  const handleSelectionChange = useCallback((empty: boolean) => {
    setSelectionEmpty(empty);
  }, []);

  // Extract locations and routes
  const extractLocationsAndRoutes = useCallback((doc: any) => {
    const locations: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      description?: string;
      colorIndex?: number;
      photoName?: string;
    }> = [];

    const routesMap = new Map<string, {
      id: string;
      fromId: string;
      toId: string;
      profile: 'walking' | 'driving' | 'cycling' | 'transit';
      waypoints?: Array<{ lat: number; lng: number }>;
    }>();

    let locationIndex = 0;

    const traverse = (node: any) => {
      if (node.type === 'geoMark' && node.attrs?.lat && node.attrs?.lng) {
        const lat = parseFloat(node.attrs.lat);
        const lng = parseFloat(node.attrs.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          const locationId = node.attrs.geoId || `loc-${locationIndex}`;

          locations.push({
            id: locationId,
            name: node.attrs.placeName || 'Location',
            lat,
            lng,
            description: node.attrs.description,
            colorIndex: node.attrs.colorIndex ?? locationIndex,
            photoName: node.attrs.photoName,
          });

          if (node.attrs.transportFrom && node.attrs.transportProfile) {
            const routeId = `${node.attrs.transportFrom}-to-${locationId}`;

            const routeData: any = {
              id: routeId,
              fromId: node.attrs.transportFrom,
              toId: locationId,
              profile: node.attrs.transportProfile as 'walking' | 'driving' | 'cycling' | 'transit',
            };

            if (node.attrs.waypoints && Array.isArray(node.attrs.waypoints)) {
              routeData.waypoints = node.attrs.waypoints;
            }

            routesMap.set(routeId, routeData);
          }

          locationIndex++;
        }
      }
      if (node.content) {
        node.content.forEach(traverse);
      }
    };

    if (doc?.content) {
      doc.content.forEach(traverse);
    }

    const routes = Array.from(routesMap.values());

    return { locations, routes };
  }, []);

  const { locations: documentLocations, routes: documentRoutes } = useMemo(
    () => {
      if (!editorState?.doc) {
        return { locations: [], routes: [] };
      }
      const result = extractLocationsAndRoutes(editorState.doc.toJSON());
      return result;
    },
    [editorState?.doc, extractLocationsAndRoutes]
  );

  // Fetch routes from API
  useEffect(() => {
    const fetchRoutes = async () => {
      if (pendingWaypointUpdateRef.current) {
        return;
      }

      if (documentRoutes.length === 0) {
        setFetchedRoutes([]);
        return;
      }

      const locationMap = new Map(documentLocations.map(loc => [loc.id, loc]));

      try {
        const routePromises = documentRoutes.map(async (route) => {
          const fromLoc = locationMap.get(route.fromId);
          const toLoc = locationMap.get(route.toId);

          if (!fromLoc || !toLoc) {
            return null;
          }

          try {
            const waypoints = [
              { lat: fromLoc.lat, lng: fromLoc.lng }
            ];

            if (route.waypoints && Array.isArray(route.waypoints)) {
              waypoints.push(...route.waypoints);
            }

            waypoints.push({ lat: toLoc.lat, lng: toLoc.lng });

            const routeDetails = await fetchRouteWithCache(route.profile, waypoints);

            return {
              ...route,
              ...routeDetails,
            };
          } catch (error) {
            console.error(`Failed to fetch route ${route.id}:`, error);
            return null;
          }
        });

        const results = await Promise.all(routePromises);
        const validRoutes = results.filter(r => r !== null);
        setFetchedRoutes(validRoutes);
      } catch (error) {
        console.error('Error fetching routes:', error);
        setFetchedRoutes([]);
      }
    };

    fetchRoutes();
  }, [documentRoutes, documentLocations]);

  // Handle route waypoint updates
  const handleRouteWaypointUpdate = useCallback((
    routeId: string,
    waypoint: { lat: number; lng: number },
    segmentIndex: number
  ) => {
    if (!editorState) return;

    const match = routeId.match(/^(.+)-to-(.+)$/);
    if (!match) {
      return;
    }

    const [, fromGeoId, toGeoId] = match;

    let found = false;
    const tr = editorState.tr;

    editorState.doc.descendants((node, pos) => {
      if (found) return false;

      if (node.type.name === 'geoMark' && node.attrs.geoId === toGeoId) {
        const existingWaypoints = node.attrs.waypoints || [];
        const updatedWaypoints = [...existingWaypoints];
        updatedWaypoints.splice(segmentIndex, 0, { lat: waypoint.lat, lng: waypoint.lng });

        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          waypoints: updatedWaypoints,
        });

        found = true;
      }
    });

    if (found) {
      const newState = editorState.apply(tr);
      setEditorState(newState);
      handleDocumentChange(newState.doc.toJSON());
    }
  }, [editorState, handleDocumentChange]);

  // Handle route waypoint removal
  const handleRouteWaypointRemove = useCallback((routeId: string, waypointIndex: number) => {
    if (!editorState) return;

    pendingWaypointUpdateRef.current = routeId;

    setFetchedRoutes(prevRoutes => {
      return prevRoutes.map(route => {
        if (route.id === routeId && route.waypoints) {
          const updatedWaypoints = [...route.waypoints];
          updatedWaypoints.splice(waypointIndex, 1);

          return {
            ...route,
            waypoints: updatedWaypoints.length > 0 ? updatedWaypoints : undefined,
          };
        }
        return route;
      });
    });

    const match = routeId.match(/^(.+)-to-(.+)$/);
    if (!match) {
      return;
    }

    const [, fromGeoId, toGeoId] = match;

    let found = false;
    const tr = editorState.tr;

    editorState.doc.descendants((node, pos) => {
      if (found) return false;

      if (node.type.name === 'geoMark' && node.attrs.geoId === toGeoId) {
        const existingWaypoints = node.attrs.waypoints || [];

        if (waypointIndex < 0 || waypointIndex >= existingWaypoints.length) {
          return false;
        }

        const updatedWaypoints = [...existingWaypoints];
        updatedWaypoints.splice(waypointIndex, 1);

        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          waypoints: updatedWaypoints.length > 0 ? updatedWaypoints : null,
        });

        found = true;
      }
    });

    if (found) {
      const newState = editorState.apply(tr);
      setEditorState(newState);
      handleDocumentChange(newState.doc.toJSON());

      (async () => {
        await new Promise(resolve => setTimeout(resolve, 50));

        const { locations, routes } = extractLocationsAndRoutes(newState.doc.toJSON());

        if (routes.length === 0) {
          setFetchedRoutes([]);
          pendingWaypointUpdateRef.current = null;
          return;
        }

        const locationMap = new Map(locations.map(loc => [loc.id, loc]));

        try {
          const routePromises = routes.map(async (route: any) => {
            const fromLoc = locationMap.get(route.fromId);
            const toLoc = locationMap.get(route.toId);

            if (!fromLoc || !toLoc) {
              return null;
            }

            try {
              const waypoints = [{ lat: fromLoc.lat, lng: fromLoc.lng }];

              if (route.waypoints && Array.isArray(route.waypoints)) {
                waypoints.push(...route.waypoints);
              }

              waypoints.push({ lat: toLoc.lat, lng: toLoc.lng });

              const routeDetails = await fetchRouteWithCache(route.profile, waypoints);

              return {
                ...route,
                ...routeDetails,
              };
            } catch (error) {
              return null;
            }
          });

          const results = await Promise.all(routePromises);
          const validRoutes = results.filter(r => r !== null);
          setFetchedRoutes(validRoutes);
        } catch (error) {
          console.error('Error re-fetching routes:', error);
        } finally {
          pendingWaypointUpdateRef.current = null;
        }
      })();
    } else {
      pendingWaypointUpdateRef.current = null;
    }
  }, [editorState, handleDocumentChange, extractLocationsAndRoutes]);

  // Custom handle component for bottom sheet
  const renderHandle = useCallback(() => (
    <View style={styles.bottomSheetHandle}>
      <View style={styles.handleBar} />
      <View style={styles.handleHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.handleTitle} numberOfLines={1}>
          {currentTrip?.title || 'Loading...'}
        </Text>
        <View style={styles.handleButtons}>
          <TouchableOpacity
            style={[styles.handleButton, isEditMode && styles.handleButtonActive]}
            onPress={() => setIsEditMode(!isEditMode)}
          >
            <Ionicons
              name={isEditMode ? "create" : "create-outline"}
              size={20}
              color={isEditMode ? "#fff" : "#6B7280"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.handleButton}
            onPress={async () => {
              if (currentTrip && currentTrip.itineraries && currentTrip.itineraries.length > 0) {
                const updatedTrip = {
                  ...currentTrip,
                  itineraries: []
                };
                await saveTrip(updatedTrip);
                setCurrentTrip(updatedTrip);
                lastProcessedMessageIdRef.current = null;
              }
            }}
          >
            <Ionicons name="refresh-outline" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [currentTrip, isEditMode, router]);

  if (isLoadingTrip) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading trip...</Text>
        </View>
      </View>
    );
  }

  if (!currentTrip) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={styles.errorText}>Trip not found</Text>
        </View>
      </View>
    );
  }

  const contextValue: TripContextType = {
    tripId,
    currentTrip,
    setCurrentTrip,
    editorState,
    setEditorState,
    isEditMode,
    setIsEditMode,
    focusedNodeId,
    setFocusedNodeId,
    focusedLocation,
    setFocusedLocation,
    handleNodeFocus,
    handleDocumentChange,
    handleShowGeoMarkEditor,
    handleToolbarCommand,
    handleSelectionChange,
    documentRef,
    bottomSheetRef,
    documentLocations,
    fetchedRoutes,
    handleRouteWaypointUpdate,
    handleRouteWaypointRemove,
    chatHelpers,
    geoMarkDataToCreate,
    setGeoMarkDataToCreate,
    selectionEmpty,
    sheetHeight,
  };

  return (
    <TripContext.Provider value={contextValue}>
      <GestureHandlerRootView style={styles.container}>
        {/* Full-screen map background */}
        <View
          style={styles.mapBackground}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setMapDimensions({ width, height });

            if (sheetHeight === 0) {
              const defaultSnapPoint = snapPoints[1];
              const defaultPercent = parseInt(defaultSnapPoint.replace('%', ''));
              const initialHeight = (height * defaultPercent) / 100;
              setSheetHeight(initialHeight);
            }
          }}
        >
          {mapDimensions && (
            <MapViewSimpleWrapper
              locations={documentLocations}
              routes={fetchedRoutes}
              height={mapDimensions.height}
              focusedLocation={focusedLocation}
              isEditMode={isEditMode}
              onRouteWaypointUpdate={handleRouteWaypointUpdate}
              onRouteWaypointRemove={handleRouteWaypointRemove}
              bottomPadding={sheetHeight}
            />
          )}
        </View>

        {/* Hamburger menu button */}
        <TouchableOpacity
          style={[styles.hamburgerButton, { top: insets.top + 16 }]}
          onPress={() => {
            navigation.dispatch(DrawerActions.openDrawer());
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={28} color="#111827" />
        </TouchableOpacity>

        {/* Bottom sheet with Stack navigator */}
        <BottomSheet
          ref={bottomSheetRef}
          index={1}
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          enablePanDownToClose={false}
          handleComponent={renderHandle}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          onChange={(index) => {
            if (mapDimensions && index >= 0 && index < snapPoints.length) {
              const snapPoint = snapPoints[index];
              const snapPercent = parseInt(snapPoint.replace('%', ''));
              const calculatedHeight = (mapDimensions.height * snapPercent) / 100;
              setSheetHeight(calculatedHeight);
            }
          }}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: styles.stackContent,
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" options={{ contentStyle: styles.stackContent }} />
            <Stack.Screen
              name="location/[locationId]"
              options={{
                presentation: 'card',
                animation: 'slide_from_right',
                contentStyle: styles.stackContent,
              }}
            />
          </Stack>
        </BottomSheet>

        {/* Hoisted toolbar */}
        {isEditMode && keyboardHeight > 0 && (
          <View style={[
            styles.toolbarContainer,
            {
              bottom: keyboardHeight,
              paddingBottom: 0
            }
          ]}>
            <ProseMirrorToolbar
              editable={isEditMode}
              selectionEmpty={selectionEmpty}
              onCommand={handleToolbarCommand}
            />
          </View>
        )}
      </GestureHandlerRootView>
    </TripContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    marginTop: 12,
    fontSize: 18,
    color: '#EF4444',
    fontWeight: '600',
  },
  bottomSheetHandle: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  handleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  handleTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginRight: 12,
  },
  handleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  handleButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleButtonActive: {
    backgroundColor: '#3B82F6',
  },
  toolbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  sheetContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  stackContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  hamburgerButton: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

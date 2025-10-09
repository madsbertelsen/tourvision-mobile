import { MapViewSimpleWrapper } from '@/components/MapViewSimpleWrapper';
import ProseMirrorViewerWrapper from '@/components/ProseMirrorViewerWrapper';
import { useMockContext } from '@/contexts/MockContext';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { htmlToProsemirror } from '@/utils/prosemirror-html';
import { schema } from '@/utils/prosemirror-schema';
import { stateFromJSON } from '@/utils/prosemirror-transactions';
import { fetchRouteWithCache, type RouteDetails } from '@/utils/transportation-api';
import { getTrip, saveTrip, type SavedTrip } from '@/utils/trips-storage';
import { useChat } from '@ai-sdk/react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { EditorState } from 'prosemirror-state';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface TripDetailViewProps {
  tripId: string;
  initialMessage?: string;
}

export default function TripDetailView({ tripId, initialMessage }: TripDetailViewProps) {
  const router = useRouter();
  const { setFocusedLocation } = useMockContext();
  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState>(() =>
    EditorState.create({ schema })
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const initialMessageSentRef = useRef(false);
  const lastProcessedMessageIdRef = useRef<string | null>(null);
  const [fetchedRoutes, setFetchedRoutes] = useState<any[]>([]);
  const pendingWaypointUpdateRef = useRef<string | null>(null); // Track pending waypoint updates to prevent route flash
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['15%', '50%', '90%'], []);
  const [sheetKey, setSheetKey] = useState(0); // Force re-layout when sheet changes
  const [mapDimensions, setMapDimensions] = useState<{ width: number; height: number } | null>(null);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);

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

        // Load messages into chat
        if (trip.messages && trip.messages.length > 0) {
          setMessages(trip.messages);
        }

        // Load document if exists, or create blank one
        if (trip.itineraries && trip.itineraries.length > 0) {
          console.log('[TripDetailView] Loading document from itineraries, count:', trip.itineraries.length);
          const latestItinerary = trip.itineraries[trip.itineraries.length - 1];
          if (latestItinerary.document) {
            console.log('[TripDetailView] Latest itinerary document:', JSON.stringify(latestItinerary.document).substring(0, 200));
            const state = stateFromJSON(latestItinerary.document);
            setEditorState(state);
            console.log('[TripDetailView] EditorState loaded from itinerary');
          }
        } else {
          console.log('[TripDetailView] No itineraries found, creating blank document');

          // Create blank ProseMirror document
          const blankDocument = {
            type: 'doc',
            content: [
              { type: 'paragraph', attrs: { id: `node-${Date.now()}` }, content: [] }
            ]
          };

          // Create initial itinerary with blank document
          const blankItinerary = {
            messageId: 'manual', // Not from AI
            document: blankDocument,
            createdAt: Date.now(),
          };

          // Save trip with blank itinerary
          const updatedTrip = {
            ...trip,
            itineraries: [blankItinerary],
          };

          await saveTrip(updatedTrip);
          setCurrentTrip(updatedTrip);

          // Set editor state to blank document
          const state = stateFromJSON(blankDocument);
          setEditorState(state);
          console.log('[TripDetailView] Blank itinerary created and loaded');
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

  // Sync editor state with itineraries array
  useEffect(() => {
    console.log('[TripDetailView] Sync effect triggered');
    console.log('[TripDetailView] currentTrip exists:', !!currentTrip);
    console.log('[TripDetailView] itineraries exists:', !!currentTrip?.itineraries);
    console.log('[TripDetailView] itineraries length:', currentTrip?.itineraries?.length || 0);

    if (!currentTrip?.itineraries || currentTrip.itineraries.length === 0) {
      console.log('[TripDetailView] No itineraries to sync');
      return;
    }

    const latestItinerary = currentTrip.itineraries[currentTrip.itineraries.length - 1];
    if (!latestItinerary.document) {
      console.log('[TripDetailView] Latest itinerary has no document');
      return;
    }

    console.log('[TripDetailView] Syncing editorState with latest itinerary');
    console.log('[TripDetailView] Latest itinerary document:', JSON.stringify(latestItinerary.document).substring(0, 200));
    const newState = stateFromJSON(latestItinerary.document);
    setEditorState(newState);
    console.log('[TripDetailView] EditorState synced');
  }, [currentTrip?.itineraries?.length, currentTrip]);

  // Parse and save itinerary from messages
  useEffect(() => {
    console.log('[TripDetailView] Parse effect FIRED');
    console.log('[TripDetailView] messages:', messages.length);
    console.log('[TripDetailView] isChatLoading:', isChatLoading);
    console.log('[TripDetailView] currentTrip:', !!currentTrip);

    const parseItinerary = async () => {
      if (!currentTrip || messages.length === 0) {
        console.log('[TripDetailView] Early exit - no trip or no messages');
        return;
      }

      // Only parse when streaming is complete
      if (isChatLoading) {
        console.log('[TripDetailView] Early exit - still loading');
        return;
      }

      // Find last assistant message
      const lastAssistantMessage = messages.findLast((msg: any) => msg.role === 'assistant');
      if (!lastAssistantMessage) {
        console.log('[TripDetailView] Early exit - no assistant message');
        return;
      }

      console.log('[TripDetailView] Last assistant message ID:', lastAssistantMessage.id);

      // Extract text content first
      const textParts = lastAssistantMessage.parts?.filter((part: any) => part.type === 'text') || [];
      const textContent = textParts.map((part: any) => part.text).join('');

      console.log('[TripDetailView] Checking message for itinerary');
      console.log('[TripDetailView] Text content length:', textContent.length);

      // Check for itinerary HTML
      if (!textContent.includes('<itinerary')) {
        console.log('[TripDetailView] No itinerary HTML found in message');
        return;
      }

      // Check if HTML is complete (has closing tag)
      const isComplete = textContent.includes('</itinerary>');
      if (!isComplete) {
        console.log('[TripDetailView] Itinerary HTML incomplete (no closing tag), waiting...');
        return;
      }

      console.log('[TripDetailView] Found complete <itinerary> HTML');

      // Check if we've already processed this in this session
      if (lastProcessedMessageIdRef.current === lastAssistantMessage.id) {
        console.log('[TripDetailView] Already processed in this session, skipping');
        return;
      }

      // Check if we've already saved an itinerary for this message
      const existingItinerary = currentTrip.itineraries?.find(
        (it: any) => it.messageId === lastAssistantMessage.id
      );
      if (existingItinerary) {
        console.log('[TripDetailView] Itinerary already exists for this message, skipping');
        lastProcessedMessageIdRef.current = lastAssistantMessage.id;
        return;
      }

      console.log('[TripDetailView] Found <itinerary> tag, parsing...');

      console.log('[TripDetailView] Parsing itinerary from message:', lastAssistantMessage.id);

      try {
        // Parse HTML to ProseMirror
        const proseMirrorDoc = htmlToProsemirror(textContent);

        // Create new itinerary entry
        const newItinerary = {
          messageId: lastAssistantMessage.id,
          document: proseMirrorDoc,
          sourceHtml: textContent,
          createdAt: Date.now(),
        };

        // Update trip with new itinerary
        const updatedItineraries = [...(currentTrip.itineraries || []), newItinerary];
        const updatedTrip = {
          ...currentTrip,
          itineraries: updatedItineraries,
        };

        console.log('[TripDetailView] Saving itinerary, total count:', updatedItineraries.length);
        console.log('[TripDetailView] Itinerary document:', JSON.stringify(proseMirrorDoc).substring(0, 200));
        await saveTrip(updatedTrip);
        setCurrentTrip(updatedTrip);

        // Update editor state
        const newState = stateFromJSON(proseMirrorDoc);
        console.log('[TripDetailView] Setting editor state from parsed itinerary');
        console.log('[TripDetailView] New state doc:', JSON.stringify(newState.doc.toJSON()).substring(0, 200));
        setEditorState(newState);

        console.log('[TripDetailView] Itinerary parsed and saved');

        // Mark as processed
        lastProcessedMessageIdRef.current = lastAssistantMessage.id;
      } catch (error) {
        console.error('[TripDetailView] Failed to parse itinerary:', error);
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
        // Clear the initialMessage from URL after sending
        router.setParams({ initialMessage: undefined });
      }, 100);
    }
  }, [initialMessage, isLoadingTrip, currentTrip, sendMessage, router]);

  // Real-time streaming update: Parse latest message HTML during streaming
  useEffect(() => {
    console.log('[Streaming] Effect triggered, messages:', messages.length, 'loading:', isChatLoading);

    if (!messages || messages.length === 0) {
      console.log('[Streaming] No messages, skipping');
      return;
    }

    // Find last assistant message
    const lastAssistantMessage = messages.findLast((msg: any) => msg.role === 'assistant');
    if (!lastAssistantMessage) {
      console.log('[Streaming] No assistant message found');
      return;
    }

    // Extract text content
    const textParts = lastAssistantMessage.parts?.filter((part: any) => part.type === 'text') || [];
    const textContent = textParts.map((part: any) => part.text).join('');

    console.log('[Streaming] Text content length:', textContent.length);
    console.log('[Streaming] Has itinerary tag:', textContent.includes('<itinerary'));

    // Check if it contains itinerary HTML
    if (!textContent.includes('<itinerary')) {
      console.log('[Streaming] No itinerary tag, skipping');
      return;
    }

    // Parse the HTML (even if incomplete during streaming)
    try {
      const match = textContent.match(/<itinerary[^>]*>([\s\S]*?)(<\/itinerary>|$)/);
      if (!match) {
        console.log('[Streaming] No itinerary match found');
        return;
      }

      const htmlContent = match[1];
      console.log('[Streaming] HTML content length:', htmlContent.length);
      console.log('[Streaming] HTML preview:', htmlContent.substring(0, 200));

      if (!htmlContent || !htmlContent.trim()) {
        console.log('[Streaming] HTML content is empty');
        return;
      }

      // Parse to ProseMirror
      console.log('[Streaming] Attempting to parse HTML to ProseMirror');
      const jsonContent = htmlToProsemirror(htmlContent);
      console.log('[Streaming] Parse result - JSONContent:', !!jsonContent);

      const parsedState = stateFromJSON(jsonContent);
      console.log('[Streaming] Created state - has doc:', !!parsedState?.doc);

      if (parsedState && parsedState.doc) {
        console.log('[Streaming] Setting editor state');
        setEditorState(parsedState);
      }
    } catch (error) {
      console.error('[Streaming] Error parsing streaming HTML:', error);
      console.log('[Streaming] Error details:', error);
    }
  }, [messages]); // Run whenever messages change, not just when streaming completes

  const handleNodeFocus = (nodeId: string | null) => {
    setFocusedNodeId(nodeId);
  };

  const handleDocumentChange = useCallback(
    async (newDoc: any) => {
      if (!currentTrip) return;

      console.log('[TripDetailView] Document changed, persisting to storage');
      console.log('[TripDetailView] New document has geoMarks:', JSON.stringify(newDoc).includes('geoMark'));

      const newState = stateFromJSON(newDoc);
      setEditorState(newState);

      // If no itineraries exist, create the initial one
      if (!currentTrip.itineraries || currentTrip.itineraries.length === 0) {
        console.log('[TripDetailView] No itineraries found, creating initial one');
        const newItinerary = {
          messageId: 'manual', // Not from AI
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

      // Update existing itinerary
      const updatedItineraries = [...currentTrip.itineraries];
      updatedItineraries[updatedItineraries.length - 1] = {
        ...updatedItineraries[updatedItineraries.length - 1],
        document: newDoc,
      };

      const updatedTrip = {
        ...currentTrip,
        itineraries: updatedItineraries,
      };

      console.log('[TripDetailView] About to save trip with updated document');
      await saveTrip(updatedTrip);
      console.log('[TripDetailView] Trip saved, updating currentTrip state');
      setCurrentTrip(updatedTrip);
      console.log('[TripDetailView] currentTrip state updated');
    },
    [currentTrip]
  );

  // Extract locations and routes from the document for map display
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

          // Log first few geo-marks to debug
          if (locationIndex < 3) {
            console.log('[extractLocationsAndRoutes] GeoMark attrs:', {
              placeName: node.attrs.placeName,
              geoId: node.attrs.geoId,
              transportFrom: node.attrs.transportFrom,
              transportProfile: node.attrs.transportProfile,
            });
          }

          locations.push({
            id: locationId,
            name: node.attrs.placeName || 'Location',
            lat,
            lng,
            description: node.attrs.description,
            // Assign color index if not present
            colorIndex: node.attrs.colorIndex ?? locationIndex,
            photoName: node.attrs.photoName,
          });

          // If this location has a transport route from another location
          if (node.attrs.transportFrom && node.attrs.transportProfile) {
            const routeId = `${node.attrs.transportFrom}-to-${locationId}`;
            console.log('[extractLocationsAndRoutes] Adding route:', routeId, node.attrs.transportProfile);

            const routeData: any = {
              id: routeId,
              fromId: node.attrs.transportFrom,
              toId: locationId,
              profile: node.attrs.transportProfile as 'walking' | 'driving' | 'cycling' | 'transit',
            };

            // Include waypoints if present
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

    // Return route definitions without geometry (to be fetched)
    const routes = Array.from(routesMap.values());

    return { locations, routes };
  }, []);

  const { locations: documentLocations, routes: documentRoutes } = useMemo(
    () => {
      if (!editorState?.doc) {
        return { locations: [], routes: [] };
      }
      const result = extractLocationsAndRoutes(editorState.doc.toJSON());
      console.log('[TripDetailView] Extracted locations:', result.locations.length);
      console.log('[TripDetailView] Extracted routes:', result.routes.length);
      if (result.routes.length > 0) {
        console.log('[TripDetailView] Sample route:', result.routes[0]);
      }
      return result;
    },
    [editorState?.doc, extractLocationsAndRoutes]
  );

  // Fetch actual routes from API when document routes change
  useEffect(() => {
    const fetchRoutes = async () => {
      console.log('[TripDetailView] fetchRoutes effect triggered, routes:', documentRoutes.length);

      // Skip fetch if there's a pending waypoint update (to prevent route flash)
      if (pendingWaypointUpdateRef.current) {
        console.log('[TripDetailView] Skipping route fetch due to pending waypoint update:', pendingWaypointUpdateRef.current);
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

          console.log('[TripDetailView] Fetching route:', route.id, 'from', route.fromId, 'to', route.toId);

          if (!fromLoc || !toLoc) {
            console.warn('[TripDetailView] Missing location for route:', route.id);
            return null;
          }

          try {
            // Build waypoints array: start, custom waypoints, end
            const waypoints = [
              { lat: fromLoc.lat, lng: fromLoc.lng }
            ];

            // Add custom waypoints if present
            if (route.waypoints && Array.isArray(route.waypoints)) {
              waypoints.push(...route.waypoints);
              console.log('[TripDetailView] Including', route.waypoints.length, 'custom waypoints');
            }

            waypoints.push({ lat: toLoc.lat, lng: toLoc.lng });

            console.log('[TripDetailView] Calling API for route:', route.profile, fromLoc.name, '->', toLoc.name);
            const routeDetails = await fetchRouteWithCache(route.profile, waypoints);

            console.log('[TripDetailView] Got route details:', routeDetails.distance, 'meters');

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
        console.log('[TripDetailView] Fetched routes complete:', validRoutes.length);
        setFetchedRoutes(validRoutes);
      } catch (error) {
        console.error('Error fetching routes:', error);
        setFetchedRoutes([]);
      }
    };

    fetchRoutes();
  }, [documentRoutes, documentLocations]);

  // Handle route waypoint updates from map editing
  const handleRouteWaypointUpdate = useCallback((
    routeId: string,
    waypoint: { lat: number; lng: number },
    segmentIndex: number
  ) => {
    if (!editorState) return;

    console.log('[TripDetailView] Updating route waypoint:', routeId, waypoint, 'at segment', segmentIndex);

    // Parse routeId to get target geo-mark ID
    // Route ID format: "{fromGeoId}-to-{toGeoId}"
    const match = routeId.match(/^(.+)-to-(.+)$/);
    if (!match) {
      console.error('[TripDetailView] Invalid route ID format:', routeId);
      return;
    }

    const [, fromGeoId, toGeoId] = match;
    console.log('[TripDetailView] Adding waypoint to route from', fromGeoId, 'to', toGeoId);

    // Find and update the target geo-mark (the destination)
    let found = false;
    const tr = editorState.tr;

    editorState.doc.descendants((node, pos) => {
      if (found) return false; // Stop traversing once found

      if (node.type.name === 'geoMark' && node.attrs.geoId === toGeoId) {
        console.log('[TripDetailView] Found target geo-mark:', node.attrs.placeName);

        // Get existing waypoints or create new array
        const existingWaypoints = node.attrs.waypoints || [];

        console.log('[TripDetailView] Existing waypoints:', existingWaypoints);
        console.log('[TripDetailView] Segment index from map:', segmentIndex);

        // Insert waypoint at correct index based on which segment was split
        // The route geometry is: [start, ...waypoints, end]
        // If segmentIndex is 0, we're splitting between start and first waypoint (or end)
        // So we insert at index 0
        const updatedWaypoints = [...existingWaypoints];
        updatedWaypoints.splice(segmentIndex, 0, { lat: waypoint.lat, lng: waypoint.lng });

        console.log('[TripDetailView] Inserting waypoint at index', segmentIndex);
        console.log('[TripDetailView] Updated waypoints:', updatedWaypoints);

        // Update the node attributes
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          waypoints: updatedWaypoints,
        });

        found = true;
      }
    });

    if (found) {
      // Apply transaction
      const newState = editorState.apply(tr);
      setEditorState(newState);

      // Save to storage
      handleDocumentChange(newState.doc.toJSON());

      console.log('[TripDetailView] Waypoint added successfully');
    } else {
      console.error('[TripDetailView] Could not find geo-mark with ID:', toGeoId);
    }
  }, [editorState, handleDocumentChange]);

  // Handle route waypoint removal from map editing
  const handleRouteWaypointRemove = useCallback((routeId: string, waypointIndex: number) => {
    if (!editorState) return;

    console.log('[TripDetailView] Removing waypoint at index', waypointIndex, 'from route', routeId);

    // Mark this route as having a pending update to prevent flash
    pendingWaypointUpdateRef.current = routeId;

    // Optimistically update the displayed routes immediately
    setFetchedRoutes(prevRoutes => {
      return prevRoutes.map(route => {
        if (route.id === routeId && route.waypoints) {
          const updatedWaypoints = [...route.waypoints];
          updatedWaypoints.splice(waypointIndex, 1);

          console.log('[TripDetailView] Optimistically removing waypoint from displayed route');

          return {
            ...route,
            waypoints: updatedWaypoints.length > 0 ? updatedWaypoints : undefined,
          };
        }
        return route;
      });
    });

    // Parse routeId to get target geo-mark ID
    const match = routeId.match(/^(.+)-to-(.+)$/);
    if (!match) {
      console.error('[TripDetailView] Invalid route ID format:', routeId);
      return;
    }

    const [, fromGeoId, toGeoId] = match;
    console.log('[TripDetailView] Removing waypoint from route from', fromGeoId, 'to', toGeoId);

    // Find and update the target geo-mark
    let found = false;
    const tr = editorState.tr;

    editorState.doc.descendants((node, pos) => {
      if (found) return false;

      if (node.type.name === 'geoMark' && node.attrs.geoId === toGeoId) {
        console.log('[TripDetailView] Found target geo-mark:', node.attrs.placeName);

        const existingWaypoints = node.attrs.waypoints || [];

        if (waypointIndex < 0 || waypointIndex >= existingWaypoints.length) {
          console.error('[TripDetailView] Invalid waypoint index:', waypointIndex);
          return false;
        }

        // Remove waypoint at index
        const updatedWaypoints = [...existingWaypoints];
        updatedWaypoints.splice(waypointIndex, 1);

        console.log('[TripDetailView] Removed waypoint at index', waypointIndex);
        console.log('[TripDetailView] Updated waypoints:', updatedWaypoints);

        // Update the node attributes
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          waypoints: updatedWaypoints.length > 0 ? updatedWaypoints : null,
        });

        found = true;
      }
    });

    if (found) {
      // Apply transaction
      const newState = editorState.apply(tr);
      setEditorState(newState);

      // Save to storage
      handleDocumentChange(newState.doc.toJSON());

      console.log('[TripDetailView] Waypoint removed successfully');

      // Manually trigger route re-fetch with updated document
      // This ensures we fetch the route with the new waypoints
      (async () => {
        // Wait for state to settle
        await new Promise(resolve => setTimeout(resolve, 50));

        // Extract routes from the new state
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
              console.warn('[TripDetailView] Missing location for route:', route.id);
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
              console.error(`Failed to fetch route ${route.id}:`, error);
              return null;
            }
          });

          const results = await Promise.all(routePromises);
          const validRoutes = results.filter(r => r !== null);
          console.log('[TripDetailView] Re-fetched routes after waypoint removal:', validRoutes.length);
          setFetchedRoutes(validRoutes);
        } catch (error) {
          console.error('Error re-fetching routes:', error);
        } finally {
          // Clear pending flag
          pendingWaypointUpdateRef.current = null;
        }
      })();
    } else {
      console.error('[TripDetailView] Could not find geo-mark with ID:', toGeoId);
      // Clear pending flag if operation failed
      pendingWaypointUpdateRef.current = null;
    }
  }, [editorState, handleDocumentChange, extractLocationsAndRoutes]);

  // Custom handle component for bottom sheet (defined before early returns to satisfy hooks rules)
  const renderHandle = useCallback(() => (
    <View style={styles.bottomSheetHandle}>
      <View style={styles.handleBar} />
      <View style={styles.handleHeader}>
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
              // Force re-parse from HTML
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
  ), [currentTrip, isEditMode]);

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

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Full-screen map background */}
      <View
        style={styles.mapBackground}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          console.log('[TripDetailView] Map container dimensions:', width, 'x', height);
          setMapDimensions({ width, height });
        }}
      >
        {mapDimensions && (
          <MapViewSimpleWrapper
            locations={documentLocations}
            routes={fetchedRoutes}
            height={mapDimensions.height}
            isEditMode={isEditMode}
            onRouteWaypointUpdate={handleRouteWaypointUpdate}
            onRouteWaypointRemove={handleRouteWaypointRemove}
          />
        )}
      </View>

      {/* Bottom sheet with document */}
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        snapPoints={snapPoints}
        enablePanDownToClose={false}
        handleComponent={renderHandle}
        onAnimate={(fromIndex: number, toIndex: number) => {
          console.log(`[TripDetailView] Bottom sheet animating from ${fromIndex} to ${toIndex}`);
          // Only trigger re-layout when animation finishes (toIndex is stable)
          if (fromIndex !== toIndex) {
            // Use longer delay to ensure animation is complete
            setTimeout(() => {
              console.log('[TripDetailView] Triggering re-layout after animation');
              setSheetKey(prev => prev + 1);
              setSheetHeight(null); // Reset to trigger re-measurement
            }, 500);
          }
        }}
      >
        <BottomSheetView
          style={styles.bottomSheetContent}
          onLayout={(event) => {
            const { height, width } = event.nativeEvent.layout;
            console.log('[TripDetailView] BottomSheetView measured:', width, 'x', height, 'px');
            setSheetHeight(height);
          }}
        >
          {sheetHeight && sheetHeight > 100 ? (
            <View style={{ height: sheetHeight, width: '100%' }}>
              {editorState?.doc ? (
                <ProseMirrorViewerWrapper
                  key={sheetKey}
                  content={editorState.doc.toJSON()}
                  onNodeFocus={handleNodeFocus}
                  focusedNodeId={focusedNodeId}
                  height={sheetHeight}
                  editable={isEditMode}
                  onChange={handleDocumentChange}
                />
              ) : (
                <View style={styles.centerContent}>
                  <Text style={styles.loadingText}>Waiting for content...</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.centerContent}>
              <Text style={styles.loadingText}>Measuring sheet...</Text>
            </View>
          )}
        </BottomSheetView>
      </BottomSheet>
    </GestureHandlerRootView>
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
  // Bottom sheet styles
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
  bottomSheetContent: {
    flex: 1,
    backgroundColor: '#FFE5E5', // Light red to debug container
    borderWidth: 3,
    borderColor: 'red',
    borderStyle: 'solid',
  },
});

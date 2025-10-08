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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

interface TripDetailViewProps {
  tripId: string;
  initialMessage?: string;
}

export default function TripDetailView({ tripId, initialMessage }: TripDetailViewProps) {
  const router = useRouter();
  const { setFocusedLocation } = useMockContext();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;
  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState>(() =>
    EditorState.create({ schema })
  );
  const initialMessageSentRef = useRef(false);
  const lastProcessedMessageIdRef = useRef<string | null>(null);
  const [fetchedRoutes, setFetchedRoutes] = useState<any[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);

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

        // Load document if exists
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
          console.log('[TripDetailView] No itineraries found in trip');
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

  // Auto-scroll to bottom
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleNodeFocus = (nodeId: string | null) => {
    setFocusedNodeId(nodeId);
  };

  const handleDocumentChange = useCallback(
    async (newDoc: any) => {
      if (!currentTrip || !currentTrip.itineraries || currentTrip.itineraries.length === 0) return;

      console.log('[TripDetailView] Document changed, persisting to storage');

      const newState = stateFromJSON(newDoc);
      setEditorState(newState);

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
            routesMap.set(routeId, {
              id: routeId,
              fromId: node.attrs.transportFrom,
              toId: locationId,
              profile: node.attrs.transportProfile as 'walking' | 'driving' | 'cycling' | 'transit',
            });
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
            console.log('[TripDetailView] Calling API for route:', route.profile, fromLoc.name, '->', toLoc.name);
            const routeDetails = await fetchRouteWithCache(route.profile, [
              { lat: fromLoc.lat, lng: fromLoc.lng },
              { lat: toLoc.lat, lng: toLoc.lng }
            ]);

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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {currentTrip.title}
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.viewModeButton}
            onPress={async () => {
              // Force re-parse from HTML
              if (currentTrip.itineraries && currentTrip.itineraries.length > 0) {
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

      {/* Content: Unified document + map view */}
      <View style={styles.documentContainer}>
        {isLargeScreen ? (
          // Split view for large screens: document on left, map on right
          <View style={styles.splitView}>
            <ScrollView
              ref={scrollViewRef}
              style={[styles.documentScrollView, styles.documentScrollViewSplit]}
              contentContainerStyle={styles.documentScrollContent}
            >
              {/* Document content */}
              <View style={styles.messageWrapper}>
                <View style={[styles.messageBubble, styles.assistantMessage]}>
                  {editorState?.doc ? (
                    <ProseMirrorViewerWrapper
                      content={editorState.doc.toJSON()}
                      onNodeFocus={handleNodeFocus}
                      focusedNodeId={focusedNodeId}
                      height="auto"
                      editable={!isChatLoading}
                      onChange={handleDocumentChange}
                    />
                  ) : (
                    <Text style={styles.loadingText}>Waiting for content...</Text>
                  )}
                </View>
              </View>
            </ScrollView>
            <View style={styles.mapContainer}>
              <MapViewSimpleWrapper
                locations={documentLocations}
                routes={fetchedRoutes}
                height="100%"
              />
            </View>
          </View>
        ) : (
          // Single column view for mobile: document above, map below
          <>
            <ScrollView
              ref={scrollViewRef}
              style={styles.documentScrollView}
              contentContainerStyle={styles.documentScrollContent}
            >
              {/* Document content */}
              <View style={styles.messageWrapper}>
                <View style={[styles.messageBubble, styles.assistantMessage]}>
                  {editorState?.doc ? (
                    <ProseMirrorViewerWrapper
                      content={editorState.doc.toJSON()}
                      onNodeFocus={handleNodeFocus}
                      focusedNodeId={focusedNodeId}
                      height="auto"
                      editable={!isChatLoading}
                      onChange={handleDocumentChange}
                    />
                  ) : (
                    <Text style={styles.loadingText}>Waiting for content...</Text>
                  )}
                </View>
              </View>
            </ScrollView>
            <View style={styles.mapContainerMobile}>
              <MapViewSimpleWrapper
                locations={documentLocations}
                routes={fetchedRoutes}
                height={300}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginRight: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  viewModeButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewModeButtonActive: {
    backgroundColor: '#3B82F6',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageWrapper: {
    marginBottom: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
  },
  userMessage: {
    backgroundColor: '#3B82F6',
    alignSelf: 'flex-end',
    marginLeft: '20%',
  },
  userText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  assistantMessage: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    marginRight: '20%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '80%',
  },
  streamingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
  documentScrollView: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  documentScrollViewSplit: {
    maxWidth: 900,
  },
  documentScrollContent: {
    padding: 16,
  },
  documentContainer: {
    flex: 1,
  },
  splitView: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
  },
  mapContainer: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    backgroundColor: '#F3F4F6',
  },
  mapContainerMobile: {
    height: 300,
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  documentToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  toolbarButtonActive: {
    backgroundColor: '#3B82F6',
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  toolbarButtonTextActive: {
    color: '#fff',
  },
});

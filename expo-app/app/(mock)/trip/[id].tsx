import { ProseMirrorViewerWrapper } from '@/components/ProseMirrorViewerWrapper';
import type { RouteWithMetadata } from '@/contexts/MockContext';
import { useMockContext } from '@/contexts/MockContext';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { buildLocationGraph, enhanceGraphWithDistances, summarizeGraph, type LocationGraph } from '@/utils/location-graph';
import { getBoundingBoxFromCenterRadius, getViewStateFromBounds } from '@/utils/map-bounds';
import { parseHTMLToProseMirror } from '@/utils/prosemirror-parser';
import { extractGeoMarks } from '@/utils/prosemirror-schema';
import { stateFromJSON, stateToJSON } from '@/utils/prosemirror-transactions';
import { fetchRouteWithCache, type Waypoint } from '@/utils/transportation-api';
import { getTrip, saveTrip, type SavedTrip } from '@/utils/trips-storage';
import { useChat } from '@ai-sdk/react';
import { Ionicons } from '@expo/vector-icons';
import { DefaultChatTransport } from 'ai';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetch as expoFetch } from 'expo/fetch';
import { EditorState } from 'prosemirror-state';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function MockChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const tripId = params.id as string;
  const initialMessage = params.initialMessage as string | undefined;

  const [inputText, setInputText] = useState('');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());
  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [locationGraph, setLocationGraph] = useState<LocationGraph | null>(null);
  const lastFetchedGraphKey = useRef<string>('');
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const initialMessageSentRef = useRef(false);

  // Load trip on mount first
  useEffect(() => {
    console.log('process.env.NODE_ENV', process.env.NODE_ENV);
    async function loadTripData() {
      try {
        setIsLoadingTrip(true);
        const trip = await getTrip(tripId);
        if (trip) {
          setCurrentTrip(trip);
        } else {
          console.warn('Trip not found:', tripId);
          router.back();
        }
      } catch (error) {
        console.error('Error loading trip:', error);
      } finally {
        setIsLoadingTrip(false);
      }
    }
    loadTripData();
  }, [tripId]);

  // API URL for chat with Firecrawl tool support
  const apiUrl = generateAPIUrl('/api/chat-simple');

  // Use the AI SDK useChat hook
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      api: apiUrl,
    }),
    onError: (error) => {
      console.error('Chat error:', error);
    },
    initialMessages: currentTrip?.messages || [],
    id: tripId, // Use trip ID as chat session ID
  });

  const {
    messages = [],
    setMessages,
    sendMessage,
    status = 'idle',
    error
  } = chatHelpers;

  const isLoading = status === ('in_progress' as any) || status === 'loading';

  // Only log status changes, not every render
  const previousStatusRef = useRef(status);
  useEffect(() => {
    if (previousStatusRef.current !== status) {
      console.log('[TripChat] Status changed from', previousStatusRef.current, 'to', status);
      previousStatusRef.current = status;
    }
  }, [status]);

  // Restore messages when trip loads
  useEffect(() => {
    if (currentTrip && currentTrip.messages.length > 0 && messages.length === 0) {
      console.log('[TripChat] Restoring messages from trip:', currentTrip.messages.length);
      setMessages(currentTrip.messages);
    }
  }, [currentTrip, messages.length, setMessages]);

  // Send initial message if provided from URL input
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current && sendMessage && currentTrip) {
      console.log('[TripChat] Sending initial message:', initialMessage);
      initialMessageSentRef.current = true;
      sendMessage({ text: initialMessage });
    }
  }, [initialMessage, sendMessage, currentTrip]);

  // Restore ProseMirror document when trip loads
  useEffect(() => {
    if (currentTrip && !editorState) {
      // Restore from itineraries array (use the latest one)
      if (currentTrip.itineraries && currentTrip.itineraries.length > 0) {
        const latestItinerary = currentTrip.itineraries[currentTrip.itineraries.length - 1];
        console.log('[TripChat] Restoring ProseMirror document from itineraries array');
        const restoredState = stateFromJSON(latestItinerary.document);
        console.log('[TripChat] Restored document has', restoredState.doc.content.childCount, 'children');

        // Log first node to check content
        if (restoredState.doc.content.childCount > 0) {
          const firstNode = restoredState.doc.content.child(0);
          console.log('[TripChat] First node in restored doc:', firstNode.type.name, 'content:', firstNode.textContent.substring(0, 50));
        }

        setEditorState(restoredState);
        // No longer needed - we use node IDs
        // setHasEdited(true);
      }
    }
  }, [currentTrip, editorState]);

  // Save messages whenever they change (but skip if we're processing itinerary)
  const skipAutoSaveRef = useRef(false);

  useEffect(() => {
    if (!currentTrip || messages.length === 0) return;

    // Skip auto-save if we're in the middle of processing itinerary
    if (skipAutoSaveRef.current) {
      console.log('[TripChat] Skipping auto-save due to itinerary processing');
      skipAutoSaveRef.current = false;
      return;
    }

    // Save messages immediately when they change
    console.log('[TripChat] Saving messages:', messages.length);
    const updatedTrip = {
      ...currentTrip,
      messages: messages,
      itineraries: currentTrip.itineraries || [],
      modifications: currentTrip.modifications || [],
    };

    saveTrip(updatedTrip).then(() => {
      console.log('[TripChat] Messages saved successfully');
    }).catch(error => {
      console.error('[TripChat] Failed to save messages:', error);
    });
  }, [messages]); // Only depend on messages, not on currentTrip to avoid loops

  // Parse and save itinerary document for messages that need it
  const hasProcessedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Process messages that have itinerary content but no parsed document
    console.log('[TripChat-Processing] Effect running. Trip:', !!currentTrip, 'Messages:', messages.length, 'Loading:', isLoading);

    if (currentTrip && messages.length > 0 && !isLoading) {
      console.log('[TripChat-Processing] Checking for itinerary content to process.');

      // Find the last assistant message that might contain itinerary
      const lastAssistantMessage = messages.findLast((msg: any) => msg.role === 'assistant');
      console.log('[TripChat] Found last assistant message:', !!lastAssistantMessage);

      if (lastAssistantMessage) {
        // Check if we already have an itinerary for this message
        const existingItinerary = currentTrip.itineraries?.find(
          (it: any) => it.messageId === lastAssistantMessage.id
        );

        const alreadyProcessed = hasProcessedRef.current.has(lastAssistantMessage.id) || existingItinerary;
        console.log('[TripChat] Message already processed?', alreadyProcessed, 'ID:', lastAssistantMessage.id);

        if (!alreadyProcessed) {
          console.log('[TripChat] Last message parts:', lastAssistantMessage.parts);

          // Check if this message has itinerary content
          const textContent = lastAssistantMessage.parts?.filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('') || '';

          console.log('[TripChat] Text content preview:', textContent.substring(0, 200), '...');

          // Check for itinerary tag (with or without attributes)
          const hasItineraryHTML = textContent.includes('<itinerary') && textContent.includes('</itinerary>');

          // We no longer check for parts, just process if there's itinerary HTML
          console.log('[TripChat] Has itinerary HTML:', hasItineraryHTML);
          console.log('[TripChat] Existing itineraries count:', currentTrip.itineraries?.length || 0);

        if (hasItineraryHTML) {
          // Mark this message as processed
          hasProcessedRef.current.add(lastAssistantMessage.id);
          console.log('[TripChat] Processing itinerary content for message:', lastAssistantMessage.id);

          // Extract and parse the itinerary content (with optional center and radius attributes)
          // First, extract the full opening tag to parse attributes flexibly
          const openingTagMatch = textContent.match(/<itinerary([^>]*)>/);
          const itineraryMatch = textContent.match(/<itinerary[^>]*>([\s\S]*?)<\/itinerary>/);

          if (itineraryMatch) {
            const itineraryHTML = itineraryMatch[1];

            // Parse attributes from opening tag (handle any order)
            let centerStr: string | null = null;
            let radiusStr: string | null = null;

            if (openingTagMatch && openingTagMatch[1]) {
              const attrs = openingTagMatch[1];
              const centerMatch = attrs.match(/center="([^"]+)"/);
              const radiusMatch = attrs.match(/radius="([^"]+)"/);
              centerStr = centerMatch ? centerMatch[1] : null;
              radiusStr = radiusMatch ? radiusMatch[1] : null;
            }

            console.log('[TripChat] Extracted itinerary attributes:', { centerStr, radiusStr });

            // Parse and apply map positioning from center + radius if provided
            if (centerStr && radiusStr) {
              try {
                const [lat, lng] = centerStr.split(',').map(s => parseFloat(s.trim()));
                const radiusKm = parseFloat(radiusStr);

                if (!isNaN(lat) && !isNaN(lng) && !isNaN(radiusKm)) {
                  console.log('[TripChat] Calculating map bounds from center:', {lat, lng}, 'radius:', radiusKm, 'km');

                  const bounds = getBoundingBoxFromCenterRadius({ lat, lng }, radiusKm);
                  const viewState = getViewStateFromBounds(
                    bounds,
                    screenWidth,
                    screenHeight * 0.4 // Map takes 40% of screen height
                  );

                  console.log('[TripChat] Setting map to center:', viewState.center, 'zoom:', viewState.zoom);
                  setMapCenter(viewState.center);
                  setMapZoom(viewState.zoom);
                }
              } catch (error) {
                console.error('[TripChat] Failed to parse itinerary center/radius:', error);
              }
            }

            try {
              // Parse HTML to ProseMirror
              const parsed = parseHTMLToProseMirror(itineraryHTML);
              const proseMirrorJSON = stateToJSON(parsed.state);

              // Extract first heading to use as trip title if still "New Trip"
              let newTitle = currentTrip.title;
              if (currentTrip.title === 'New Trip') {
                // Look for the first heading in the document
                const doc = parsed.doc;
                let firstHeading: string | null = null;

                doc.descendants((node) => {
                  if (!firstHeading && node.type.name === 'heading') {
                    firstHeading = node.textContent;
                    return false; // Stop traversing
                  }
                  return true; // Continue traversing
                });

                if (firstHeading && firstHeading.trim().length > 0) {
                  newTitle = firstHeading.trim();
                  console.log('[TripChat] Extracted trip title from first heading:', newTitle);
                }
              }

              // Create new itinerary entry
              const newItinerary = {
                messageId: lastAssistantMessage.id,
                document: proseMirrorJSON,
                createdAt: Date.now()
              };

              // Add to itineraries array (or create it if it doesn't exist)
              const updatedItineraries = [
                ...(currentTrip.itineraries || []),
                newItinerary
              ];

              // Save the updated trip with the new itinerary (and possibly new title)
              const updatedTrip = {
                ...currentTrip,
                title: newTitle,
                messages: messages, // Keep messages as-is
                itineraries: updatedItineraries,
                modifications: currentTrip.modifications || [],
              };

              console.log('[TripChat] Added itinerary to array. Total itineraries:', updatedItineraries.length);

              saveTrip(updatedTrip).then(() => {
                console.log('[TripChat] Successfully saved trip with itinerary in array');
                setCurrentTrip(updatedTrip);
                // Store the parsed state for editing (use the latest itinerary)
                setEditorState(parsed.state);
              }).catch(error => {
                console.error('[TripChat] Failed to save trip:', error);
              });
            } catch (parseError) {
              console.error('[TripChat] Failed to parse itinerary HTML:', parseError);
            }
          }
        } else {
            console.log('[TripChat] No itinerary content in last assistant message');
          }
        } else {
          console.log('[TripChat] Message was already processed earlier');
        }
      } else {
        console.log('[TripChat] No assistant message with unprocessed itinerary content found');
      }
    }
  }, [currentTrip, messages, isLoading, editorState, setMessages]);

  // Toggle collapse state for a message
  const toggleMessageCollapse = useCallback((messageId: string) => {
    setCollapsedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);


  // Get context for sharing locations with layout
  const { updateVisibleLocations, setRoutes, showItinerary, setShowItinerary, setMapCenter, setMapZoom } = useMockContext();

  // Track visible locations based on focused node
  const [visibleLocations, setVisibleLocations] = useState<Array<{
    name: string;
    lat: number;
    lng: number;
    color?: string;
    photoName?: string;
    geoId?: string;
    transportFrom?: string;
    transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit';
  }>>();

  // Process location graph when visible locations change
  useEffect(() => {
    if (!currentTrip || isLoadingTrip || !visibleLocations || visibleLocations.length === 0) {
      setLocationGraph(null);
      return;
    }

    // Build location graph from visible locations
    const locationsWithDescription = visibleLocations.map((loc, index) => ({
      id: loc.geoId || `${loc.name}-${loc.lat}-${loc.lng}`,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      photoName: loc.photoName,
      colorIndex: index % 10, // Use simple color cycling
      geoId: loc.geoId,
      transportFrom: loc.transportFrom,
      transportProfile: loc.transportProfile,
    }));

    const graph = buildLocationGraph(locationsWithDescription);
    enhanceGraphWithDistances(graph);
    setLocationGraph(graph);

    console.log('[TripChat] Location Graph (focused node):', summarizeGraph(graph));
  }, [visibleLocations, currentTrip, isLoadingTrip]);

  // Fetch routes when location graph changes
  useEffect(() => {
    if (!locationGraph || locationGraph.edges.length === 0) {
      return;
    }

    // Create a stable key for the current graph edges to detect real changes
    const graphKey = locationGraph.edges
      .map(e => `${e.from}-${e.to}-${e.profile}`)
      .sort()
      .join('|');

    // Only fetch if the graph has actually changed
    if (lastFetchedGraphKey.current === graphKey) {
      return;
    }

    console.log('[TripChat] Graph changed, fetching routes...');
    lastFetchedGraphKey.current = graphKey;

    const fetchRoutes = async () => {
      const routePromises: Promise<RouteWithMetadata | null>[] = [];

      locationGraph.edges.forEach(edge => {
        const fromNode = locationGraph.getNode(edge.from);
        const toNode = locationGraph.getNode(edge.to);

        if (fromNode && toNode) {
          const waypoints: Waypoint[] = [
            { lat: fromNode.lat, lng: fromNode.lng },
            { lat: toNode.lat, lng: toNode.lng }
          ];

          const fetchPromise = fetchRouteWithCache(edge.profile, waypoints)
            .then(routeData => ({
              ...routeData,
              id: `${edge.from}-to-${edge.to}`,
              fromId: edge.from,
              toId: edge.to,
              profile: edge.profile
            } as RouteWithMetadata))
            .catch(error => {
              console.error(`Failed to fetch route from ${edge.from} to ${edge.to}:`, error);
              return null;
            });

          routePromises.push(fetchPromise);
        }
      });

      const fetchedRoutes = await Promise.all(routePromises);
      const validRoutes = fetchedRoutes.filter((r): r is RouteWithMetadata => r !== null);

      console.log('[TripChat] Fetched routes:', validRoutes.length);
      setRoutes(validRoutes);
    };

    fetchRoutes();
  }, [locationGraph, setRoutes]);

  // Handle node focus from ProseMirror viewer
  const handleNodeFocus = useCallback((nodeId: string | null) => {
    console.log('[TripChat] Node focus changed to:', nodeId);
    setFocusedNodeId(nodeId);

    // Extract locations from the focused node if editorState is available
    if (!nodeId || !editorState) {
      setVisibleLocations([]);
      updateVisibleLocations([]);
      return;
    }

    // Find the node with this ID in the document
    const locations: Array<{name: string, lat: number, lng: number, color?: string, photoName?: string, geoId?: string, transportFrom?: string, transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit'}> = [];

    editorState.doc.descendants((node) => {
      if (node.attrs?.id === nodeId) {
        // Extract geo-marks from this node's content
        const geoMarks = extractGeoMarks(node);
        console.log('[TripChat] Found', geoMarks.length, 'geo-marks in node:', nodeId);
        geoMarks.forEach(({ attrs }) => {
          const { placeName, lat, lng, geoId } = attrs;
          const latNum = parseFloat(lat);
          const lngNum = parseFloat(lng);

          if (lat && lng && !isNaN(latNum) && !isNaN(lngNum)) {
            locations.push({
              name: placeName,
              lat: latNum,
              lng: lngNum,
              geoId,
              photoName: attrs.photoName,
              color: undefined, // Will be assigned by index
              transportFrom: attrs.transportFrom,
              transportProfile: attrs.transportProfile,
            });
          }
        });
        return false; // Stop traversing once we found the node
      }
    });

    // Update visible locations
    setVisibleLocations(locations);

    // Update context for map display
    const mappedLocations = locations.map((loc, idx) => ({
      id: loc.geoId || `loc-${idx}`,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      colorIndex: idx % 10,
      photoName: loc.photoName,
      geoId: loc.geoId
    }));

    console.log('[Focus-based] Showing locations from focused node:', mappedLocations.map(l => l.name));
    updateVisibleLocations(mappedLocations);
  }, [editorState, updateVisibleLocations]);

  // Handle sending messages
  const handleSendMessage = async () => {
    if (!inputText?.trim() || isLoading) return;

    const message = inputText.trim();
    setInputText('');

    if (sendMessage) {
      try {
        await sendMessage({ text: message });
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  // Combine styles
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    loadingContainer: {
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
      zIndex: 10,
    },
    backButton: {
      padding: 4,
      marginRight: 12,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: '#111827',
    },
    itineraryToggle: {
      padding: 8,
      marginLeft: 8,
    },
    headerSpacer: {
      width: 40,
    },
    keyboardView: {
      flex: 1,
    },
    chatContainer: {
      flex: 1,
      flexDirection: 'column',
      backgroundColor: '#ffffff',
    },
    messagesWrapper: {
      flex: 1,
      backgroundColor: '#ffffff',
    },
    messagesContentEmpty: {
      padding: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 16,
      color: '#6b7280',
      textAlign: 'center',
      marginTop: 8,
    },
    messageWrapper: {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowRadius: 8,
      overflow: 'hidden',
    },
    errorContainer: {
      padding: 12,
      backgroundColor: '#fee2e2',
      borderRadius: 8,
      marginTop: 8,
      marginHorizontal: 12,
    },
    errorText: {
      fontSize: 14,
      color: '#dc2626',
    },
    inputContainer: {
      height: 80,
      flexDirection: 'row',
      padding: 16,
      backgroundColor: 'white',
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: '#f3f4f6',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      fontSize: 14,
      maxHeight: 100,
      marginRight: 8,
    },
    sendButton: {
      backgroundColor: '#3498DB',
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '600',
    },
  });

  // Show loading screen while trip is loading
  if (isLoadingTrip || !currentTrip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading trip...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with back button and trip title */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentTrip.title}
        </Text>
        <TouchableOpacity
          style={styles.itineraryToggle}
          onPress={() => setShowItinerary(!showItinerary)}
        >
          <Ionicons
            name={showItinerary ? "list" : "list-outline"}
            size={24}
            color="#111827"
          />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.chatContainer}>

            {/* Messages and content area */}
            <View style={styles.messagesWrapper}>
              {messages.length === 0 && (
                <View style={styles.messagesContentEmpty}>
                  <Text style={styles.emptyText}>
                    Try sharing a travel guide URL like:{'\n'}
                    "Check out this Barcelona guide: https://www.ricksteves.com/europe/spain/barcelona"{'\n\n'}
                    I can extract locations from travel blogs and show them on the map!
                  </Text>
                </View>
              )}

              {/* Render regular chat messages */}
              {messages.map((message, msgIndex) => {
                const textContent = message.parts?.filter((part: any) => part.type === 'text')
                  .map((part: any) => part.text)
                  .join('') || (message as any).content || '';

                const hasItineraryContent = textContent.includes('<itinerary>') && textContent.includes('</itinerary>');
                const isCollapsed = collapsedMessages.has(message.id);

                // Find if this message has a parsed itinerary
                const messageItinerary = currentTrip?.itineraries?.find(
                  (it: any) => it.messageId === message.id
                );

                // Only show non-itinerary messages and toggle buttons
                if (!messageItinerary) {
                  return (
                    <View key={message.id} style={{ marginBottom: msgIndex < messages.length - 1 ? 8 : 0, paddingHorizontal: 12 }}>
                      {/* Show collapse toggle for assistant messages */}
                      {message.role === 'assistant' && textContent && (
                        <TouchableOpacity
                          onPress={() => toggleMessageCollapse(message.id)}
                          style={{ padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 4 }}
                        >
                          <Text style={{ fontSize: 14, color: '#666' }}>
                            {isCollapsed ? 'Show response' : 'Hide response'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Show content if not collapsed */}
                      {!isCollapsed && !hasItineraryContent && textContent && (
                        <View style={{ padding: 12, backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f5f5f5', borderRadius: 8 }}>
                          <Text style={{ fontSize: 14 }}>{textContent}</Text>
                        </View>
                      )}
                    </View>
                  );
                }
                return null;
              })}

              {/* Show ProseMirror viewer for itinerary content if available */}
              {currentTrip?.itineraries && currentTrip.itineraries.length > 0 && editorState && (
                <View style={{ flex: 1 }}>
                  <ProseMirrorViewerWrapper
                    content={editorState.doc.toJSON()}
                    onNodeFocus={handleNodeFocus}
                    focusedNodeId={focusedNodeId}
                    height="100%"
                  />
                </View>
              )}

              {isLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#2ECC71" />
                  <Text style={styles.loadingText}>Assistant is thinking...</Text>
                </View>
              )}

              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>Error: {error.message}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Input area at the bottom */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about travel destinations or share a URL..."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={1000}
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>
    </View>
  );
}
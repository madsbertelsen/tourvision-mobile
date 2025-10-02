import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MessageElementWithFocus, FlatElement, messageElementWithFocusStyles } from '@/components/MessageElementWithFocus';
import { MessageActionSheet } from '@/components/MessageActionSheet';
import { useMockContext } from '@/contexts/MockContext';
import { EditorState } from 'prosemirror-state';
import { parseHTMLToProseMirror, parseJSONToProseMirror, proseMirrorToElements } from '@/utils/prosemirror-parser';
import { deleteNode, updateNodeText, stateToJSON } from '@/utils/prosemirror-transactions';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { getTrip, saveTrip, type SavedTrip } from '@/utils/trips-storage';
import { buildLocationGraph, enhanceGraphWithDistances, summarizeGraph, type LocationGraph } from '@/utils/location-graph';
import { fetchRouteWithCache, type Waypoint } from '@/utils/transportation-api';
import type { RouteWithMetadata } from '@/contexts/MockContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Color palette matching the map marker colors
const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

// Helper to get color index from color string
function getColorIndex(color?: string): number {
  if (!color) return 0;
  const index = MARKER_COLORS.indexOf(color);
  return index >= 0 ? index : 0;
}

// Helper to parse itinerary content with geo-marks
const parseItineraryContent = (htmlContent: string): Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3', text: string, color?: string, lat?: string | null, lng?: string | null, photoName?: string | null, description?: string | null, geoId?: string, transportFrom?: string, transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit'}>, isHeading?: boolean, headingLevel?: 1 | 2 | 3}> => {
  const chunks: Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3', text: string, color?: string, lat?: string | null, lng?: string | null, photoName?: string | null, description?: string | null, geoId?: string, transportFrom?: string, transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit'}>, isHeading?: boolean, headingLevel?: 1 | 2 | 3}> = [];
  let colorIndex = 0;
  const locationColors = new Map<string, string>();

  // Remove the itinerary wrapper tags
  let content = htmlContent.replace(/<\/?itinerary>/g, '');

  // Split content into elements while preserving order
  // Updated regex to also capture <ul> with all its <li> children
  const elementRegex = /(<h[123]>[^<]+<\/h[123]>|<p>[\s\S]*?<\/p>|<ul>[\s\S]*?<\/ul>)/g;
  const elements = content.match(elementRegex) || [];

  // Group consecutive paragraphs together
  let currentParagraphGroup: string[] = [];

  const processParagraphGroup = () => {
    if (currentParagraphGroup.length === 0) return;

    // Combine all paragraphs in the group
    const combinedContent = currentParagraphGroup.join(' ');
    const parsedContent: Array<{type: 'text' | 'geo-mark', text: string, color?: string, lat?: string | null, lng?: string | null, photoName?: string | null, description?: string | null, geoId?: string, transportFrom?: string, transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit'}> = [];

    // Process the combined content for geo-marks
    const geoMarkRegex = /<span[^>]*class="geo-mark"[^>]*>([^<]+)<\/span>/g;
    let lastIndex = 0;
    let match;

    while ((match = geoMarkRegex.exec(combinedContent)) !== null) {
      // Add text before the geo-mark
      if (match.index > lastIndex) {
        const textBefore = combinedContent.substring(lastIndex, match.index).replace(/<[^>]+>/g, '').trim();
        if (textBefore) {
          parsedContent.push({type: 'text', text: textBefore});
        }
      }

      // Extract coordinates, photo, description, and transport attributes from the geo-mark
      const fullMatch = match[0];
      const locationName = match[1];
      const latMatch = fullMatch.match(/data-lat="([^"]+)"/);
      const lngMatch = fullMatch.match(/data-lng="([^"]+)"/);
      const photoNameMatch = fullMatch.match(/data-photo-name="([^"]+)"/);
      const descriptionMatch = fullMatch.match(/data-description="([^"]+)"/);
      const geoIdMatch = fullMatch.match(/data-geo-id="([^"]+)"/);
      const transportFromMatch = fullMatch.match(/data-transport-from="([^"]+)"/);
      const transportProfileMatch = fullMatch.match(/data-transport-profile="([^"]+)"/);

      const lat = latMatch ? latMatch[1] : null;
      const lng = lngMatch ? lngMatch[1] : null;
      const photoName = photoNameMatch ? photoNameMatch[1] : null;
      const description = descriptionMatch ? descriptionMatch[1].replace(/&quot;/g, '"') : null;
      const geoId = geoIdMatch ? geoIdMatch[1] : undefined;
      const transportFrom = transportFromMatch ? transportFromMatch[1] : undefined;
      const transportProfile = transportProfileMatch ? transportProfileMatch[1] as 'walking' | 'driving' | 'cycling' | 'transit' : undefined;

      console.log('[parseItineraryContent] Extracted geo-mark:', {
        locationName,
        lat,
        lng,
        photoName,
        description: description ? description.substring(0, 50) + '...' : null,
        geoId,
        transportFrom,
        transportProfile,
        fullMatch: fullMatch.substring(0, 200) + '...'
      });

      // Add the geo-mark with color
      if (!locationColors.has(locationName)) {
        locationColors.set(locationName, MARKER_COLORS[colorIndex % MARKER_COLORS.length]);
        colorIndex++;
      }
      parsedContent.push({
        type: 'geo-mark',
        text: locationName,
        color: locationColors.get(locationName),
        lat,
        lng,
        photoName,
        description,
        geoId,
        transportFrom,
        transportProfile
      });

      lastIndex = geoMarkRegex.lastIndex;
    }

    // Add remaining text after last geo-mark
    if (lastIndex < combinedContent.length) {
      const textAfter = combinedContent.substring(lastIndex).replace(/<[^>]+>/g, '').trim();
      if (textAfter) {
        parsedContent.push({type: 'text', text: textAfter});
      }
    }

    // If no geo-marks found, just add as plain text
    if (parsedContent.length === 0) {
      const cleanText = combinedContent.replace(/<[^>]+>/g, '').trim();
      if (cleanText) {
        parsedContent.push({type: 'text', text: cleanText});
      }
    }

    // Create combined text for display
    const fullText = parsedContent.map(item => item.text).join(' ').trim();
    if (fullText) {
      chunks.push({
        text: fullText,
        parsedContent
      });
    }

    // Clear the group
    currentParagraphGroup = [];
  };

  elements.forEach(element => {
    // Check if it's a heading
    const h1Match = element.match(/<h1>([^<]+)<\/h1>/);
    const h2Match = element.match(/<h2>([^<]+)<\/h2>/);
    const h3Match = element.match(/<h3>([^<]+)<\/h3>/);

    if (h1Match || h2Match || h3Match) {
      // Process any accumulated paragraphs before the heading
      processParagraphGroup();

      // Add the heading
      if (h1Match) {
        chunks.push({
          text: h1Match[1],
          parsedContent: [{type: 'h1', text: h1Match[1]}],
          isHeading: true,
          headingLevel: 1
        });
      } else if (h2Match) {
        chunks.push({
          text: h2Match[1],
          parsedContent: [{type: 'h2', text: h2Match[1]}],
          isHeading: true,
          headingLevel: 2
        });
      } else if (h3Match) {
        chunks.push({
          text: h3Match[1],
          parsedContent: [{type: 'h3', text: h3Match[1]}],
          isHeading: true,
          headingLevel: 3
        });
      }
    } else if (element.startsWith('<ul>')) {
      // Process any accumulated paragraphs before the list
      processParagraphGroup();

      // Handle unordered list - extract all list items and treat as a paragraph group
      const listContent = element.replace(/<\/?ul>/g, '').trim();
      const listItems = listContent.match(/<li>[\s\S]*?<\/li>/g) || [];

      // Process each list item and add to a temporary paragraph group
      const listParagraphs: string[] = [];
      listItems.forEach(item => {
        const itemContent = item.replace(/<\/?li>/g, '').trim();
        if (itemContent) {
          // Add bullet point for visual indication in text
          listParagraphs.push('• ' + itemContent);
        }
      });

      // Process list items as a paragraph group
      if (listParagraphs.length > 0) {
        currentParagraphGroup = listParagraphs;
        processParagraphGroup();
      }
    } else {
      // It's a paragraph - add to current group
      const paragraph = element.replace(/<\/?p>/g, '').trim();
      if (paragraph) {
        currentParagraphGroup.push(paragraph);
      }
    }
  });

  // Process any remaining paragraphs
  processParagraphGroup();

  return chunks;
};

// Extract all locations from elements for map with their assigned colors and transport data
function extractAllLocations(elements: FlatElement[]) {
  const locations: Array<{name: string, lat: number, lng: number, color?: string, photoName?: string, geoId?: string, transportFrom?: string, transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit'}> = [];
  const seen = new Set<string>();

  elements.forEach(element => {
    // Skip deleted elements
    if (element.isDeleted) return;

    if (element.parsedContent) {
      element.parsedContent.forEach((item: any) => {
        if (item.type === 'geo-mark' && item.lat && item.lng) {
          const key = `${item.text}-${item.lat}-${item.lng}`;
          if (!seen.has(key)) {
            seen.add(key);
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            if (!isNaN(lat) && !isNaN(lng) && item.lat !== 'PENDING' && item.lng !== 'PENDING') {
              const location = {
                name: item.text,
                lat,
                lng,
                color: item.color, // Preserve the color from parsedContent
                photoName: item.photoName || undefined,
                geoId: item.geoId,
                transportFrom: item.transportFrom,
                transportProfile: item.transportProfile
              };
              console.log('[extractAllLocations] Adding location:', location);
              locations.push(location);
            }
          }
        }
      });
    }
  });

  console.log('[extractAllLocations] Total locations extracted:', locations.length);
  return locations;
}

export default function MockChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const tripId = params.id as string;

  const [inputText, setInputText] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const messagesScrollRef = useRef<ScrollView>(null);
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());
  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [locationGraph, setLocationGraph] = useState<LocationGraph | null>(null);
  const lastFetchedGraphKey = useRef<string>('');
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedElement, setSelectedElement] = useState<FlatElement | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [flatElements, setFlatElements] = useState<FlatElement[]>([]);

  // Load trip on mount first
  useEffect(() => {
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

  const isLoading = status === ('in_progress' as any);

  // Restore messages when trip loads
  useEffect(() => {
    if (currentTrip && currentTrip.messages.length > 0 && messages.length === 0) {
      console.log('[TripChat] Restoring messages from trip:', currentTrip.messages.length);
      setMessages(currentTrip.messages);
    }
  }, [currentTrip, messages.length, setMessages]);

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

  // Handle long press on element
  const handleElementLongPress = useCallback((element: FlatElement) => {
    setSelectedElement(element);
    setActionSheetVisible(true);
  }, []);

  // Handle edit save using ProseMirror transactions
  const handleEditSave = useCallback(async (elementId: string, newText: string) => {
    if (!editorState) {
      // Fallback to direct manipulation if no ProseMirror state
      setFlatElements(prev => prev.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            text: newText,
            isEdited: true,
            originalText: el.originalText || el.text,
          };
        }
        return el;
      }));
      return;
    }

    // Find the element with its document position
    const element = flatElements.find(el => el.id === elementId);
    if (!element || element.documentPos === undefined || element.nodeSize === undefined) {
      console.error('Element not found or missing document position:', elementId);
      return;
    }

    // Apply ProseMirror transaction
    const newState = updateNodeText(editorState, element.documentPos, element.nodeSize, newText);
    setEditorState(newState);

    // Convert updated document to elements
    const updatedElements = proseMirrorToElements(newState.doc);
    setFlatElements(updatedElements);

    // Save to local storage
    if (currentTrip) {
      const updatedTrip = {
        ...currentTrip,
        itinerary_document: stateToJSON(newState),
        modifications: [
          ...(currentTrip.modifications || []),
          {
            elementId,
            type: 'edit' as const,
            originalText: element.text,
            newText,
            timestamp: Date.now(),
          }
        ]
      };
      await saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
    }
  }, [editorState, flatElements, currentTrip]);

  // Handle delete element using ProseMirror transactions
  const handleDeleteElement = useCallback(async (elementId: string) => {
    if (!editorState) {
      // Fallback to direct manipulation if no ProseMirror state
      setFlatElements(prev => prev.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            isDeleted: true,
          };
        }
        return el;
      }));
      setActionSheetVisible(false);
      return;
    }

    // Find the element with its document position
    const element = flatElements.find(el => el.id === elementId);
    if (!element || element.documentPos === undefined || element.nodeSize === undefined) {
      console.error('Element not found or missing document position:', elementId);
      return;
    }

    // Apply ProseMirror transaction
    const newState = deleteNode(editorState, element.documentPos, element.nodeSize);
    setEditorState(newState);

    // Convert updated document to elements
    const updatedElements = proseMirrorToElements(newState.doc);
    setFlatElements(updatedElements);

    // Save to local storage
    if (currentTrip) {
      const updatedTrip = {
        ...currentTrip,
        itinerary_document: stateToJSON(newState),
        modifications: [
          ...(currentTrip.modifications || []),
          {
            elementId,
            type: 'delete' as const,
            originalText: element.text,
            timestamp: Date.now(),
          }
        ]
      };
      await saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
    }

    setActionSheetVisible(false);
  }, [editorState, flatElements, currentTrip]);

  // Process messages and update flat elements when messages or editor state changes
  useEffect(() => {
    const elements: FlatElement[] = [];

    messages.forEach((message, msgIndex) => {
      const messageColor = 'transparent';
      const isCollapsed = collapsedMessages.has(message.id);

      // Check if message contains HTML content (itinerary)
      // Look for common HTML patterns that indicate itinerary content
      const hasHTMLContent = message.parts?.some((part: any) =>
        part.type === 'text' && (
          part.text?.includes('<itinerary>') ||
          part.text?.includes('<h1>') ||
          part.text?.includes('<h2>') ||
          part.text?.includes('<h3>') ||
          part.text?.includes('<ul>') ||
          part.text?.includes('geo-mark') ||
          (part.text?.includes('<p>') && part.text?.includes('</p>'))
        )
      );

      const textContent = message.parts?.filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('') || (message as any).content || '';

      // Debug logging for HTML detection
      if (textContent.includes('<')) {
        console.log('Message contains HTML-like content:', {
          messageId: message.id,
          hasHTMLContent,
          contentPreview: textContent.substring(0, 200)
        });
      }

      // Add collapse toggle button for assistant messages
      if (message.role === 'assistant' && textContent) {
        elements.push({
          id: `${message.id}-toggle`,
          type: 'toggle',
          messageId: message.id,
          messageColor: messageColor,
          text: isCollapsed ? 'Show response' : 'Hide response',
          height: 32,
          role: message.role as 'user' | 'assistant',
        });
      }

      // Only show content if not collapsed
      if (!isCollapsed) {
        // Add content elements
        if (hasHTMLContent) {
          // Parse HTML content using ProseMirror
          const { state, doc } = parseHTMLToProseMirror(textContent);

          // Store the ProseMirror state for this message
          // Note: We'll need to manage this properly in a useEffect

          // Convert ProseMirror document to renderable elements
          const pmElements = proseMirrorToElements(doc);

          console.log('Parsed HTML to ProseMirror, elements:', pmElements.length);

          // Add elements with message context
          pmElements.forEach(pmElement => {
            elements.push({
              ...pmElement,
              id: `${message.id}-${pmElement.id}`,
              messageId: message.id,
              messageColor: messageColor,
              role: message.role as 'user' | 'assistant',
              isItineraryContent: true,
            });
          });
        } else if (textContent) {
          // Regular text message
          elements.push({
            id: `${message.id}-content-0`,
            type: 'content',
            messageId: message.id,
            messageColor: messageColor,
            text: textContent,
            height: 0,
            role: message.role as 'user' | 'assistant',
          });
        }
      }

      // Add gap between messages (except after last)
      if (msgIndex < messages.length - 1) {
        elements.push({
          id: `gap-${msgIndex}`,
          type: 'gap',
          messageId: '',
          messageColor: '',
          height: 8,
        });
      }
    });

    // Update state with the processed elements
    setFlatElements(elements);

    // If we have HTML content and no editor state yet, create it
    const hasItineraryContent = elements.some(el => el.isItineraryContent);
    if (hasItineraryContent && !editorState) {
      // Find the last HTML message and parse it
      const lastHTMLMessage = messages.findLast((msg: any) => {
        const content = msg.parts?.find((part: any) => part.type === 'text')?.text || '';
        return content.includes('geo-mark') || content.includes('<p>');
      });

      if (lastHTMLMessage) {
        const htmlContent = lastHTMLMessage.parts?.find((part: any) => part.type === 'text')?.text || '';
        const { state } = parseHTMLToProseMirror(htmlContent);
        setEditorState(state);
      }
    }
  }, [messages, collapsedMessages, editorState]);

  // Get context for sharing locations with layout
  const { updateVisibleLocations, setRoutes } = useMockContext();

  // Track element positions
  const [elementPositions, setElementPositions] = useState<Map<string, {top: number, bottom: number}>>(new Map());

  // Track visible locations based on scroll
  const [visibleLocations, setVisibleLocations] = useState<Array<{name: string, lat: number, lng: number, color?: string, photoName?: string}>>([]);

  // Update visible locations as a side effect of scroll
  useEffect(() => {
    const newVisibleLocations: Array<{name: string, lat: number, lng: number, color?: string, photoName?: string}> = [];
    const seenLocations = new Set<string>();

    flatElements.forEach(element => {
      const position = elementPositions.get(element.id);
      if (position) {
        const itemTop = position.top - scrollOffset;
        const itemBottom = position.bottom - scrollOffset;

        // Check if this element is in view and not deleted
        if (itemTop < containerHeight && itemBottom > 0 && !element.isDeleted) {
          if (element.type === 'content' && element.parsedContent) {
            // Extract geo-marks from visible elements
            element.parsedContent.forEach((item: any) => {
              if (item.type === 'geo-mark' && item.lat && item.lng) {
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                  const locationKey = `${item.text}-${lat}-${lng}`;
                  if (!seenLocations.has(locationKey)) {
                    seenLocations.add(locationKey);
                    const location = {
                      name: item.text,
                      lat,
                      lng,
                      color: item.color,
                      photoName: item.photoName || undefined,
                      geoId: item.geoId || undefined
                    };
                    console.log('[visibleLocations] Adding visible location:', location);
                    newVisibleLocations.push(location);
                  }
                }
              }
            });
          }
        }
      }
    });

    console.log('[visibleLocations] Total visible locations:', newVisibleLocations.length);
    setVisibleLocations(newVisibleLocations);
    // Only update context if we have locations to show
    if (newVisibleLocations.length > 0) {
      const mappedLocations = newVisibleLocations.map((loc: any, idx) => ({
        id: loc.geoId || `loc-${idx}`,
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        color: loc.color,
        colorIndex: getColorIndex(loc.color),
        photoName: loc.photoName,
        geoId: loc.geoId
      }));
      console.log('[updateVisibleLocations] Passing to context:', mappedLocations);
      updateVisibleLocations(mappedLocations);
    }
  }, [scrollOffset, elementPositions, flatElements, containerHeight, updateVisibleLocations]);

  // Auto-save trip when messages or locations change
  useEffect(() => {
    if (!currentTrip || isLoadingTrip) return;

    const allLocations = extractAllLocations(flatElements);
    const locationsWithDescription = allLocations.map(loc => ({
      id: `${loc.name}-${loc.lat}-${loc.lng}`,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      photoName: loc.photoName,
      colorIndex: getColorIndex(loc.color),
      geoId: loc.geoId,
      transportFrom: loc.transportFrom,
      transportProfile: loc.transportProfile,
    }));

    // Build location graph from the locations
    if (locationsWithDescription.length > 0) {
      const graph = buildLocationGraph(locationsWithDescription);
      enhanceGraphWithDistances(graph);
      setLocationGraph(graph);

      // Log the graph summary for debugging
      console.log('[TripChat] Location Graph:', summarizeGraph(graph));
    }

    // Collect modifications from flatElements
    const modifications: SavedTrip['modifications'] = [];
    flatElements.forEach(element => {
      if (element.isEdited) {
        modifications.push({
          elementId: element.id,
          type: 'edit',
          originalText: element.originalText,
          newText: element.text,
          timestamp: Date.now(),
        });
      }
      if (element.isDeleted) {
        modifications.push({
          elementId: element.id,
          type: 'delete',
          originalText: element.text,
          timestamp: Date.now(),
        });
      }
    });

    const updatedTrip: SavedTrip = {
      ...currentTrip,
      messages,
      locations: locationsWithDescription,
      modifications: modifications.length > 0 ? modifications : undefined,
    };

    // Debounce save to avoid too frequent writes
    const timeoutId = setTimeout(() => {
      saveTrip(updatedTrip).catch(err => console.error('Error auto-saving trip:', err));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [messages, flatElements, currentTrip, isLoadingTrip]);

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

  // No longer needed - we track visible locations instead of focused location
  const handleLocationFocus = useCallback((locations: Array<{name: string, lat: number, lng: number}>) => {
    // This callback is no longer used but kept for compatibility
  }, []);

  // Handle sending messages
  const handleSendMessage = async () => {
    if (!inputText?.trim() || isLoading) return;

    const message = inputText.trim();
    setInputText('');

    if (sendMessage) {
      try {
        await sendMessage({ text: message });
        // Auto scroll to bottom after sending
        setTimeout(() => {
          messagesScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  // Get all locations for map (no longer used, we use visibleLocations instead)
  const allLocations = extractAllLocations(flatElements);

  // Combine styles
  const styles = StyleSheet.create({
    ...messageElementWithFocusStyles,
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
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
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
    headerSpacer: {
      width: 40,
    },
    keyboardView: {
      flex: 1,
    },
    chatContainer: {
      flex: 1,
      flexDirection: 'column',
    },
    messagesWrapper: {
      flex: 1,
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContent: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
    },
    messagesContentEmpty: {
      flex: 1,
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
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: 8,
      marginTop: 8,
      marginHorizontal: 12,
    },
    loadingText: {
      marginLeft: 8,
      fontSize: 14,
      color: '#6b7280',
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
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.chatContainer}>

            {/* Messages scrollable area with transparency and perspective */}
            <View
              style={[styles.messagesWrapper, { perspective: 1000 }]}
              onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
            >
              <ScrollView
                ref={messagesScrollRef}
                style={styles.messagesContainer}
                contentContainerStyle={[
                  styles.messagesContent,
                  messages.length === 0 && styles.messagesContentEmpty
                ]}
                onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y)}
                scrollEventThrottle={16}
              >
                {messages.length === 0 && (
                  <View>
                    <Text style={styles.emptyText}>
                      Try sharing a travel guide URL like:{'\n'}
                      "Check out this Barcelona guide: https://www.ricksteves.com/europe/spain/barcelona"{'\n\n'}
                      I can extract locations from travel blogs and show them on the map!
                    </Text>
                  </View>
                )}

                {flatElements.map((element) => {
                  if (element.type === 'gap') {
                    return <View key={element.id} style={{ height: element.height }} />;
                  }

                  return (
                    <View
                      key={element.id}
                      onLayout={(event) => {
                        const { y, height } = event.nativeEvent.layout;
                        setElementPositions(prev => {
                          const newMap = new Map(prev);
                          newMap.set(element.id, { top: y, bottom: y + height });
                          return newMap;
                        });
                      }}
                    >
                      <MessageElementWithFocus
                        element={element}
                        isVisible={true}
                        isFocused={(() => {
                          // Check if this element is in the visible viewport
                          const position = elementPositions.get(element.id);
                          if (position) {
                            const itemTop = position.top - scrollOffset;
                            const itemBottom = position.bottom - scrollOffset;
                            // Element is focused if it's visible in the viewport
                            return itemTop < containerHeight && itemBottom > 0;
                          }
                          return false;
                        })()}
                        isAboveFocus={false}
                        backgroundColor="transparent"
                        styles={styles}
                        onFocus={handleLocationFocus}
                        onToggleCollapse={toggleMessageCollapse}
                        onLongPress={handleElementLongPress}
                        onEditSave={handleEditSave}
                        onDelete={handleDeleteElement}
                        transitionDuration={300}
                      />
                    </View>
                  );
                })}

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
              </ScrollView>
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

      {/* Message Action Sheet */}
      <MessageActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        messagePreview={selectedElement?.text}
        actions={[
          {
            icon: '✏️',
            text: 'Edit',
            onPress: () => {
              // Will be handled by the inline edit mode in MessageElementWithFocus
              setActionSheetVisible(false);
            },
          },
          {
            icon: '🗑️',
            text: 'Delete',
            destructive: true,
            onPress: () => {
              if (selectedElement) {
                handleDeleteElement(selectedElement.id);
              }
            },
          },
        ]}
      />
    </View>
  );
}
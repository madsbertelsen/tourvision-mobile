import { MessageActionSheet } from '@/components/MessageActionSheet';
import { FlatElement, MessageElementWithFocus, messageElementWithFocusStyles } from '@/components/MessageElementWithFocus';
import type { RouteWithMetadata } from '@/contexts/MockContext';
import { useMockContext } from '@/contexts/MockContext';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { buildLocationGraph, enhanceGraphWithDistances, summarizeGraph, type LocationGraph } from '@/utils/location-graph';
import { parseHTMLToProseMirror, proseMirrorToElements } from '@/utils/prosemirror-parser';
import { deleteNodeByIndex, stateToJSON, stateFromJSON, updateNodeTextByIndex } from '@/utils/prosemirror-transactions';
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  // Restore ProseMirror document when trip loads
  useEffect(() => {
    if (currentTrip && currentTrip.itinerary_document && !editorState) {
      console.log('[TripChat] Restoring ProseMirror document from trip');
      const restoredState = stateFromJSON(currentTrip.itinerary_document);
      setEditorState(restoredState);
      setHasEdited(true); // Mark as edited since we have a saved document
    }
  }, [currentTrip, editorState]);

  // Save messages whenever they change
  useEffect(() => {
    if (!currentTrip || messages.length === 0) return;

    // Save messages immediately when they change
    console.log('[TripChat] Saving messages:', messages.length);
    const updatedTrip = {
      ...currentTrip,
      messages: messages,
      itinerary_document: currentTrip.itinerary_document,
      modifications: currentTrip.modifications || [],
    };

    saveTrip(updatedTrip).then(() => {
      console.log('[TripChat] Messages saved successfully');
    }).catch(error => {
      console.error('[TripChat] Failed to save messages:', error);
    });
  }, [messages]); // Only depend on messages, not on currentTrip to avoid loops

  // Save itinerary document when streaming completes (messages are saved separately)
  const previousIsLoading = useRef(isLoading);
  useEffect(() => {
    // Detect transition from loading to not loading (streaming completed)
    if (previousIsLoading.current && !isLoading && currentTrip && editorState) {
      console.log('[TripChat] Streaming completed, saving itinerary document');
      const updatedTrip = {
        ...currentTrip,
        messages: messages, // Include current messages
        itinerary_document: stateToJSON(editorState),
        modifications: currentTrip.modifications || [],
      };
      saveTrip(updatedTrip).then(() => {
        console.log('[TripChat] Successfully saved itinerary document after streaming');
        setCurrentTrip(updatedTrip);
      }).catch(error => {
        console.error('[TripChat] Failed to save itinerary document:', error);
      });
    }
    previousIsLoading.current = isLoading;
  }, [isLoading, currentTrip, editorState, messages]);

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

    // Find the element
    const element = flatElements.find(el => el.id === elementId);
    if (!element) {
      console.error('Element not found:', elementId);
      return;
    }

    // Find the actual current index in the document
    let actualIndex = -1;

    if (!hasEdited && element.documentPos !== undefined) {
      // If we haven't edited, documentPos should still be accurate
      actualIndex = element.documentPos;
      console.log('[handleEditSave] Using original documentPos:', actualIndex);
    } else {
      // After edits, we need to find by matching content
      let currentIndex = 0;

      editorState.doc.descendants((node, pos) => {
        if (node.isBlock && node.type.name !== 'doc') {
          // Try different matching strategies
          const nodeText = node.textContent.trim();
          const elementText = element.text?.trim();

          // Match if the texts are equal or if one starts with the other
          if (nodeText === elementText ||
              (elementText && nodeText.startsWith(elementText)) ||
              (elementText && elementText.startsWith(nodeText))) {
            actualIndex = currentIndex;
            console.log('[handleEditSave] Found matching node at index:', actualIndex);
            return false; // Stop searching
          }
          currentIndex++;
        }
      });
    }

    if (actualIndex === -1) {
      console.error('[handleEditSave] Could not find node in document with text:', element.text);
      return;
    }

    console.log('[handleEditSave] Found node at actual index:', actualIndex, 'originally reported as:', element.documentPos);

    // Apply ProseMirror transaction using the actual index
    const newState = updateNodeTextByIndex(editorState, actualIndex, newText);
    if (!newState) {
      console.error('Failed to update node text');
      return;
    }

    // Mark that we've edited the document immediately
    setHasEdited(true);

    // Update the editor state
    setEditorState(newState);

    // Force useEffect to trigger
    setUpdateCounter(prev => prev + 1);

    // Rebuild the elements from the new ProseMirror state immediately
    setFlatElements(prev => {
      // Keep non-itinerary elements
      const nonItineraryElements = prev.filter(el => !el.isItineraryContent);

      // Find the message ID for itinerary content
      const messageId = element.messageId;

      // Rebuild itinerary elements from the new state
      const pmElements = proseMirrorToElements(newState.doc, messageId);
      const formattedElements = pmElements.map((el, index) => ({
        ...el,
        id: `${messageId}-pm-${index}`,
        messageId: messageId,
        messageColor: element.messageColor,
        role: element.role,
        isItineraryContent: true,
      }));

      console.log('[handleEditSave] Rebuilt elements - non-itinerary:', nonItineraryElements.length, 'itinerary:', formattedElements.length);

      return [...nonItineraryElements, ...formattedElements];
    });

    // Save to local storage
    if (currentTrip) {
      console.log('[handleEditSave] Saving trip to local storage');
      const updatedTrip = {
        ...currentTrip,
        messages: messages, // Include messages to persist chat history
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
  }, [editorState, flatElements, currentTrip, messages]);

  // Handle delete element using ProseMirror transactions
  const handleDeleteElement = useCallback(async (elementId: string) => {
    console.log('[handleDeleteElement] Deleting element:', elementId);
    console.log('[handleDeleteElement] Current flatElements count:', flatElements.length);
    console.log('[handleDeleteElement] EditorState exists:', !!editorState);

    // Find the element to delete
    const elementToDelete = flatElements.find(el => el.id === elementId);
    if (!elementToDelete) {
      console.error('[handleDeleteElement] Element not found:', elementId);
      setActionSheetVisible(false);
      return;
    }

    console.log('[handleDeleteElement] Element to delete:', {
      id: elementToDelete.id,
      documentPos: elementToDelete.documentPos,
      isItineraryContent: elementToDelete.isItineraryContent,
      text: elementToDelete.text?.substring(0, 50)
    });

    // Check if this is itinerary content that should be managed by ProseMirror
    if (elementToDelete.isItineraryContent && editorState) {
      // Find the actual current index in the document
      // Use the documentPos directly if we haven't edited yet, or search by content
      let actualIndex = -1;

      if (!hasEdited && elementToDelete.documentPos !== undefined) {
        // If we haven't edited, documentPos should still be accurate
        actualIndex = elementToDelete.documentPos;
        console.log('[handleDeleteElement] Using original documentPos:', actualIndex);
      } else {
        // After edits, we need to find by matching content
        let currentIndex = 0;

        editorState.doc.descendants((node, pos) => {
          if (node.isBlock && node.type.name !== 'doc') {
            // Try different matching strategies
            const nodeText = node.textContent.trim();
            const elementText = elementToDelete.text?.trim();

            // Match if the texts are equal or if one starts with the other
            if (nodeText === elementText ||
                (elementText && nodeText.startsWith(elementText)) ||
                (elementText && elementText.startsWith(nodeText))) {
              actualIndex = currentIndex;
              console.log('[handleDeleteElement] Found matching node at index:', actualIndex);
              return false; // Stop searching
            }
            currentIndex++;
          }
        });
      }

      if (actualIndex === -1) {
        console.error('[handleDeleteElement] Could not find node in document with text:', elementToDelete.text);
        console.error('[handleDeleteElement] Document has these texts:',
          Array.from({ length: editorState.doc.content.childCount }, (_, i) => {
            const child = editorState.doc.content.child(i);
            return child.textContent.substring(0, 50);
          })
        );
        setActionSheetVisible(false);
        return;
      }

      console.log('[handleDeleteElement] Found node at actual index:', actualIndex, 'originally reported as:', elementToDelete.documentPos);

      // Apply ProseMirror transaction using the actual index
      const newState = deleteNodeByIndex(editorState, actualIndex);

      if (!newState) {
        console.error('[handleDeleteElement] Failed to delete node from ProseMirror document');
        setActionSheetVisible(false);
        return;
      }

      console.log('[handleDeleteElement] Successfully deleted from ProseMirror');
      console.log('[handleDeleteElement] Old doc size:', editorState.doc.content.size);
      console.log('[handleDeleteElement] New doc size:', newState.doc.content.size);

      // Set hasEdited immediately so the useEffect knows to use editorState
      setHasEdited(true);

      // Update the editor state and force a re-render
      setEditorState(newState);
      setUpdateCounter(prev => {
        console.log('[handleDeleteElement] Incrementing counter from', prev, 'to', prev + 1);
        return prev + 1;
      });

      console.log('[handleDeleteElement] States updated, should trigger useEffect');
      console.log('[handleDeleteElement] New doc has', newState.doc.content.childCount, 'children');

      // Force immediate UI update by clearing elements first
      setFlatElements([]);

      // Save to local storage
      if (currentTrip) {
        console.log('[handleDeleteElement] Saving trip to local storage');
        const existingMods = currentTrip.modifications || [];
        const newMod = {
          elementId,
          type: 'delete' as const,
          originalText: elementToDelete.text,
          timestamp: Date.now(),
        };
        const allMods = [...existingMods, newMod];

        const updatedTrip = {
          ...currentTrip,
          messages: messages, // Include the actual chat messages
          itinerary_document: stateToJSON(newState),
          modifications: allMods
        };

        console.log('[handleDeleteElement] Saving modifications:', allMods.length, 'total');
        console.log('[handleDeleteElement] Latest modification:', newMod);

        await saveTrip(updatedTrip);
        setCurrentTrip(updatedTrip);

        // Verify save
        setTimeout(async () => {
          const savedTrip = await getTrip(currentTrip.id);
          console.log('[handleDeleteElement] Verification - saved trip has modifications:', savedTrip?.modifications?.length);
        }, 100);
      }
    } else {
      // For non-ProseMirror elements, just filter them out
      console.log('[handleDeleteElement] Deleting non-ProseMirror element');
      setFlatElements(prev => prev.filter(el => el.id !== elementId));
    }

    setActionSheetVisible(false);
  }, [editorState, flatElements, currentTrip]);

  // Track if we've made any edits to the document
  const [hasEdited, setHasEdited] = useState(false);
  // Force re-render counter for triggering useEffect
  const [updateCounter, setUpdateCounter] = useState(0);
  // Counter for generating unique IDs that won't be reused

  // Process messages and update flat elements when messages or collapse state changes
  useEffect(() => {
    console.log('[useEffect] Running with updateCounter:', updateCounter, 'hasEdited:', hasEdited);
    const elements: FlatElement[] = [];

    messages.forEach((message, msgIndex) => {
      const messageColor = 'transparent';
      const isCollapsed = collapsedMessages.has(message.id);

      // Check if message contains itinerary content (complete or partial)
      const textContent = message.parts?.filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('') || (message as any).content || '';

      // Check for complete itinerary (has both opening and closing tags)
      const hasCompleteItinerary = textContent.includes('<itinerary>') &&
                                   textContent.includes('</itinerary>');

      // Check for partial itinerary (streaming, only has opening tag)
      const hasPartialItinerary = textContent.includes('<itinerary>') &&
                                  !textContent.includes('</itinerary>');

      // Consider it itinerary content if complete OR partial (for streaming)
      const hasItineraryContent = hasCompleteItinerary || hasPartialItinerary;

      // Debug logging for itinerary detection
      if (textContent.includes('<itinerary>')) {
        console.log('Message contains itinerary content:', {
          messageId: message.id,
          hasItineraryContent,
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
        if (hasItineraryContent) {
          // Extract the content between <itinerary> tags
          let itineraryHTML: string;

          if (hasCompleteItinerary) {
            // Complete itinerary: extract content between tags
            const itineraryMatch = textContent.match(/<itinerary>([\s\S]*?)<\/itinerary>/);
            itineraryHTML = itineraryMatch ? itineraryMatch[1] : '';
          } else if (hasPartialItinerary) {
            // Partial itinerary (streaming): extract everything after opening tag
            const openTagIndex = textContent.indexOf('<itinerary>');
            itineraryHTML = textContent.substring(openTagIndex + '<itinerary>'.length);
            // Add a closing tag to make it parseable (will be incomplete but renderable)
            if (!itineraryHTML.includes('</itinerary>')) {
              // Close any open tags to make partial content valid
              itineraryHTML = itineraryHTML.trim();
            }
          } else {
            itineraryHTML = '';
          }
          let doc;
          let state;

          // If we have edited the document, use the editorState as source of truth
          // Otherwise, parse the HTML content (important for streaming)
          if (hasEdited && editorState) {
            console.log('[useEffect] Using editorState as source, doc children:', editorState.doc.content.childCount);
            doc = editorState.doc;
            state = editorState;
          } else if (itineraryHTML && itineraryHTML.trim().length > 0) {
            // Only try to parse if we have non-empty HTML content
            try {
              // Parse only the itinerary HTML content (not the wrapping tags or other text)
              const parsed = parseHTMLToProseMirror(itineraryHTML);
              doc = parsed.doc;
              state = parsed.state;

              // Store the state if we don't have one yet and it's complete
              if (!editorState && hasCompleteItinerary) {
                setEditorState(state);
                // The save will be handled by the streaming completion effect
                console.log('[useEffect] EditorState created from parsed itinerary');
              }
            } catch (parseError) {
              console.warn('[useEffect] Failed to parse partial itinerary HTML:', parseError);
              // Fall back to showing as text during streaming
              doc = null;
              state = null;
            }
          } else {
            // No content to parse yet (early streaming state)
            doc = null;
            state = null;
          }

          // Only render ProseMirror elements if we have a valid document
          if (doc && state) {
            // Convert ProseMirror document to renderable elements
            const pmElements = proseMirrorToElements(doc, message.id);

            console.log('[useEffect] Rendering ProseMirror elements:', pmElements.length, 'hasEdited:', hasEdited);
            console.log('[useEffect] First few elements:', pmElements.slice(0, 3).map(el => ({ id: el.id, text: el.text?.substring(0, 30) })));

            // Add elements with message context
            // When edited, use unique IDs to force React to re-render
            pmElements.forEach((pmElement, index) => {
              const elementId = hasEdited
                ? `${message.id}-pm-${updateCounter}-${index}` // Include updateCounter for uniqueness
                : `${message.id}-pm-${index}`; // Original ID for streaming

              elements.push({
                ...pmElement,
                id: elementId,
                messageId: message.id,
                messageColor: messageColor,
                role: message.role as 'user' | 'assistant',
                isItineraryContent: true,
              });
            });
          } else if (hasPartialItinerary) {
            // During streaming, show a loading message instead of raw HTML
            elements.push({
              id: `${message.id}-loading`,
              type: 'content',
              messageId: message.id,
              messageColor: messageColor,
              text: 'Loading itinerary...',
              height: 0,
              role: message.role as 'user' | 'assistant',
            });
          }
        } else if (textContent && !hasItineraryContent) {
          // Regular text message (not itinerary)
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
    console.log('[useEffect] Setting flatElements with', elements.length, 'total elements');
    console.log('[useEffect] Element IDs:', elements.map(el => el.id));
    setFlatElements(elements);
  }, [messages, collapsedMessages, hasEdited, editorState, updateCounter]); // Dependencies for proper updates

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

  // Process location graph when flatElements change (but don't auto-save)
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

    // AUTO-SAVE DISABLED - was overwriting modifications
    // Saving is now only done explicitly in handleDeleteElement and handleEditSave
  }, [flatElements, currentTrip, isLoadingTrip]);

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
              style={[styles.messagesWrapper, { perspective: '1000' }]}
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
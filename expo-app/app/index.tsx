import { MapViewWrapper } from '@/components/MapViewWrapper';
import { MessageElement, FlatElement, Location } from '@/components/MessageElement';
import { NativeItineraryViewer } from '@/components/NativeItineraryViewer';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import React from 'react';
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

// Color palette for location markers
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

// Types are now imported from MessageElement component

// MessageElement component is now imported from separate file

// Helper to parse itinerary HTML into chunks with geo-mark tracking
const parseItineraryContent = (htmlContent: string): Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3', text: string, color?: string, lat?: string | null, lng?: string | null}>, isHeading?: boolean, headingLevel?: 1 | 2 | 3}> => {
  const chunks: Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3', text: string, color?: string, lat?: string | null, lng?: string | null}>, isHeading?: boolean, headingLevel?: 1 | 2 | 3}> = [];
  let colorIndex = 0;
  const locationColors = new Map<string, string>();

  // Remove the itinerary wrapper tags
  let content = htmlContent.replace(/<\/?itinerary>/g, '');

  // Split content into elements while preserving order
  const elementRegex = /(<h[123]>[^<]+<\/h[123]>|<p>[\s\S]*?<\/p>)/g;
  const elements = content.match(elementRegex) || [];

  elements.forEach(element => {
    // Check if it's a heading
    const h1Match = element.match(/<h1>([^<]+)<\/h1>/);
    const h2Match = element.match(/<h2>([^<]+)<\/h2>/);
    const h3Match = element.match(/<h3>([^<]+)<\/h3>/);

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
    } else {
      // It's a paragraph - process for geo-marks
      const paragraph = element.replace(/<\/?p>/g, '').trim();
      if (!paragraph) return;

      const parsedContent: Array<{type: 'text' | 'geo-mark', text: string, color?: string, lat?: string | null, lng?: string | null}> = [];

      // Find all geo-marks in this paragraph with their attributes
      const geoMarkRegex = /<span[^>]*class="geo-mark"[^>]*>([^<]+)<\/span>/g;
      let lastIndex = 0;
      let match;

      while ((match = geoMarkRegex.exec(paragraph)) !== null) {
        // Add text before the geo-mark
        if (match.index > lastIndex) {
          const textBefore = paragraph.substring(lastIndex, match.index).replace(/<[^>]+>/g, '').trim();
          if (textBefore) {
            parsedContent.push({type: 'text', text: textBefore});
          }
        }

        // Extract coordinates from the geo-mark
        const fullMatch = match[0];
        const locationName = match[1];
        const latMatch = fullMatch.match(/data-lat="([^"]+)"/);
        const lngMatch = fullMatch.match(/data-lng="([^"]+)"/);
        const lat = latMatch ? latMatch[1] : null;
        const lng = lngMatch ? lngMatch[1] : null;

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
          lng
        });

        lastIndex = geoMarkRegex.lastIndex;
      }

      // Add remaining text after last geo-mark
      if (lastIndex < paragraph.length) {
        const textAfter = paragraph.substring(lastIndex).replace(/<[^>]+>/g, '').trim();
        if (textAfter) {
          parsedContent.push({type: 'text', text: textAfter});
        }
      }

      // If no geo-marks found, just add as plain text
      if (parsedContent.length === 0) {
        const cleanText = paragraph.replace(/<[^>]+>/g, '').trim();
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
    }
  });

  return chunks;
};

export default function SimpleChatScreen() {
  const [inputText, setInputText] = React.useState('');
  const [mapLocations, setMapLocations] = React.useState<Location[]>([]);
  const messagesScrollRef = React.useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(0);

  // Square map size based on screen width
  const mapSize = screenWidth;

  // API URL for chat
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
  });

  const {
    messages = [],
    sendMessage,
    status = 'idle',
    error
  } = chatHelpers;

  const isLoading = status === ('in_progress' as any);

  // Convert messages to flat element structure
  const flatElements = React.useMemo(() => {
    const elements: FlatElement[] = [];

    messages.forEach((message, msgIndex) => {
      const messageColor = message.role === 'user' ? '#3498DB' : '#2ECC71';

      // Check if message contains HTML content (itinerary)
      const hasHTMLContent = message.parts?.some((part: any) =>
        part.type === 'text' && part.text?.includes('<h1>') && part.text?.includes('geo-mark')
      );

      const textContent = message.parts?.filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('') || (message as any).content || '';

      // Add header
      elements.push({
        id: `${message.id}-header`,
        type: 'header',
        messageId: message.id,
        messageColor: messageColor,
        height: 0, // Let it grow naturally
        role: message.role as 'user' | 'assistant',
        timestamp: new Date((message as any).createdAt || Date.now()),
      });

      // Add content
      if (hasHTMLContent) {
        // Parse itinerary HTML into chunks
        const chunks = parseItineraryContent(textContent);
        chunks.forEach((chunk, i) => {
          elements.push({
            id: `${message.id}-content-${i}`,
            type: 'content',
            messageId: message.id,
            messageColor: messageColor,
            text: chunk.text,
            parsedContent: chunk.parsedContent,
            height: 0, // Let content grow naturally
            isItineraryContent: true,
            isHeading: chunk.isHeading,
            headingLevel: chunk.headingLevel,
          });
        });
      } else if (textContent) {
        // Split long text into chunks if needed
        const maxCharsPerElement = 300;
        const chunks = [];

        if (textContent.length <= maxCharsPerElement) {
          chunks.push(textContent);
        } else {
          // Split into chunks at word boundaries
          const words = textContent.split(' ');
          let currentChunk = '';

          words.forEach((word: string) => {
            if ((currentChunk + ' ' + word).length <= maxCharsPerElement) {
              currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = word;
            }
          });

          if (currentChunk) chunks.push(currentChunk);
        }

        // Add each chunk as a content element
        chunks.forEach((chunk, i) => {
          elements.push({
            id: `${message.id}-content-${i}`,
            type: 'content',
            messageId: message.id,
            messageColor: messageColor,
            text: chunk,
            height: 0, // Let content grow naturally
          });
        });
      }

      // Add footer (optional - could be used for reactions, etc)
      elements.push({
        id: `${message.id}-footer`,
        type: 'footer',
        messageId: message.id,
        messageColor: messageColor,
        height: 10, // Small footer height
      });

      // Add gap between messages (except after last)
      if (msgIndex < messages.length - 1) {
        elements.push({
          id: `gap-${msgIndex}`,
          type: 'gap',
          messageId: '',
          messageColor: '',
          height: 20,
        });
      }
    });

    return elements;
  }, [messages]);

  // Calculate visibility threshold
  const visibleThreshold = containerHeight * 0.75;

  // Track element positions
  const [elementPositions, setElementPositions] = React.useState<Map<string, {top: number, bottom: number}>>(new Map());

  const isItemVisible = (elementId: string) => {
    const position = elementPositions.get(elementId);
    if (!position) return true; // Default to visible if position not tracked yet

    const itemBottom = position.bottom - scrollOffset;

    // Item is visible if its bottom edge is above the threshold
    return itemBottom <= visibleThreshold;
  };

  // Extract locations from flat elements for map display
  React.useEffect(() => {
    const locations: Location[] = [];
    const seenLocations = new Set<string>();
    let colorIndex = 0;

    flatElements.forEach(element => {
      if (element.parsedContent) {
        element.parsedContent.forEach(item => {
          if (item.type === 'geo-mark' && item.text) {
            const locationKey = `${item.text}-${item.lat}-${item.lng}`;
            if (!seenLocations.has(locationKey)) {
              seenLocations.add(locationKey);

              // Only add if we have valid coordinates
              if (item.lat && item.lng && item.lat !== 'PENDING' && item.lng !== 'PENDING') {
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lng);

                if (!isNaN(lat) && !isNaN(lng)) {
                  locations.push({
                    id: `location-${locations.length}`,
                    name: item.text,
                    lat,
                    lng,
                    colorIndex: colorIndex % 10,
                  });
                  colorIndex++;
                  console.log(`Added location: ${item.text} at ${lat}, ${lng}`);
                }
              }
            }
          }
        });
      }
    });

    if (locations.length > 0) {
      console.log('Updating map with', locations.length, 'locations from parsed content');
      setMapLocations(locations);
    }
  }, [flatElements]);

  // Handle locations update from itinerary viewer (for when we have actual coords)
  const handleLocationsUpdate = React.useCallback((locations: Location[], messageId: string) => {
    console.log('Locations updated for message:', messageId, locations.length, 'locations');
    const hasPositions = locations.some(loc => loc.yPosition !== undefined && loc.yPosition > 0);
    if (hasPositions || locations.length > mapLocations.length) {
      setMapLocations(locations);
    }
  }, [mapLocations.length]);

  // Handle sending messages
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Main container with flex layout */}
        <View style={styles.mainContainer}>
          {/* Map positioned behind chat and input */}
          <View style={styles.mapContainer}>
            <MapViewWrapper
              elements={[]}
              locations={mapLocations}
              focusedLocation={null}
              height={mapSize} // Square map based on screen width
            />
          </View>

          {/* Chat overlay - absolute positioned over the map */}
          <View style={styles.chatOverlay}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Travel Assistant</Text>
              <Text style={styles.headerSubtitle}>Ask me anything about travel planning</Text>
            </View>

          {/* Messages scrollable area with transparency */}
          <View
            style={styles.messagesWrapper}
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
                {flatElements.map((element) => {
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
                      <MessageElement
                        element={element}
                        isVisible={isItemVisible(element.id)}
                        backgroundColor="white"
                        onLocationsUpdate={(locations) => handleLocationsUpdate(locations, element.messageId)}
                        onLocationClick={(location, lat, lng) => {
                          console.log('Location clicked:', location, lat, lng);
                        }}
                        scrollOffset={scrollOffset}
                        containerHeight={containerHeight}
                        styles={styles}
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
          {/* End of chat overlay */}

          {/* Input area at the bottom */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about travel destinations..."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={1000}
              onSubmitEditing={() => handleSendMessage()}
              returnKeyType="send"
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
              onPress={() => handleSendMessage()}
              disabled={!inputText.trim() || isLoading}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  keyboardView: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  mapContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: screenWidth,
    height: screenWidth, // Square map
  },
  chatOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '75%',
    flexDirection: 'column',
  },
  header: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  messagesWrapper: {
    flex: 1, // Takes remaining space in the chat overlay
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 100,
  },
  messagesContentEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    marginBottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowRadius: 2,
    borderWidth: 0, // Ensure no borders
  },
  gapBox: {
    height: 20,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3498DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  assistantAvatar: {
    backgroundColor: '#2ECC71',
  },
  avatarText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  senderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#6b7280',
  },
  messageText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
    paddingVertical: 8,
  },
  locationText: {
    fontWeight: '700', // Slightly thicker than regular text
    color: '#111827', // Black text color
    // No underline decoration
  },
  heading1: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    marginTop: 4,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 4,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    marginTop: 8,
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
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
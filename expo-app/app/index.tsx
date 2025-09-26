import { MapViewWrapper } from '@/components/MapViewWrapper';
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

type FlatElement = {
  id: string;
  type: 'header' | 'content' | 'footer' | 'gap';
  messageId: string;
  messageColor: string;
  text?: string;
  htmlContent?: string;
  height: number;
  role?: 'user' | 'assistant';
  timestamp?: Date;
  isItineraryContent?: boolean;
  parsedContent?: Array<{type: 'text' | 'geo-mark', text: string, color?: string}>;
};

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
  yPosition?: number;
  height?: number;
}

// Component to render a single message element
const MessageElement = ({
  element,
  isVisible,
  backgroundColor,
  onLocationsUpdate,
  onLocationClick,
  scrollOffset,
  containerHeight,
}: {
  element: FlatElement;
  isVisible: boolean;
  backgroundColor: string;
  onLocationsUpdate?: (locations: Location[]) => void;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  scrollOffset?: number;
  containerHeight?: number;
}) => {
  if (element.type === 'gap') {
    return <View style={styles.gapBox} />;
  }

  const baseStyle = [
    styles.box,
    {
      backgroundColor: isVisible ? 'white' : 'transparent',
      borderTopLeftRadius: element.type === 'header' ? 12 : 0,
      borderTopRightRadius: element.type === 'header' ? 12 : 0,
      borderBottomLeftRadius: element.type === 'footer' ? 12 : 0,
      borderBottomRightRadius: element.type === 'footer' ? 12 : 0,
    }
  ];

  // Handle header rendering
  if (element.type === 'header') {
    return (
      <View style={baseStyle}>
        <View style={styles.messageHeader}>
          <View style={[styles.avatar, element.role === 'assistant' && styles.assistantAvatar]}>
            <Text style={styles.avatarText}>
              {element.role === 'user' ? 'U' : 'AI'}
            </Text>
          </View>
          <Text style={[styles.senderName, { opacity: isVisible ? 1 : 0.3 }]}>
            {element.role === 'user' ? 'You' : 'Travel Assistant'}
          </Text>
          {element.timestamp && (
            <Text style={[styles.timestamp, { opacity: isVisible ? 1 : 0.3 }]}>
              {element.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // Handle content rendering
  if (element.type === 'content') {
    return (
      <View style={baseStyle}>
        {element.parsedContent ? (
          <Text style={[styles.messageText, { opacity: isVisible ? 1 : 0.3 }]}>
            {element.parsedContent.map((item, idx) => {
              if (item.type === 'geo-mark') {
                return (
                  <Text key={idx}>
                    <Text style={{ color: item.color, fontSize: 10 }}>● </Text>
                    <Text style={[styles.locationText, { color: item.color }]}>{item.text}</Text>
                    {idx < element.parsedContent!.length - 1 ? ' ' : ''}
                  </Text>
                );
              }
              return <Text key={idx}>{item.text}{idx < element.parsedContent!.length - 1 ? ' ' : ''}</Text>;
            })}
          </Text>
        ) : (
          <Text style={[
            styles.messageText,
            {
              opacity: isVisible ? 1 : 0.3,
              fontStyle: element.isItineraryContent ? 'italic' : 'normal'
            }
          ]}>
            {element.text}
          </Text>
        )}
      </View>
    );
  }

  // Footer (if needed in future)
  return <View style={baseStyle} />;
};

// Helper to parse itinerary HTML into chunks with geo-mark tracking
const parseItineraryContent = (htmlContent: string): Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark', text: string, color?: string}>}> => {
  const chunks: Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark', text: string, color?: string}>}> = [];
  let colorIndex = 0;
  const locationColors = new Map<string, string>();

  // Remove the itinerary wrapper tags
  let content = htmlContent.replace(/<\/?itinerary>/g, '');

  // Process headings
  content = content.replace(/<h1>([^<]+)<\/h1>/g, '\n\n**$1**\n');
  content = content.replace(/<h2>([^<]+)<\/h2>/g, '\n\n$1:\n');
  content = content.replace(/<h3>([^<]+)<\/h3>/g, '\n$1:\n');

  // Split into paragraphs and process each
  const paragraphs = content.split(/<\/?p>/g).filter(p => p.trim());

  paragraphs.forEach(paragraph => {
    let processedText = paragraph;
    const parsedContent: Array<{type: 'text' | 'geo-mark', text: string, color?: string}> = [];

    // Find all geo-marks in this paragraph
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

      // Add the geo-mark with color
      const locationName = match[1];
      if (!locationColors.has(locationName)) {
        locationColors.set(locationName, MARKER_COLORS[colorIndex % MARKER_COLORS.length]);
        colorIndex++;
      }
      parsedContent.push({
        type: 'geo-mark',
        text: locationName,
        color: locationColors.get(locationName)
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

    const itemTop = position.top - scrollOffset;
    const itemBottom = position.bottom - scrollOffset;

    // Item is visible if its bottom edge is above the threshold
    return itemBottom <= visibleThreshold;
  };

  // Handle locations update from itinerary viewer
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
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
    fontWeight: '600',
    textDecorationLine: 'underline',
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
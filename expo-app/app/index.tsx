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

// Helper function to adjust color brightness
const adjustColor = (color: string, amount: number): string => {
  const usePound = color[0] === '#';
  const col = usePound ? color.slice(1) : color;
  const num = parseInt(col, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
  return (usePound ? '#' : '') + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
};

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
      height: element.height,
      backgroundColor: isVisible ? backgroundColor : 'transparent',
      borderColor: backgroundColor,
      borderTopWidth: element.type === 'header' ? 2 : 0,
      borderLeftWidth: 2,
      borderRightWidth: 2,
      borderBottomWidth: element.type === 'footer' ? 2 : 0,
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
        <Text style={[
          styles.messageText,
          {
            opacity: isVisible ? 1 : 0.3,
            fontStyle: element.isItineraryContent ? 'italic' : 'normal'
          }
        ]}>
          {element.text}
        </Text>
      </View>
    );
  }

  // Footer (if needed in future)
  return <View style={baseStyle} />;
};

// Helper to parse itinerary HTML into chunks
const parseItineraryContent = (htmlContent: string): string[] => {
  const chunks: string[] = [];

  // Remove the itinerary wrapper tags completely
  let cleanContent = htmlContent.replace(/<\/?itinerary>/g, '');

  // Process different heading levels to extract structure
  // First, handle h3 headings (times/subheadings)
  cleanContent = cleanContent.replace(/<h3>([^<]+)<\/h3>/g, '\n$1:\n');

  // Then h2 headings (section headers)
  cleanContent = cleanContent.replace(/<h2>([^<]+)<\/h2>/g, '\n\n$1:\n');

  // Then h1 headings (day headers)
  cleanContent = cleanContent.replace(/<h1>([^<]+)<\/h1>/g, '\n\n$1\n');

  // Handle geo-marks specially to preserve location names
  cleanContent = cleanContent.replace(/<span[^>]*class="geo-mark"[^>]*>([^<]+)<\/span>/g, '📍 $1');

  // Handle paragraphs
  cleanContent = cleanContent.replace(/<p>/g, '\n');
  cleanContent = cleanContent.replace(/<\/p>/g, '');

  // Remove all remaining HTML tags
  cleanContent = cleanContent.replace(/<[^>]+>/g, ' ');

  // Clean up whitespace
  cleanContent = cleanContent.replace(/\s+/g, ' ');
  cleanContent = cleanContent.replace(/\n\s+/g, '\n');
  cleanContent = cleanContent.trim();

  // Split content into logical chunks based on double newlines
  const rawChunks = cleanContent.split(/\n\n+/);

  rawChunks.forEach(chunk => {
    const trimmedChunk = chunk.trim();
    if (trimmedChunk) {
      // Split very long chunks
      if (trimmedChunk.length > 300) {
        const sentences = trimmedChunk.match(/[^.!?]+[.!?]+/g) || [trimmedChunk];
        let currentChunk = '';

        sentences.forEach(sentence => {
          const trimmedSentence = sentence.trim();
          if ((currentChunk + ' ' + trimmedSentence).length <= 300) {
            currentChunk = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = trimmedSentence;
          }
        });

        if (currentChunk) chunks.push(currentChunk);
      } else {
        chunks.push(trimmedChunk);
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
        height: 50,
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
            text: chunk,
            height: Math.min(120, 40 + Math.ceil(chunk.length / 50) * 15),
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
            height: Math.min(80, 40 + Math.ceil(chunk.length / 50) * 20), // Dynamic height based on text length
          });
        });
      }

      // Add footer (optional - could be used for reactions, etc)
      elements.push({
        id: `${message.id}-footer`,
        type: 'footer',
        messageId: message.id,
        messageColor: messageColor,
        height: 20,
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

  const isItemVisible = (index: number) => {
    // Calculate actual position based on element heights
    let position = 0;
    for (let i = 0; i < index; i++) {
      if (flatElements[i].type === 'gap') {
        position += flatElements[i].height + 10; // gap with margin
      } else {
        position += flatElements[i].height; // element height
      }
    }

    const itemTop = position - scrollOffset;
    const itemBottom = itemTop + flatElements[index].height;

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
              height="100%" // Fill parent container completely
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
                {flatElements.map((element, index) => {
                  // Determine background color
                  let backgroundColor = element.messageColor;
                  if (element.type === 'header') {
                    backgroundColor = adjustColor(element.messageColor, -30);
                  } else if (element.type === 'footer') {
                    backgroundColor = adjustColor(element.messageColor, 30);
                  }

                  return (
                    <MessageElement
                      key={element.id}
                      element={element}
                      isVisible={isItemVisible(index)}
                      backgroundColor={backgroundColor}
                      onLocationsUpdate={(locations) => handleLocationsUpdate(locations, element.messageId)}
                      onLocationClick={(location, lat, lng) => {
                        console.log('Location clicked:', location, lat, lng);
                      }}
                      scrollOffset={scrollOffset}
                      containerHeight={containerHeight}
                    />
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
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
    paddingHorizontal: 12,
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
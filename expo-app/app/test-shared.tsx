import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  Text,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageElement, FlatElement, messageElementStyles, Location } from '@/components/MessageElement';
import { MapViewWrapper } from '@/components/MapViewWrapper';

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

export default function TestSharedScreen() {
  const [inputText, setInputText] = React.useState('');
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(0);
  const messagesScrollRef = React.useRef<ScrollView>(null);
  
  // Square map size based on screen width
  const mapSize = screenWidth;

  // Define mock messages that match useChat format
  const mockMessages = React.useMemo(() => {
    const userMessage = {
      id: 'msg-1',
      role: 'user' as const,
      parts: [
        { type: 'text', text: 'Plan a 2-day trip to Barcelona for me' }
      ],
      createdAt: new Date('2025-01-26T10:00:00'),
    };

    const assistantMessage = {
      id: 'msg-2',
      role: 'assistant' as const,
      parts: [
        {
          type: 'text',
          text: `That sounds wonderful! Barcelona is an amazing city with rich culture, stunning architecture, and delicious food. Here's a detailed 2-day itinerary for you:

<itinerary>
  <h1>Barcelona in 2 Days</h1>
  <p>Experience the best of Barcelona with this carefully planned itinerary covering Gaudí's masterpieces, historic neighborhoods, and Mediterranean beaches.</p>

  <h2>Day 1: Gothic Quarter & Gaudí</h2>

  <h3>Morning (9:00 AM - 1:00 PM)</h3>
  <p>Start your day at the <span class="geo-mark" data-lat="41.3825" data-lng="2.1769">Barcelona Cathedral</span> in the heart of the Gothic Quarter. Explore the narrow medieval streets and discover hidden squares.</p>
  <p>Walk down Las Ramblas to the famous <span class="geo-mark" data-lat="41.3818" data-lng="2.1685">Boqueria Market</span> for fresh fruits and local treats.</p>

  <h3>Afternoon (2:00 PM - 6:00 PM)</h3>
  <p>Visit the iconic <span class="geo-mark" data-lat="41.4036" data-lng="2.1744">Sagrada Familia</span>, Gaudí's unfinished masterpiece. Book tickets in advance to avoid queues.</p>
  <p>Take a short walk to <span class="geo-mark" data-lat="41.4133" data-lng="2.1742">Hospital de Sant Pau</span>, a stunning example of Catalan Modernisme architecture.</p>

  <h3>Evening (7:00 PM - 11:00 PM)</h3>
  <p>Head to <span class="geo-mark" data-lat="41.3839" data-lng="2.1821">El Born neighborhood</span> for dinner. Try tapas at one of the many authentic restaurants.</p>

  <h2>Day 2: Park Güell & Beaches</h2>

  <h3>Morning (9:00 AM - 12:00 PM)</h3>
  <p>Start early at <span class="geo-mark" data-lat="41.4145" data-lng="2.1527">Park Güell</span> to enjoy Gaudí's colorful mosaics and panoramic city views.</p>

  <h3>Afternoon (1:00 PM - 5:00 PM)</h3>
  <p>Head down to <span class="geo-mark" data-lat="41.3766" data-lng="2.1963">Barceloneta Beach</span> for lunch and relaxation by the Mediterranean Sea.</p>
  <p>Walk along the beach promenade to <span class="geo-mark" data-lat="41.3904" data-lng="2.2055">Port Olímpic</span> for waterfront views.</p>

  <h3>Evening (6:00 PM - 10:00 PM)</h3>
  <p>End your trip at <span class="geo-mark" data-lat="41.3748" data-lng="2.1492">Montjuïc Hill</span> for sunset views and the Magic Fountain show.</p>
</itinerary>

I hope this itinerary helps you make the most of your time in Barcelona! Don't forget to try paella and sangria while you're there.`
        }
      ],
      createdAt: new Date('2025-01-26T10:00:30'),
    };

    return [userMessage, assistantMessage];
  }, []);

  // Convert messages to flat element structure
  const flatElements = React.useMemo(() => {
    const elements: FlatElement[] = [];

    mockMessages.forEach((message, msgIndex) => {
      const messageColor = message.role === 'user' ? '#3498DB' : '#2ECC71';

      // Check if message contains HTML content (itinerary)
      const hasHTMLContent = message.parts?.some((part: any) =>
        part.type === 'text' && part.text?.includes('<itinerary>')
      );

      const textContent = message.parts?.filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('') || '';

      // Add header
      elements.push({
        id: `${message.id}-header`,
        type: 'header',
        messageId: message.id,
        messageColor: messageColor,
        height: 50,
        role: message.role as 'user' | 'assistant',
        timestamp: message.createdAt,
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
        // Simple text message
        elements.push({
          id: `${message.id}-content-0`,
          type: 'content',
          messageId: message.id,
          messageColor: messageColor,
          text: textContent,
          height: 0, // Let content grow naturally
        });
      }

      // Add footer
      elements.push({
        id: `${message.id}-footer`,
        type: 'footer',
        messageId: message.id,
        messageColor: messageColor,
        height: 10,
      });

      // Add gap between messages (except after last)
      if (msgIndex < mockMessages.length - 1) {
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
  }, [mockMessages]);

  // Extract locations from messages for map display
  const mapLocations = React.useMemo(() => {
    const locations: Location[] = [];
    let colorIndex = 0;
    
    flatElements.forEach(element => {
      if (element.parsedContent) {
        element.parsedContent.forEach(item => {
          if (item.type === 'geo-mark' && item.lat && item.lng) {
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
            }
          }
        });
      }
    });
    
    return locations;
  }, [flatElements]);
  
  // Calculate visibility threshold (75% of container)
  const visibleThreshold = containerHeight * 0.75;

  // Track element positions
  const [elementPositions, setElementPositions] = React.useState<Map<string, {top: number, bottom: number}>>(new Map());

  // Track which messages have visible content
  const getVisibleContentByMessage = React.useCallback(() => {
    const visibleContent = new Map<string, boolean>();
    flatElements.forEach(element => {
      if (element.type === 'content') {
        const position = elementPositions.get(element.id);
        if (position) {
          const itemBottom = position.bottom - scrollOffset;
          if (itemBottom <= visibleThreshold) {
            visibleContent.set(element.messageId, true);
          }
        }
      }
    });
    return visibleContent;
  }, [elementPositions, scrollOffset, visibleThreshold, flatElements]);

  const isItemVisible = (elementId: string) => {
    const position = elementPositions.get(elementId);
    if (!position) return true; // Default to visible if position not tracked yet

    const itemBottom = position.bottom - scrollOffset;
    const element = flatElements.find(el => el.id === elementId);
    
    // Headers only visible when at least one content from same message is visible
    if (element && element.type === 'header') {
      const visibleContent = getVisibleContentByMessage();
      return itemBottom <= visibleThreshold && visibleContent.has(element.messageId);
    }
    
    // Other elements follow normal visibility rules
    return itemBottom <= visibleThreshold;
  };

  // Handle sending messages (mock)
  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    setInputText('');
    // In test mode, just clear the input
    setTimeout(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };
  
  // Combine default styles with custom styles
  const styles = StyleSheet.create({
    ...messageElementStyles,
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
      flex: 1,
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContent: {
      padding: 16,
      paddingBottom: 100,
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
              height={mapSize}
            />
          </View>

          {/* Chat overlay - absolute positioned over the map */}
          <View style={styles.chatOverlay}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Test with Shared Component</Text>
              <Text style={styles.headerSubtitle}>Using MessageElement with MapView</Text>
            </View>

            {/* Messages scrollable area with transparency */}
            <View
              style={styles.messagesWrapper}
              onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
            >
              <ScrollView
                ref={messagesScrollRef}
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
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
                        styles={styles}
                      />
                    </View>
                  );
                })}
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
              placeholder="Type a message (test mode)..."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={1000}
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!inputText.trim()}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
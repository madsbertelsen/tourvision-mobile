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
import { MessageElementWithFocus, FlatElement, messageElementWithFocusStyles } from '@/components/MessageElementWithFocus';
import { useMockContext } from '@/contexts/MockContext';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

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
const parseItineraryContent = (htmlContent: string): Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3', text: string, color?: string, lat?: string | null, lng?: string | null}>, isHeading?: boolean, headingLevel?: 1 | 2 | 3}> => {
  const chunks: Array<{text: string, parsedContent: Array<{type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3', text: string, color?: string, lat?: string | null, lng?: string | null}>, isHeading?: boolean, headingLevel?: 1 | 2 | 3}> = [];
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
    const parsedContent: Array<{type: 'text' | 'geo-mark', text: string, color?: string, lat?: string | null, lng?: string | null}> = [];

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

// Extract all locations from elements for map with their assigned colors
function extractAllLocations(elements: FlatElement[]) {
  const locations: Array<{name: string, lat: number, lng: number, color?: string}> = [];
  const seen = new Set<string>();

  elements.forEach(element => {
    if (element.parsedContent) {
      element.parsedContent.forEach(item => {
        if (item.type === 'geo-mark' && item.lat && item.lng) {
          const key = `${item.text}-${item.lat}-${item.lng}`;
          if (!seen.has(key)) {
            seen.add(key);
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            if (!isNaN(lat) && !isNaN(lng) && item.lat !== 'PENDING' && item.lng !== 'PENDING') {
              locations.push({
                name: item.text,
                lat,
                lng,
                color: item.color // Preserve the color from parsedContent
              });
            }
          }
        }
      });
    }
  });

  return locations;
}

export default function MockChatScreen() {
  const [inputText, setInputText] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const messagesScrollRef = useRef<ScrollView>(null);
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null);

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
  });

  const {
    messages = [],
    sendMessage,
    status = 'idle',
    error
  } = chatHelpers;

  const isLoading = status === ('in_progress' as any);

  // Convert messages to flat element structure
  const flatElements = useMemo(() => {
    const elements: FlatElement[] = [];

    messages.forEach((message, msgIndex) => {
      const messageColor = 'transparent';

      // Check if message contains HTML content (itinerary)
      // Look for common HTML patterns that indicate itinerary content
      const hasHTMLContent = message.parts?.some((part: any) =>
        part.type === 'text' && (
          part.text?.includes('<itinerary>') ||
          part.text?.includes('<h1>') ||
          part.text?.includes('<h2>') ||
          part.text?.includes('<h3>') ||
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

      // Add content elements
      if (hasHTMLContent) {
        // Parse itinerary HTML into chunks
        const chunks = parseItineraryContent(textContent);
        console.log('Parsing HTML content, chunks:', chunks);
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
            role: message.role as 'user' | 'assistant',
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

  // Get context for sharing locations with layout
  const { updateVisibleLocations } = useMockContext();

  // Track element positions
  const [elementPositions, setElementPositions] = useState<Map<string, {top: number, bottom: number}>>(new Map());

  // Track visible locations based on scroll
  const [visibleLocations, setVisibleLocations] = useState<Array<{name: string, lat: number, lng: number, color?: string}>>([]);

  // Update visible locations as a side effect of scroll
  useEffect(() => {
    const newVisibleLocations: Array<{name: string, lat: number, lng: number, color?: string}> = [];
    const seenLocations = new Set<string>();

    flatElements.forEach(element => {
      const position = elementPositions.get(element.id);
      if (position) {
        const itemTop = position.top - scrollOffset;
        const itemBottom = position.bottom - scrollOffset;

        // Check if this element is in view
        if (itemTop < containerHeight && itemBottom > 0) {
          if (element.type === 'content' && element.parsedContent) {
            // Extract geo-marks from visible elements
            element.parsedContent.forEach(item => {
              if (item.type === 'geo-mark' && item.lat && item.lng) {
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                  const locationKey = `${item.text}-${lat}-${lng}`;
                  if (!seenLocations.has(locationKey)) {
                    seenLocations.add(locationKey);
                    newVisibleLocations.push({
                      name: item.text,
                      lat,
                      lng,
                      color: item.color
                    });
                  }
                }
              }
            });
          }
        }
      }
    });

    setVisibleLocations(newVisibleLocations);
    // Only update context if we have locations to show
    if (newVisibleLocations.length > 0) {
      updateVisibleLocations(newVisibleLocations.map((loc, idx) => ({
        id: `loc-${idx}`,
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        color: loc.color,
        colorIndex: getColorIndex(loc.color)
      })));
    }
  }, [scrollOffset, elementPositions, flatElements, containerHeight, updateVisibleLocations]);

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
      paddingTop: 16,
      paddingBottom: 20, // Reduced padding since we want content to go closer to input
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

  return (
    <View style={styles.container}>
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

                {flatElements.map((element, index) => {
                  const isFirstElement = index === 0 || flatElements[index - 1]?.type === 'gap';
                  const isLastElement = index === flatElements.length - 1 || flatElements[index + 1]?.type === 'gap';

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
                      style={[
                        styles.messageWrapper,
                        {
                          backgroundColor: 'white',
                          borderTopLeftRadius: isFirstElement ? 12 : 0,
                          borderTopRightRadius: isFirstElement ? 12 : 0,
                          borderBottomLeftRadius: isLastElement ? 12 : 0,
                          borderBottomRightRadius: isLastElement ? 12 : 0,
                          marginHorizontal: 8,
                          // Add shadow to the white sheet
                          shadowColor: '#000',
                          shadowOffset: {
                            width: 0,
                            height: 4,
                          },
                          shadowOpacity: 0.15,
                          shadowRadius: 12,
                          elevation: 8,
                        }
                      ]}
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
    </View>
  );
}
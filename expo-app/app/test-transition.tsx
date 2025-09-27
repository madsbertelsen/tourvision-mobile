import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  Text,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageElementAnimated, FlatElement, messageElementAnimatedStyles } from '@/components/MessageElementAnimated';

const { height: screenHeight } = Dimensions.get('window');

// Color palette for location markers
const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
];

export default function TestTransitionScreen() {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [animationType, setAnimationType] = useState<'fade' | 'slide' | 'scale' | 'all'>('all');
  const [animationDuration, setAnimationDuration] = useState(300);
  const [autoScroll, setAutoScroll] = useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

  // Create mock messages
  const mockMessages = React.useMemo(() => {
    const messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
      hasItinerary?: boolean;
    }> = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Show me some travel destinations',
        timestamp: new Date(Date.now() - 10 * 60000),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: `I'll share some amazing destinations with you!

<itinerary>
<h1>Top Travel Destinations</h1>
<p>Here are some incredible places to explore around the world.</p>

<h2>European Gems</h2>
<p>Visit the romantic <span class="geo-mark" data-lat="48.8566" data-lng="2.3522">Paris</span> with its iconic Eiffel Tower and charming cafés.</p>
<p>Explore historic <span class="geo-mark" data-lat="41.9028" data-lng="12.4964">Rome</span> and its ancient ruins.</p>

<h2>Asian Adventures</h2>
<p>Experience the bustling streets of <span class="geo-mark" data-lat="35.6762" data-lng="139.6503">Tokyo</span> with its blend of tradition and technology.</p>
<p>Relax on the beaches of <span class="geo-mark" data-lat="-8.3405" data-lng="115.0920">Bali</span> and enjoy its spiritual atmosphere.</p>

<h2>American Wonders</h2>
<p>Discover the vibrant culture of <span class="geo-mark" data-lat="40.7128" data-lng="-74.0060">New York City</span> and its world-famous landmarks.</p>
</itinerary>`,
        timestamp: new Date(Date.now() - 8 * 60000),
        hasItinerary: true,
      },
      {
        id: 'msg-3',
        role: 'user',
        content: 'Which one would you recommend for a first-time traveler?',
        timestamp: new Date(Date.now() - 5 * 60000),
      },
      {
        id: 'msg-4',
        role: 'assistant',
        content: 'For first-time travelers, I would recommend starting with Paris or Rome. These cities offer:\n\n• Rich history and culture\n• Excellent tourist infrastructure\n• Amazing food and wine\n• Iconic landmarks\n• Easy transportation\n\nBoth cities are very welcoming to tourists and have plenty of English-speaking services.',
        timestamp: new Date(Date.now() - 3 * 60000),
      },
    ];
    return messages;
  }, []);

  // Parse and create flat elements
  const flatElements = React.useMemo(() => {
    const elements: FlatElement[] = [];
    let colorIndex = 0;
    const locationColors = new Map<string, string>();

    mockMessages.forEach((message, msgIndex) => {
      const messageColor = message.role === 'user' ? '#3498DB' : '#2ECC71';

      // Add header
      elements.push({
        id: `${message.id}-header`,
        type: 'header',
        messageId: message.id,
        messageColor: messageColor,
        height: 50,
        role: message.role,
        timestamp: message.timestamp,
      });

      // Process content
      if (message.hasItinerary && message.content.includes('<itinerary>')) {
        // Parse itinerary content
        const content = message.content.replace(/<\/?itinerary>/g, '');
        const elementRegex = /(<h[123]>[^<]+<\/h[123]>|<p>[\s\S]*?<\/p>)/g;
        const contentElements = content.match(elementRegex) || [];

        contentElements.forEach((elem, i) => {
          const h1Match = elem.match(/<h1>([^<]+)<\/h1>/);
          const h2Match = elem.match(/<h2>([^<]+)<\/h2>/);
          
          if (h1Match) {
            elements.push({
              id: `${message.id}-content-${i}`,
              type: 'content',
              messageId: message.id,
              messageColor: messageColor,
              text: h1Match[1],
              height: 0,
              isHeading: true,
              headingLevel: 1,
            });
          } else if (h2Match) {
            elements.push({
              id: `${message.id}-content-${i}`,
              type: 'content',
              messageId: message.id,
              messageColor: messageColor,
              text: h2Match[1],
              height: 0,
              isHeading: true,
              headingLevel: 2,
            });
          } else {
            // Parse paragraph with geo-marks
            const paragraph = elem.replace(/<\/?p>/g, '').trim();
            if (paragraph) {
              const parsedContent: Array<{type: 'text' | 'geo-mark', text: string, color?: string, lat?: string | null, lng?: string | null}> = [];
              const geoMarkRegex = /<span[^>]*class="geo-mark"[^>]*>([^<]+)<\/span>/g;
              let lastIndex = 0;
              let match;

              while ((match = geoMarkRegex.exec(paragraph)) !== null) {
                if (match.index > lastIndex) {
                  const textBefore = paragraph.substring(lastIndex, match.index).replace(/<[^>]+>/g, '').trim();
                  if (textBefore) {
                    parsedContent.push({type: 'text', text: textBefore});
                  }
                }

                const locationName = match[1];
                if (!locationColors.has(locationName)) {
                  locationColors.set(locationName, MARKER_COLORS[colorIndex % MARKER_COLORS.length]);
                  colorIndex++;
                }
                
                const fullMatch = match[0];
                const latMatch = fullMatch.match(/data-lat="([^"]+)"/);
                const lngMatch = fullMatch.match(/data-lng="([^"]+)"/);
                
                parsedContent.push({
                  type: 'geo-mark',
                  text: locationName,
                  color: locationColors.get(locationName),
                  lat: latMatch ? latMatch[1] : null,
                  lng: lngMatch ? lngMatch[1] : null,
                });

                lastIndex = geoMarkRegex.lastIndex;
              }

              if (lastIndex < paragraph.length) {
                const textAfter = paragraph.substring(lastIndex).replace(/<[^>]+>/g, '').trim();
                if (textAfter) {
                  parsedContent.push({type: 'text', text: textAfter});
                }
              }

              const fullText = parsedContent.map(item => item.text).join(' ').trim();
              if (fullText) {
                elements.push({
                  id: `${message.id}-content-${i}`,
                  type: 'content',
                  messageId: message.id,
                  messageColor: messageColor,
                  text: fullText,
                  parsedContent: parsedContent,
                  height: 0,
                  isItineraryContent: true,
                });
              }
            }
          }
        });
      } else {
        // Simple text message
        elements.push({
          id: `${message.id}-content-0`,
          type: 'content',
          messageId: message.id,
          messageColor: messageColor,
          text: message.content,
          height: 0,
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

      // Add gap
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

  // Calculate visibility
  const visibleThreshold = containerHeight * 0.75;
  const [elementPositions, setElementPositions] = useState<Map<string, {top: number, bottom: number}>>(new Map());

  const isItemVisible = (elementId: string) => {
    const position = elementPositions.get(elementId);
    if (!position) return true;
    const itemBottom = position.bottom - scrollOffset;
    return itemBottom <= visibleThreshold;
  };

  // Auto-scroll effect
  React.useEffect(() => {
    if (autoScroll) {
      const interval = setInterval(() => {
        scrollViewRef.current?.scrollTo({
          y: scrollOffset + 50,
          animated: true,
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [autoScroll, scrollOffset]);

  const styles = StyleSheet.create({
    ...messageElementAnimatedStyles,
    container: {
      flex: 1,
      backgroundColor: '#f0f0f0',
    },
    controlPanel: {
      padding: 16,
      backgroundColor: 'white',
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    controlLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#374151',
    },
    buttonGroup: {
      flexDirection: 'row',
      gap: 8,
    },
    animButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#d1d5db',
    },
    animButtonActive: {
      backgroundColor: '#3b82f6',
      borderColor: '#3b82f6',
    },
    animButtonText: {
      fontSize: 12,
      color: '#374151',
    },
    animButtonTextActive: {
      color: 'white',
    },
    durationButton: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#d1d5db',
    },
    durationButtonActive: {
      backgroundColor: '#10b981',
      borderColor: '#10b981',
    },
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
    },
    thresholdOverlay: {
      position: 'absolute',
      top: '75%',
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: '#ef4444',
      zIndex: 10,
    },
    thresholdLabel: {
      position: 'absolute',
      right: 16,
      top: -20,
      backgroundColor: '#ef4444',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    thresholdText: {
      color: 'white',
      fontSize: 11,
      fontWeight: 'bold',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Control Panel */}
      <View style={styles.controlPanel}>
        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Animation Type:</Text>
          <View style={styles.buttonGroup}>
            {(['fade', 'slide', 'scale', 'all'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.animButton, animationType === type && styles.animButtonActive]}
                onPress={() => setAnimationType(type)}
              >
                <Text style={[styles.animButtonText, animationType === type && styles.animButtonTextActive]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Duration (ms):</Text>
          <View style={styles.buttonGroup}>
            {[150, 300, 500, 1000].map((duration) => (
              <TouchableOpacity
                key={duration}
                style={[styles.durationButton, animationDuration === duration && styles.durationButtonActive]}
                onPress={() => setAnimationDuration(duration)}
              >
                <Text style={[styles.animButtonText, animationDuration === duration && styles.animButtonTextActive]}>
                  {duration}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Auto-scroll:</Text>
          <Switch
            value={autoScroll}
            onValueChange={setAutoScroll}
            trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
            thumbColor={autoScroll ? '#1d4ed8' : '#9ca3af'}
          />
        </View>
      </View>

      {/* Messages with visibility tracking */}
      <View
        style={{ flex: 1 }}
        onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          {flatElements.map((element) => (
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
              <MessageElementAnimated
                element={element}
                isVisible={isItemVisible(element.id)}
                backgroundColor="white"
                styles={styles}
                animationType={animationType}
                animationDuration={animationDuration}
              />
            </View>
          ))}
        </ScrollView>

        {/* Visual threshold indicator */}
        <View style={styles.thresholdOverlay}>
          <View style={styles.thresholdLabel}>
            <Text style={styles.thresholdText}>75% Visibility Threshold</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
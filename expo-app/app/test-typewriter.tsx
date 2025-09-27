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
import { 
  MessageElementTypewriter, 
  FlatElement, 
  messageElementTypewriterStyles,
  TypewriterConfig
} from '@/components/MessageElementTypewriter';

const { height: screenHeight } = Dimensions.get('window');

// Color palette for location markers
const MARKER_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export default function TestTypewriterScreen() {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [typewriterConfig, setTypewriterConfig] = useState<TypewriterConfig>({
    enabled: true,
    speed: 60,
    wordPause: 50,
    replayOnReenter: false,
    instantOnFastScroll: true,
  });
  const [autoScroll, setAutoScroll] = useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const lastScrollTimeRef = React.useRef(Date.now());
  const [scrollSpeed, setScrollSpeed] = useState(0);

  // Mock messages with varied content
  const mockMessages = React.useMemo(() => {
    return [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Show me a detailed travel itinerary',
        timestamp: new Date(Date.now() - 15 * 60000),
      },
      {
        id: 'msg-2',
        role: 'assistant' as const,
        content: `I'll create a wonderful travel experience for you!

<itinerary>
<h1>Ultimate European Adventure</h1>
<p>A magical journey through Europe's most captivating cities, blending history, culture, and unforgettable experiences.</p>

<h2>Paris - The City of Lights</h2>
<p>Begin your adventure in <span class="geo-mark" data-lat="48.8566" data-lng="2.3522">Paris</span>, where romance meets history. Visit the iconic <span class="geo-mark" data-lat="48.8584" data-lng="2.2945">Eiffel Tower</span> at sunset for breathtaking views.</p>
<p>Explore world-class art at the <span class="geo-mark" data-lat="48.8606" data-lng="2.3376">Louvre Museum</span>, home to the Mona Lisa and countless masterpieces.</p>

<h2>Barcelona - Gaudí's Playground</h2>
<p>Continue to vibrant <span class="geo-mark" data-lat="41.3851" data-lng="2.1734">Barcelona</span>, where modernist architecture meets Mediterranean charm.</p>
<p>Marvel at the unfinished <span class="geo-mark" data-lat="41.4036" data-lng="2.1744">Sagrada Familia</span> and stroll through the whimsical <span class="geo-mark" data-lat="41.4145" data-lng="2.1527">Park Güell</span>.</p>

<h2>Rome - The Eternal City</h2>
<p>Journey to <span class="geo-mark" data-lat="41.9028" data-lng="12.4964">Rome</span>, where ancient history comes alive at every corner.</p>
<p>Toss a coin in the <span class="geo-mark" data-lat="41.9009" data-lng="12.4833">Trevi Fountain</span> and explore the mighty <span class="geo-mark" data-lat="41.8902" data-lng="12.4922">Colosseum</span>.</p>
</itinerary>`,
        timestamp: new Date(Date.now() - 12 * 60000),
        hasItinerary: true,
      },
      {
        id: 'msg-3',
        role: 'user' as const,
        content: 'How long should I spend in each city?',
        timestamp: new Date(Date.now() - 8 * 60000),
      },
      {
        id: 'msg-4',
        role: 'assistant' as const,
        content: 'For an optimal experience, I recommend:\n\n• **Paris**: 3-4 days to cover major attractions and enjoy café culture\n• **Barcelona**: 3 days for Gaudí sites, beaches, and tapas tours\n• **Rome**: 3-4 days for ancient sites, Vatican, and authentic Italian cuisine\n\nThis 10-12 day itinerary allows you to immerse yourself in each city without rushing. Add travel days between cities for a comfortable 2-week European adventure!',
        timestamp: new Date(Date.now() - 5 * 60000),
      },
      {
        id: 'msg-5',
        role: 'user' as const,
        content: 'What about transportation between cities?',
        timestamp: new Date(Date.now() - 3 * 60000),
      },
      {
        id: 'msg-6',
        role: 'assistant' as const,
        content: 'Great question! Here are the best transportation options:\n\n**Paris to Barcelona**:\n• High-speed train (6.5 hours) - scenic and comfortable\n• Flight (2 hours) - faster but factor in airport time\n• Overnight train - save on accommodation\n\n**Barcelona to Rome**:\n• Flight (2 hours) - most practical option\n• Ferry + train (20+ hours) - scenic coastal route\n• Road trip - flexibility to stop in French Riviera\n\n💡 **Pro tip**: Book trains 2-3 months ahead for best prices. Consider a Eurail Pass if adding more cities!',
        timestamp: new Date(Date.now() - 1 * 60000),
      },
    ];
  }, []);

  // Parse messages into flat elements
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
        messageColor,
        height: 50,
        role: message.role,
        timestamp: message.timestamp,
      });

      // Process content
      if (message.hasItinerary && message.content.includes('<itinerary>')) {
        // Split content before and after itinerary
        const parts = message.content.split('<itinerary>');
        const beforeItinerary = parts[0].trim();
        
        if (beforeItinerary) {
          elements.push({
            id: `${message.id}-intro`,
            type: 'content',
            messageId: message.id,
            messageColor,
            text: beforeItinerary,
            height: 0,
          });
        }

        // Parse itinerary
        const itineraryParts = parts[1].split('</itinerary>');
        const itineraryContent = itineraryParts[0];
        const elementRegex = /(<h[123]>[^<]+<\/h[123]>|<p>[\s\S]*?<\/p>)/g;
        const contentElements = itineraryContent.match(elementRegex) || [];

        contentElements.forEach((elem, i) => {
          const h1Match = elem.match(/<h1>([^<]+)<\/h1>/);
          const h2Match = elem.match(/<h2>([^<]+)<\/h2>/);
          const h3Match = elem.match(/<h3>([^<]+)<\/h3>/);
          
          if (h1Match) {
            elements.push({
              id: `${message.id}-h1-${i}`,
              type: 'content',
              messageId: message.id,
              messageColor,
              text: h1Match[1],
              height: 0,
              isHeading: true,
              headingLevel: 1,
            });
          } else if (h2Match) {
            elements.push({
              id: `${message.id}-h2-${i}`,
              type: 'content',
              messageId: message.id,
              messageColor,
              text: h2Match[1],
              height: 0,
              isHeading: true,
              headingLevel: 2,
            });
          } else if (h3Match) {
            elements.push({
              id: `${message.id}-h3-${i}`,
              type: 'content',
              messageId: message.id,
              messageColor,
              text: h3Match[1],
              height: 0,
              isHeading: true,
              headingLevel: 3,
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
                  const textBefore = paragraph.substring(lastIndex, match.index).trim();
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
                const textAfter = paragraph.substring(lastIndex).trim();
                if (textAfter) {
                  parsedContent.push({type: 'text', text: textAfter});
                }
              }

              if (parsedContent.length === 0) {
                const cleanText = paragraph.replace(/<[^>]+>/g, '').trim();
                if (cleanText) {
                  parsedContent.push({type: 'text', text: cleanText});
                }
              }

              const fullText = parsedContent.map(item => item.text).join(' ').trim();
              if (fullText) {
                elements.push({
                  id: `${message.id}-p-${i}`,
                  type: 'content',
                  messageId: message.id,
                  messageColor,
                  text: fullText,
                  parsedContent,
                  height: 0,
                  isItineraryContent: true,
                });
              }
            }
          }
        });

        // After itinerary text
        const afterItinerary = itineraryParts[1]?.trim();
        if (afterItinerary) {
          elements.push({
            id: `${message.id}-after`,
            type: 'content',
            messageId: message.id,
            messageColor,
            text: afterItinerary,
            height: 0,
          });
        }
      } else {
        // Simple text message
        elements.push({
          id: `${message.id}-content`,
          type: 'content',
          messageId: message.id,
          messageColor,
          text: message.content,
          height: 0,
        });
      }

      // Add footer
      elements.push({
        id: `${message.id}-footer`,
        type: 'footer',
        messageId: message.id,
        messageColor,
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

  // Calculate visibility and scroll speed
  const visibleThreshold = containerHeight * 0.75;
  const [elementPositions, setElementPositions] = useState<Map<string, {top: number, bottom: number}>>(new Map());

  const isItemVisible = (elementId: string) => {
    const position = elementPositions.get(elementId);
    if (!position) return true;
    const itemBottom = position.bottom - scrollOffset;
    return itemBottom <= visibleThreshold;
  };

  // Handle scroll with speed calculation
  const handleScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    const currentTime = Date.now();
    const timeDelta = currentTime - lastScrollTimeRef.current;
    
    if (timeDelta > 0) {
      const speed = Math.abs(currentOffset - scrollOffset) / timeDelta * 1000; // pixels per second
      setScrollSpeed(speed);
    }
    
    setScrollOffset(currentOffset);
    lastScrollTimeRef.current = currentTime;
  };

  // Auto-scroll effect
  React.useEffect(() => {
    if (autoScroll) {
      const interval = setInterval(() => {
        scrollViewRef.current?.scrollTo({
          y: scrollOffset + 30,
          animated: true,
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [autoScroll, scrollOffset]);

  const styles = StyleSheet.create({
    ...messageElementTypewriterStyles,
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
      minWidth: 100,
    },
    buttonGroup: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
      flex: 1,
      justifyContent: 'flex-end',
    },
    speedButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#d1d5db',
      minWidth: 45,
    },
    speedButtonActive: {
      backgroundColor: '#3b82f6',
      borderColor: '#3b82f6',
    },
    speedButtonText: {
      fontSize: 12,
      color: '#374151',
      textAlign: 'center',
    },
    speedButtonTextActive: {
      color: 'white',
    },
    switchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
    speedIndicator: {
      position: 'absolute',
      left: 16,
      top: -20,
      backgroundColor: '#10b981',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    speedText: {
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
          <Text style={styles.controlLabel}>Typewriter:</Text>
          <View style={styles.switchContainer}>
            <Switch
              value={typewriterConfig.enabled}
              onValueChange={(enabled) => 
                setTypewriterConfig(prev => ({ ...prev, enabled }))
              }
              trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
              thumbColor={typewriterConfig.enabled ? '#1d4ed8' : '#9ca3af'}
            />
            <Text style={styles.speedButtonText}>
              {typewriterConfig.enabled ? 'ON' : 'OFF'}
            </Text>
          </View>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Speed:</Text>
          <View style={styles.buttonGroup}>
            {[30, 60, 90, 120].map((speed) => (
              <TouchableOpacity
                key={speed}
                style={[
                  styles.speedButton,
                  typewriterConfig.speed === speed && styles.speedButtonActive
                ]}
                onPress={() => 
                  setTypewriterConfig(prev => ({ ...prev, speed }))
                }
                disabled={!typewriterConfig.enabled}
              >
                <Text style={[
                  styles.speedButtonText,
                  typewriterConfig.speed === speed && styles.speedButtonTextActive
                ]}>
                  {speed}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Word Pause:</Text>
          <View style={styles.buttonGroup}>
            {[0, 50, 100, 200].map((pause) => (
              <TouchableOpacity
                key={pause}
                style={[
                  styles.speedButton,
                  typewriterConfig.wordPause === pause && styles.speedButtonActive
                ]}
                onPress={() => 
                  setTypewriterConfig(prev => ({ ...prev, wordPause: pause }))
                }
                disabled={!typewriterConfig.enabled}
              >
                <Text style={[
                  styles.speedButtonText,
                  typewriterConfig.wordPause === pause && styles.speedButtonTextActive
                ]}>
                  {pause}ms
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Replay:</Text>
          <View style={styles.switchContainer}>
            <Switch
              value={typewriterConfig.replayOnReenter}
              onValueChange={(replayOnReenter) => 
                setTypewriterConfig(prev => ({ ...prev, replayOnReenter }))
              }
              trackColor={{ false: '#d1d5db', true: '#10b981' }}
              thumbColor={typewriterConfig.replayOnReenter ? '#059669' : '#9ca3af'}
              disabled={!typewriterConfig.enabled}
            />
            <Text style={styles.speedButtonText}>
              {typewriterConfig.replayOnReenter ? 'YES' : 'NO'}
            </Text>
          </View>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Auto-scroll:</Text>
          <View style={styles.switchContainer}>
            <Switch
              value={autoScroll}
              onValueChange={setAutoScroll}
              trackColor={{ false: '#d1d5db', true: '#f59e0b' }}
              thumbColor={autoScroll ? '#d97706' : '#9ca3af'}
            />
            <Text style={styles.speedButtonText}>
              {autoScroll ? 'ON' : 'OFF'}
            </Text>
          </View>
        </View>
      </View>

      {/* Messages with typewriter effect */}
      <View
        style={{ flex: 1 }}
        onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          onScroll={handleScroll}
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
              <MessageElementTypewriter
                element={element}
                isVisible={isItemVisible(element.id)}
                backgroundColor="white"
                styles={styles}
                typewriterConfig={typewriterConfig}
                scrollSpeed={scrollSpeed}
                scrollOffset={scrollOffset}
              />
            </View>
          ))}
        </ScrollView>

        {/* Visual indicators */}
        <View style={styles.thresholdOverlay}>
          <View style={styles.speedIndicator}>
            <Text style={styles.speedText}>
              {scrollSpeed > 500 ? '⚡ Fast' : '🐌 Slow'} ({Math.round(scrollSpeed)}px/s)
            </Text>
          </View>
          <View style={styles.thresholdLabel}>
            <Text style={styles.thresholdText}>75% Visibility</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
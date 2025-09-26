import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  text: string;
  height: number; // Height of this element (40, 60, or 80 for content)
  role?: 'user' | 'assistant';
  timestamp?: Date;
  isItineraryContent?: boolean;
};

// Component to render a single message element
const MessageElement = ({
  element,
  isVisible,
  backgroundColor
}: {
  element: FlatElement;
  isVisible: boolean;
  backgroundColor: string;
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
      borderTopLeftRadius: element.type === 'header' ? 8 : 0,
      borderTopRightRadius: element.type === 'header' ? 8 : 0,
      borderBottomLeftRadius: element.type === 'footer' ? 8 : 0,
      borderBottomRightRadius: element.type === 'footer' ? 8 : 0,
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
  return (
    <View style={baseStyle}>
      <Text style={[
        styles.boxText,
        {
          opacity: isVisible ? 1 : 0.3,
          fontWeight: element.type === 'header' ? 'bold' : 'normal',
          fontStyle: element.isItineraryContent ? 'italic' : 'normal',
        }
      ]}>
        {element.text}
      </Text>
    </View>
  );
};

export default function TestTransparencyScreen() {
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(0);

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
  <p>Start your day at the <span class="geo-mark" data-geo="true" data-lat="41.3825" data-lng="2.1769" data-place-name="Barcelona Cathedral">Barcelona Cathedral</span> in the heart of the Gothic Quarter. Explore the narrow medieval streets and discover hidden squares.</p>
  <p>Walk down Las Ramblas to the famous <span class="geo-mark" data-geo="true" data-lat="41.3818" data-lng="2.1685" data-place-name="Boqueria Market">Boqueria Market</span> for fresh fruits and local treats.</p>

  <h3>Afternoon (2:00 PM - 6:00 PM)</h3>
  <p>Visit the iconic <span class="geo-mark" data-geo="true" data-lat="41.4036" data-lng="2.1744" data-place-name="Sagrada Familia">Sagrada Familia</span>, Gaudí's unfinished masterpiece. Book tickets in advance to avoid queues.</p>
  <p>Take a short walk to <span class="geo-mark" data-geo="true" data-lat="41.4133" data-lng="2.1742" data-place-name="Hospital de Sant Pau">Hospital de Sant Pau</span>, a stunning example of Catalan Modernisme architecture.</p>

  <h3>Evening (7:00 PM - 11:00 PM)</h3>
  <p>Head to <span class="geo-mark" data-geo="true" data-lat="41.3839" data-lng="2.1821" data-place-name="El Born neighborhood">El Born</span> for dinner. Try tapas at one of the many authentic restaurants.</p>

  <h2>Day 2: Park Güell & Beaches</h2>

  <h3>Morning (9:00 AM - 12:00 PM)</h3>
  <p>Start early at <span class="geo-mark" data-geo="true" data-lat="41.4145" data-lng="2.1527" data-place-name="Park Güell">Park Güell</span> to enjoy Gaudí's colorful mosaics and panoramic city views.</p>

  <h3>Afternoon (1:00 PM - 5:00 PM)</h3>
  <p>Head down to <span class="geo-mark" data-geo="true" data-lat="41.3766" data-lng="2.1963" data-place-name="Barceloneta Beach">Barceloneta Beach</span> for lunch and relaxation by the Mediterranean Sea.</p>
  <p>Walk along the beach promenade to <span class="geo-mark" data-geo="true" data-lat="41.3904" data-lng="2.2055" data-place-name="Port Olímpic">Port Olímpic</span> for waterfront views.</p>

  <h3>Evening (6:00 PM - 10:00 PM)</h3>
  <p>End your trip at <span class="geo-mark" data-geo="true" data-lat="41.3748" data-lng="2.1492" data-place-name="Montjuïc">Montjuïc Hill</span> for sunset views and the Magic Fountain show.</p>
</itinerary>

I hope this itinerary helps you make the most of your time in Barcelona! Don't forget to try paella and sangria while you're there.`
        }
      ],
      createdAt: new Date('2025-01-26T10:00:30'),
    };

    return [userMessage, assistantMessage];
  }, []);

  // Helper to parse itinerary HTML into chunks
  const parseItineraryContent = (htmlContent: string): string[] => {
    const chunks: string[] = [];

    // Extract text before <itinerary> tag
    const beforeItinerary = htmlContent.split('<itinerary>')[0];
    if (beforeItinerary.trim()) {
      chunks.push(beforeItinerary.trim());
    }

    // Extract itinerary sections
    const itineraryMatch = htmlContent.match(/<itinerary>([\s\S]*?)<\/itinerary>/);
    if (itineraryMatch) {
      const itineraryContent = itineraryMatch[1];

      // Split by major sections (h1, h2, h3)
      const sections = itineraryContent.split(/<h[123]>/);
      sections.forEach((section, index) => {
        if (section.trim()) {
          // Clean HTML tags but keep text content
          const textContent = section
            .replace(/<\/h[123]>/g, ': ')
            .replace(/<span[^>]*class="geo-mark"[^>]*>([^<]+)<\/span>/g, '📍 $1')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (textContent) {
            // Split very long sections into smaller chunks
            if (textContent.length > 300) {
              const words = textContent.split(' ');
              let currentChunk = '';
              words.forEach(word => {
                if ((currentChunk + ' ' + word).length <= 300) {
                  currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
                } else {
                  if (currentChunk) chunks.push(currentChunk);
                  currentChunk = word;
                }
              });
              if (currentChunk) chunks.push(currentChunk);
            } else {
              chunks.push(textContent);
            }
          }
        }
      });
    }

    // Extract text after </itinerary> tag
    const afterItinerary = htmlContent.split('</itinerary>')[1];
    if (afterItinerary && afterItinerary.trim()) {
      chunks.push(afterItinerary.trim());
    }

    return chunks;
  };

  // Generate flat array from mock messages
  const flatElements = React.useMemo(() => {
    const elements: FlatElement[] = [];

    mockMessages.forEach((message, msgIndex) => {
      const messageColor = message.role === 'user' ? '#3498DB' : '#2ECC71';

      // Extract text content from parts
      const textContent = message.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('');

      // Check if this is an itinerary message
      const hasItinerary = textContent.includes('<itinerary>');

      // Add header
      elements.push({
        id: `${message.id}-header`,
        type: 'header',
        messageId: message.id,
        messageColor: messageColor,
        text: '',
        height: 50,
        role: message.role,
        timestamp: message.createdAt,
      });

      // Add content elements
      if (hasItinerary) {
        // Parse itinerary into chunks
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
      } else {
        // Simple text message
        elements.push({
          id: `${message.id}-content-0`,
          type: 'content',
          messageId: message.id,
          messageColor: messageColor,
          text: textContent,
          height: 60,
        });
      }

      // Add footer
      elements.push({
        id: `${message.id}-footer`,
        type: 'footer',
        messageId: message.id,
        messageColor: messageColor,
        text: '',
        height: 20,
      });

      // Add gap (except after last message)
      if (msgIndex < mockMessages.length - 1) {
        elements.push({
          id: `gap-${msgIndex}`,
          type: 'gap',
          messageId: '',
          messageColor: '',
          text: '',
          height: 30,
        });
      }
    });

    return elements;
  }, [mockMessages]);

  // Calculate which items should be visible based on scroll
  const visibleThreshold = containerHeight * 0.75;

  const isItemVisible = (index: number) => {
    // Calculate actual position based on element heights before this index
    let position = 0;
    for (let i = 0; i < index; i++) {
      if (flatElements[i].type === 'gap') {
        position += flatElements[i].height + 10; // gap height + margin
      } else {
        position += flatElements[i].height; // element actual height with no margin
      }
    }

    const itemTop = position - scrollOffset;
    const itemHeight = flatElements[index].height;
    const itemBottom = itemTop + itemHeight;

    // Item is visible if its bottom edge is above the threshold
    return itemBottom <= visibleThreshold;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Map Background */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>MAP VIEW</Text>
        </View>
      </View>

      {/* Content Overlay */}
      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Test Transparency</Text>
          <Text style={styles.debugText}>
            Scroll: {Math.round(scrollOffset)} | Height: {Math.round(containerHeight)} | 75%: {Math.round(visibleThreshold)}
          </Text>
        </View>

        <View
          style={styles.scrollContainer}
          onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
          >
            {flatElements.map((element, index) => {
              // Determine background color based on element type
              let backgroundColor = element.messageColor;
              if (element.type === 'header') {
                // Darker shade for header
                backgroundColor = adjustColor(element.messageColor, -30);
              } else if (element.type === 'footer') {
                // Lighter shade for footer
                backgroundColor = adjustColor(element.messageColor, 30);
              }

              return (
                <MessageElement
                  key={element.id}
                  element={element}
                  isVisible={isItemVisible(index)}
                  backgroundColor={backgroundColor}
                />
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Input Area at bottom */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputText}>Input Area</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  mapContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapText: {
    fontSize: 24,
    color: '#0284c7',
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  debugText: {
    fontSize: 12,
    color: '#6b7280',
  },
  scrollContainer: {
    flex: 1,
    maxHeight: '75%',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  box: {
    marginBottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gapBox: {
    height: 30,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  boxText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#000',
    paddingHorizontal: 10,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  assistantAvatar: {
    backgroundColor: '#8b5cf6',
  },
  avatarText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  senderName: {
    fontWeight: '600',
    color: '#111827',
    fontSize: 14,
  },
  timestamp: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 'auto',
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  inputText: {
    color: '#6b7280',
  },
});
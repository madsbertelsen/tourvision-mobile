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

  return (
    <View
      style={[
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
      ]}
    >
      <Text style={[
        styles.boxText,
        {
          opacity: isVisible ? 1 : 0.3,
          fontWeight: element.type === 'header' ? 'bold' : 'normal',
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

  // Define 20 messages with colors and random element counts
  const messageColors = [
    '#3498DB', '#2ECC71', '#9B59B6', '#E67E22', '#E74C3C',
    '#1ABC9C', '#F39C12', '#D35400', '#C0392B', '#16A085',
    '#27AE60', '#2980B9', '#8E44AD', '#2C3E50', '#F1C40F',
    '#95A5A6', '#34495E', '#7F8C8D', '#BDC3C7', '#ECF0F1',
  ];

  const messages = React.useMemo(() =>
    messageColors.map((color, index) => ({
      id: `msg${index + 1}`,
      color: color,
      elementCount: Math.floor(Math.random() * 11) + 5, // 5-15 elements
    }))
  , []);

  // Helper to get random height for content elements
  const getRandomHeight = () => {
    const heights = [40, 60, 80];
    return heights[Math.floor(Math.random() * heights.length)];
  };

  // Generate flat array from messages
  const flatElements = React.useMemo(() => {
    const elements: FlatElement[] = [];

    messages.forEach((message, msgIndex) => {
      // Add header (always 60px)
      elements.push({
        id: `${message.id}-header`,
        type: 'header',
        messageId: message.id,
        messageColor: message.color,
        text: `Message ${msgIndex + 1} Header`,
        height: 60,
      });

      // Add content elements with random heights
      for (let i = 0; i < message.elementCount; i++) {
        elements.push({
          id: `${message.id}-content-${i}`,
          type: 'content',
          messageId: message.id,
          messageColor: message.color,
          text: `Message ${msgIndex + 1} Item ${i + 1}`,
          height: getRandomHeight(),
        });
      }

      // Add footer (always 60px)
      elements.push({
        id: `${message.id}-footer`,
        type: 'footer',
        messageId: message.id,
        messageColor: message.color,
        text: `Message ${msgIndex + 1} Footer`,
        height: 60,
      });

      // Add gap (except after last message)
      if (msgIndex < messages.length - 1) {
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
  }, [messages]);

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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
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
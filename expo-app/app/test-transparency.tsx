import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';

const { height: screenHeight } = Dimensions.get('window');

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

  // Generate flat array from messages
  const flatElements = React.useMemo(() => {
    const elements: FlatElement[] = [];

    messages.forEach((message, msgIndex) => {
      // Add header
      elements.push({
        id: `${message.id}-header`,
        type: 'header',
        messageId: message.id,
        messageColor: message.color,
        text: `Message ${msgIndex + 1} Header`,
      });

      // Add content elements
      for (let i = 0; i < message.elementCount; i++) {
        elements.push({
          id: `${message.id}-content-${i}`,
          type: 'content',
          messageId: message.id,
          messageColor: message.color,
          text: `Message ${msgIndex + 1} Item ${i + 1}`,
        });
      }

      // Add footer
      elements.push({
        id: `${message.id}-footer`,
        type: 'footer',
        messageId: message.id,
        messageColor: message.color,
        text: `Message ${msgIndex + 1} Footer`,
      });

      // Add gap (except after last message)
      if (msgIndex < messages.length - 1) {
        elements.push({
          id: `gap-${msgIndex}`,
          type: 'gap',
          messageId: '',
          messageColor: '',
          text: '',
        });
      }
    });

    return elements;
  }, [messages]);

  // Calculate which items should be visible based on scroll
  const visibleThreshold = containerHeight * 0.75;

  const isItemVisible = (index: number) => {
    // Calculate actual position based on element types before this index
    let position = 0;
    for (let i = 0; i < index; i++) {
      if (flatElements[i].type === 'gap') {
        position += 40; // gap height (30) + margin (10)
      } else {
        position += 70; // box height (60) + margin (10)
      }
    }

    const itemTop = position - scrollOffset;
    const itemHeight = flatElements[index].type === 'gap' ? 30 : 60;
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
              if (element.type === 'gap') {
                // Render gap view - always transparent, no border, smaller height
                return (
                  <View
                    key={element.id}
                    style={styles.gapBox}
                  />
                );
              }

              // Determine background color based on element type
              let backgroundColor = element.messageColor;
              if (element.type === 'header') {
                // Darker shade for header
                backgroundColor = adjustColor(element.messageColor, -30);
              } else if (element.type === 'footer') {
                // Lighter shade for footer
                backgroundColor = adjustColor(element.messageColor, 30);
              }

              // Render element
              return (
                <View
                  key={element.id}
                  style={[
                    styles.box,
                    {
                      backgroundColor: isItemVisible(index) ? backgroundColor : 'transparent',
                      borderColor: backgroundColor,
                    }
                  ]}
                >
                  <Text style={[
                    styles.boxText,
                    {
                      opacity: isItemVisible(index) ? 1 : 0.3,
                      fontWeight: element.type === 'header' ? 'bold' : 'normal',
                    }
                  ]}>
                    {element.text}
                  </Text>
                </View>
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
    height: 60,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 2,
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
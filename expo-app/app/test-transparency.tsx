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

export default function TestTransparencyScreen() {
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(0);
  const [elementPositions, setElementPositions] = React.useState<Map<string, { y: number; height: number }>>(new Map());
  const [transparentElements, setTransparentElements] = React.useState<Set<string>>(new Set());

  // Sample content
  const baseElements = [
    { type: 'h1', content: 'Paris in 2 Days' },
    { type: 'p', content: 'Experience the best of Paris with this 2-day itinerary covering iconic landmarks.' },
    { type: 'h2', content: 'Day 1: Iconic Landmarks' },
    { type: 'h3', content: 'Morning' },
    { type: 'p', content: 'Start your day at the Louvre Museum. Arrive early to beat the crowds.' },
    { type: 'p', content: 'After the Louvre, take a leisurely stroll through the Jardin des Tuileries.' },
    { type: 'h3', content: 'Afternoon' },
    { type: 'p', content: 'Head to the Eiffel Tower. Consider going up to the second floor for views.' },
    { type: 'p', content: 'Walk along the Seine River towards Notre-Dame Cathedral.' },
    { type: 'h3', content: 'Evening' },
    { type: 'p', content: 'For dinner, head to Le Procope, the oldest restaurant in Paris.' },
    { type: 'p', content: 'After dinner, take a relaxing Seine River cruise.' },
    { type: 'h2', content: 'Day 2: History and Culture' },
    { type: 'h3', content: 'Morning' },
    { type: 'p', content: 'Visit the Arc de Triomphe and walk down the Champs-Élysées.' },
    { type: 'p', content: 'Stop at a café for coffee and croissants.' },
    { type: 'footer', content: '' },
  ];

  const elements = baseElements.map((el, idx) => ({
    ...el,
    id: `el-${idx}`
  }));

  // Update transparency based on scroll
  React.useEffect(() => {
    if (containerHeight === 0) return;

    const visibleAreaHeight = containerHeight * 0.75;
    const newTransparentElements = new Set<string>();

    elementPositions.forEach((position, elementId) => {
      const elementTop = position.y - scrollOffset;
      const elementBottom = elementTop + position.height;

      // Add a small buffer to prevent flickering at the boundary
      const buffer = 2;

      // Make transparent if bottom would be cut off
      if (elementBottom > visibleAreaHeight - buffer) {
        newTransparentElements.add(elementId);
      }
    });

    // Only update state if the set has actually changed
    const hasChanged = newTransparentElements.size !== transparentElements.size ||
      [...newTransparentElements].some(id => !transparentElements.has(id));

    if (hasChanged) {
      setTransparentElements(newTransparentElements);
    }
  }, [scrollOffset, containerHeight, elementPositions, transparentElements]);

  const handleElementLayout = (elementId: string, event: any) => {
    const { y, height } = event.nativeEvent.layout;
    setElementPositions(prev => {
      const newMap = new Map(prev);
      newMap.set(elementId, { y, height });
      return newMap;
    });
  };

  const renderElement = (element: any) => {
    const isTransparent = transparentElements.has(element.id);

    const baseStyle = element.type === 'h1' ? styles.h1 :
                      element.type === 'h2' ? styles.h2 :
                      element.type === 'h3' ? styles.h3 : styles.p;

    return (
      <View
        key={element.id}
        style={styles.elementContainer}
        onLayout={(event) => handleElementLayout(element.id, event)}
      >
        {!isTransparent && <View style={styles.elementBackground} />}
        <Text style={[baseStyle, isTransparent && { opacity: 0 }]}>{element.content}</Text>
      </View>
    );
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
            Scroll: {Math.round(scrollOffset)} | Height: {Math.round(containerHeight)} | 75%: {Math.round(containerHeight * 0.75)}
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
            <View style={styles.messageContainer}>
              <View
                style={[styles.messageHeader, {
                  backgroundColor: '#10b981',
                  marginHorizontal: -16,
                  marginTop: -16,
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 12,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12
                }]}
                onLayout={(event) => handleElementLayout('header', event)}
              >
                {!transparentElements.has('header') && (
                  <Text style={styles.messageTitle}>AI Response</Text>
                )}
              </View>
              <View style={styles.itineraryContent}>
                {elements.map(renderElement)}
              </View>
              <View
                style={{
                  backgroundColor: transparentElements.has('footer') ? 'transparent' : '#10b981',
                  height: 16,
                  marginHorizontal: -16,
                  marginBottom: -16,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 12,
                }}
                onLayout={(event) => handleElementLayout('footer', event)}
              />
            </View>
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
    marginBottom: 0, // Remove margin to allow input to be at very bottom
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
    maxHeight: '70%', // Limit to 70% of screen
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  messageContainer: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  messageHeader: {
    marginBottom: 0,
  },
  messageTitle: {
    fontWeight: '600',
    fontSize: 14,
    color: '#6b7280',
  },
  itineraryContent: {
    // Container for itinerary elements
  },
  elementContainer: {
    marginBottom: 0,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  elementBackground: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -16,
    right: -16,
    backgroundColor: '#10b981',
    zIndex: -1,
  },
  h1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  h2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
  },
  h3: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
  },
  p: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
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
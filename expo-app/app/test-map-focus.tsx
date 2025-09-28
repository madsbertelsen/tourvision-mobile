import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageElementWithFocus, FlatElement, messageElementWithFocusStyles } from '@/components/MessageElementWithFocus';
import { MapViewWrapper } from '@/components/MapViewWrapper';

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

// Mock Barcelona itinerary data with geo-marks
const mockElements: FlatElement[] = [
  // Message 1
  { id: 'm1-header', type: 'header', messageId: 'm1', messageColor: '#e3f2fd', height: 50, role: 'user', timestamp: new Date() },
  { id: 'm1-content-1', type: 'content', messageId: 'm1', messageColor: '#e3f2fd', text: 'Let me start planning my Barcelona trip. I want to see the main attractions.', height: 40 },
  { id: 'm1-footer', type: 'footer', messageId: 'm1', messageColor: '#e3f2fd', height: 10 },
  { id: 'gap-1', type: 'gap', messageId: 'gap', messageColor: 'transparent', height: 20 },

  // Message 2 with geo-marks
  { id: 'm2-header', type: 'header', messageId: 'm2', messageColor: '#fff8e1', height: 50, role: 'assistant', timestamp: new Date() },
  { 
    id: 'm2-content-1', 
    type: 'content', 
    messageId: 'm2', 
    messageColor: '#fff8e1', 
    height: 60,
    parsedContent: [
      { type: 'text', text: 'Great! Barcelona has amazing architecture. Start with' },
      { type: 'geo-mark', text: 'Sagrada Familia', color: '#3B82F6', lat: '41.4036', lng: '2.1744' },
      { type: 'text', text: 'in the morning when it\'s less crowded.' }
    ]
  },
  { id: 'm2-footer', type: 'footer', messageId: 'm2', messageColor: '#fff8e1', height: 10 },
  { id: 'gap-2', type: 'gap', messageId: 'gap', messageColor: 'transparent', height: 20 },

  // Message 3 with multiple geo-marks
  { id: 'm3-header', type: 'header', messageId: 'm3', messageColor: '#fff8e1', height: 50, role: 'assistant', timestamp: new Date() },
  { 
    id: 'm3-content-1', 
    type: 'content', 
    messageId: 'm3', 
    messageColor: '#fff8e1', 
    height: 80,
    parsedContent: [
      { type: 'text', text: 'Then explore' },
      { type: 'geo-mark', text: 'Park Güell', color: '#10B981', lat: '41.4145', lng: '2.1527' },
      { type: 'text', text: 'for Gaudí\'s colorful mosaics and visit' },
      { type: 'geo-mark', text: 'Casa Batlló', color: '#F59E0B', lat: '41.3916', lng: '2.1649' },
      { type: 'text', text: 'on Passeig de Gràcia.' }
    ]
  },
  { id: 'm3-footer', type: 'footer', messageId: 'm3', messageColor: '#fff8e1', height: 10 },
  { id: 'gap-3', type: 'gap', messageId: 'gap', messageColor: 'transparent', height: 20 },

  // Message 4
  { id: 'm4-header', type: 'header', messageId: 'm4', messageColor: '#e3f2fd', height: 50, role: 'user', timestamp: new Date() },
  { id: 'm4-content-1', type: 'content', messageId: 'm4', messageColor: '#e3f2fd', text: 'What about beaches and food?', height: 40 },
  { id: 'm4-footer', type: 'footer', messageId: 'm4', messageColor: '#e3f2fd', height: 10 },
  { id: 'gap-4', type: 'gap', messageId: 'gap', messageColor: 'transparent', height: 20 },

  // Message 5 with geo-marks
  { id: 'm5-header', type: 'header', messageId: 'm5', messageColor: '#fff8e1', height: 50, role: 'assistant', timestamp: new Date() },
  { 
    id: 'm5-content-1', 
    type: 'content', 
    messageId: 'm5', 
    messageColor: '#fff8e1', 
    height: 100,
    parsedContent: [
      { type: 'text', text: 'For beaches, head to' },
      { type: 'geo-mark', text: 'Barceloneta Beach', color: '#06B6D4', lat: '41.3809', lng: '2.1896' },
      { type: 'text', text: 'for swimming and sunbathing. For food, explore' },
      { type: 'geo-mark', text: 'La Boqueria Market', color: '#EC4899', lat: '41.3817', lng: '2.1719' },
      { type: 'text', text: 'on Las Ramblas for fresh produce and tapas.' }
    ]
  },
  { 
    id: 'm5-content-2', 
    type: 'content', 
    messageId: 'm5', 
    messageColor: '#fff8e1', 
    height: 60,
    parsedContent: [
      { type: 'text', text: 'Don\'t miss the' },
      { type: 'geo-mark', text: 'Gothic Quarter', color: '#8B5CF6', lat: '41.3825', lng: '2.1769' },
      { type: 'text', text: 'for narrow medieval streets and hidden plazas.' }
    ]
  },
  { id: 'm5-footer', type: 'footer', messageId: 'm5', messageColor: '#fff8e1', height: 10 },
  { id: 'gap-5', type: 'gap', messageId: 'gap', messageColor: 'transparent', height: 20 },

  // Add more content for scrolling
  { id: 'm6-header', type: 'header', messageId: 'm6', messageColor: '#e3f2fd', height: 50, role: 'user', timestamp: new Date() },
  { id: 'm6-content-1', type: 'content', messageId: 'm6', messageColor: '#e3f2fd', text: 'How many days should I plan for?', height: 40 },
  { id: 'm6-footer', type: 'footer', messageId: 'm6', messageColor: '#e3f2fd', height: 10 },
  { id: 'gap-6', type: 'gap', messageId: 'gap', messageColor: 'transparent', height: 20 },

  { id: 'm7-header', type: 'header', messageId: 'm7', messageColor: '#fff8e1', height: 50, role: 'assistant', timestamp: new Date() },
  { id: 'm7-content-1', type: 'content', messageId: 'm7', messageColor: '#fff8e1', text: 'I\'d recommend 4-5 days minimum to see the highlights without rushing. This gives you time to explore neighborhoods, enjoy meals, and take in the culture.', height: 60 },
  { id: 'm7-footer', type: 'footer', messageId: 'm7', messageColor: '#fff8e1', height: 10 },
];

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
            if (!isNaN(lat) && !isNaN(lng)) {
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

export default function TestMapFocus() {
  const [inputText, setInputText] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const messagesScrollRef = useRef<ScrollView>(null);
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<{name: string, lat: number, lng: number} | null>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Square map size based on screen width
  const mapSize = screenWidth;
  
  // Calculate visibility threshold (75% of container)
  const visibleThreshold = containerHeight * 0.75;
  
  // Track element positions
  const [elementPositions, setElementPositions] = useState<Map<string, {top: number, bottom: number}>>(new Map());
  
  // Track visible elements for focus detection
  const [visibleElements, setVisibleElements] = useState<Set<string>>(new Set());
  
  // Check if an item is visible based on scroll position
  const isItemVisible = (elementId: string) => {
    return visibleElements.has(elementId);
  };

  // Update visibility and focus as a side effect of scroll
  useEffect(() => {
    // Calculate which elements are visible
    const newVisibleElements = new Set<string>();
    let closestVisibleGeoMarkElement: FlatElement | null = null;
    let closestDistance = Infinity;
    const focusPoint = visibleThreshold * 0.75; // Focus point at 75% of visible area
    
    // First pass: determine which content elements are visible
    const visibleContentByMessage = new Map<string, boolean>();
    
    mockElements.forEach(element => {
      const position = elementPositions.get(element.id);
      if (position) {
        const itemBottom = position.bottom - scrollOffset;
        const isVisible = itemBottom <= visibleThreshold;
        
        // Track visible content elements by message
        if (isVisible && element.type === 'content') {
          visibleContentByMessage.set(element.messageId, true);
        }
      }
    });
    
    // Second pass: add elements to visible set, considering grouped visibility for headers
    mockElements.forEach(element => {
      const position = elementPositions.get(element.id);
      if (position) {
        const itemBottom = position.bottom - scrollOffset;
        const isVisible = itemBottom <= visibleThreshold;
        
        // Headers only become visible when at least one content from same message is visible
        if (element.type === 'header') {
          if (isVisible && visibleContentByMessage.has(element.messageId)) {
            newVisibleElements.add(element.id);
          }
        } else if (isVisible) {
          // All other elements follow normal visibility rules
          newVisibleElements.add(element.id);
          
          // Check if this visible element has geo-marks for focus detection
          if (element.type === 'content' && element.parsedContent) {
            const hasGeoMark = element.parsedContent.some(item => item.type === 'geo-mark');
            if (hasGeoMark) {
              // Calculate distance from focus point
              const elementCenter = (position.top + position.bottom) / 2 - scrollOffset;
              const distance = Math.abs(elementCenter - focusPoint);
              
              if (distance < closestDistance) {
                closestDistance = distance;
                closestVisibleGeoMarkElement = element;
              }
            }
          }
        }
      }
    });
    
    setVisibleElements(newVisibleElements);
    
    // Update focus based on closest visible element with geo-marks
    if (closestVisibleGeoMarkElement && closestVisibleGeoMarkElement.id !== focusedElementId) {
      // Clear previous timeout
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      
      // Set new focus after delay
      const elementToFocus = closestVisibleGeoMarkElement;
      focusTimeoutRef.current = setTimeout(() => {
        setFocusedElementId(elementToFocus.id);
      }, 500); // 500ms delay before focusing
    } else if (!closestVisibleGeoMarkElement && focusedElementId) {
      // Clear focus if no visible element with geo-marks
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      setFocusedElementId(null);
      setFocusedLocation(null);
    }
  }, [scrollOffset, visibleThreshold, elementPositions, focusedElementId]);

  // Handle location focus from MessageElementWithFocus
  const handleLocationFocus = useCallback((locations: Array<{name: string, lat: number, lng: number}>) => {
    if (locations.length > 0) {
      // Focus on the first location in the focused element
      setFocusedLocation(locations[0]);
    }
  }, []);
  
  // Handle sending messages (mock)
  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    setInputText('');
    // In test mode, just clear the input
    setTimeout(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  // Get all locations for map
  const allLocations = extractAllLocations(mockElements);

  // Combine styles
  const styles = StyleSheet.create({
    ...messageElementWithFocusStyles,
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
    debugInfo: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: 8,
      borderRadius: 4,
      zIndex: 1000,
    },
    debugText: {
      color: 'white',
      fontSize: 12,
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
              locations={allLocations.map((loc, idx) => ({
                id: `loc-${idx}`,
                name: loc.name,
                lat: loc.lat,
                lng: loc.lng,
                colorIndex: getColorIndex(loc.color), // Use the actual color index
              }))}
              focusedLocation={focusedLocation ? {
                id: 'focused',
                name: focusedLocation.name,
                lat: focusedLocation.lat,
                lng: focusedLocation.lng,
                colorIndex: getColorIndex(
                  allLocations.find(loc => 
                    loc.name === focusedLocation.name && 
                    loc.lat === focusedLocation.lat && 
                    loc.lng === focusedLocation.lng
                  )?.color
                ), // Use the correct color index for focused location
              } : null}
              height={mapSize}
            />
          </View>

          {/* Chat overlay - absolute positioned over the map */}
          <View style={styles.chatOverlay}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Map-Chat Focus Test</Text>
              <Text style={styles.headerSubtitle}>Geo-marks transition from gray to colored when focused</Text>
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
                {mockElements.map((element) => {
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
                      <MessageElementWithFocus
                        element={element}
                        isVisible={isItemVisible(element.id)}
                        isFocused={focusedElementId === element.id}
                        backgroundColor="white"
                        styles={styles}
                        onFocus={handleLocationFocus}
                        transitionDuration={300}
                      />
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            
            {/* Focus indicator for debugging */}
            <View style={styles.debugInfo}>
              <Text style={styles.debugText}>
                Focused: {focusedElementId || 'None'}
              </Text>
              {focusedLocation && (
                <Text style={styles.debugText}>
                  Location: {focusedLocation.name}
                </Text>
              )}
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


import React, { useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { parseHTML, ParsedElement } from '@/utils/html-parser';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

// Define marker colors to match the map
const MARKER_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
];

interface NativeItineraryViewerProps {
  content: string;
  isStreaming?: boolean;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  onLocationsUpdate?: (locations: Location[]) => void;
}

// Extract all geo-marks from parsed elements
function extractLocations(elements: ParsedElement[]): Location[] {
  const locations: Location[] = [];
  let colorIndex = 0;
  const seenLocations = new Set<string>();

  const traverse = (element: ParsedElement) => {
    if (element.type === 'geo-mark' && element.attributes) {
      const { dataLat, dataLng, dataPlaceName } = element.attributes;
      const name = element.content || dataPlaceName || 'Unknown';

      // Skip if coordinates are pending or invalid
      if (!dataLat || !dataLng || dataLat === 'PENDING' || dataLng === 'PENDING') {
        return;
      }

      // Skip duplicate locations
      const locationKey = `${name}-${dataLat}-${dataLng}`;
      if (seenLocations.has(locationKey)) {
        return;
      }
      seenLocations.add(locationKey);

      const lat = parseFloat(dataLat);
      const lng = parseFloat(dataLng);

      if (!isNaN(lat) && !isNaN(lng)) {
        locations.push({
          id: `location-${locations.length}`,
          name,
          lat,
          lng,
          colorIndex: colorIndex % 10, // Cycle through 10 colors
        });
        colorIndex++;
      }
    }

    // Recursively traverse children
    if (element.children) {
      element.children.forEach(traverse);
    }
  };

  elements.forEach(traverse);
  return locations;
}

export function NativeItineraryViewer({
  content,
  isStreaming = false,
  onLocationClick,
  onLocationsUpdate,
}: NativeItineraryViewerProps) {
  // Parse HTML content
  const parsedElements = useMemo(() => {
    if (!content) return [];
    try {
      return parseHTML(content);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [];
    }
  }, [content]);

  // Extract locations and create a map for color indices
  const locationColorMap = useMemo(() => {
    const map = new Map<string, number>();
    const locations = extractLocations(parsedElements);
    locations.forEach((loc) => {
      const key = `${loc.name}-${loc.lat}-${loc.lng}`;
      if (loc.colorIndex !== undefined) {
        map.set(key, loc.colorIndex);
      }
    });
    return map;
  }, [parsedElements]);

  // Extract locations and notify parent
  useEffect(() => {
    if (onLocationsUpdate && parsedElements.length > 0) {
      const locations = extractLocations(parsedElements);
      onLocationsUpdate(locations);
    }
  }, [content]); // Only depend on content, not onLocationsUpdate

  // Render a parsed element
  const renderElement = (element: ParsedElement, index: number): React.ReactNode => {
    switch (element.type) {
      case 'h1':
        return (
          <Text key={index} style={styles.h1}>
            {element.content}
            {element.children && element.children.map((child, i) => renderElement(child, i))}
          </Text>
        );

      case 'h2':
        return (
          <Text key={index} style={styles.h2}>
            {element.content}
            {element.children && element.children.map((child, i) => renderElement(child, i))}
          </Text>
        );

      case 'h3':
        return (
          <Text key={index} style={styles.h3}>
            {element.content}
            {element.children && element.children.map((child, i) => renderElement(child, i))}
          </Text>
        );

      case 'p':
        return (
          <View key={index} style={styles.paragraph}>
            {element.content ? (
              <Text style={styles.text}>{element.content}</Text>
            ) : (
              <Text style={styles.text}>
                {element.children?.map((child, i) => {
                  if (child.type === 'geo-mark') {
                    return renderGeoMark(child, i, true);
                  }
                  return renderInlineElement(child, i);
                })}
              </Text>
            )}
          </View>
        );

      case 'ul':
        return (
          <View key={index} style={styles.list}>
            {element.children?.map((child, i) => renderElement(child, i))}
          </View>
        );

      case 'li':
        return (
          <View key={index} style={styles.listItem}>
            <Text style={styles.bullet}>• </Text>
            <View style={styles.listItemContent}>
              {element.children?.map((child, i) => {
                if (child.type === 'text') {
                  return <Text key={i} style={styles.text}>{child.content}</Text>;
                }
                return renderElement(child, i);
              })}
            </View>
          </View>
        );

      case 'geo-mark':
        return renderGeoMark(element, index);

      case 'br':
        return <Text key={index}>{'\n'}</Text>;

      case 'text':
        return (
          <Text key={index} style={styles.text}>
            {element.content}
          </Text>
        );

      case 'itinerary':
        return (
          <View key={index} style={styles.itineraryContainer}>
            {/* Render the itinerary content */}
            {element.children?.map((child, i) => renderElement(child, i))}
          </View>
        );

      case 'strong':
        return (
          <Text key={index} style={[styles.text, styles.bold]}>
            {element.content || element.children?.map((child, i) => {
              if (child.type === 'text') return child.content;
              return null;
            }).join('')}
          </Text>
        );

      case 'em':
        return (
          <Text key={index} style={[styles.text, styles.italic]}>
            {element.content || element.children?.map((child, i) => {
              if (child.type === 'text') return child.content;
              return null;
            }).join('')}
          </Text>
        );

      default:
        return null;
    }
  };

  // Render inline elements (for use within text)
  const renderInlineElement = (element: ParsedElement, index: number): React.ReactNode => {
    if (element.type === 'text') {
      return element.content;
    }
    if (element.type === 'geo-mark') {
      return renderGeoMark(element, index, true);
    }
    return null;
  };

  // Render a geo-mark as a clickable location with colored marker
  const renderGeoMark = (element: ParsedElement, index: number, isInline: boolean = false): React.ReactNode => {
    const { dataLat, dataLng, dataPlaceName } = element.attributes || {};
    const locationName = element.content || dataPlaceName || 'Unknown Location';

    // Get the color index for this location
    const locationKey = `${locationName}-${dataLat}-${dataLng}`;
    const colorIndex = locationColorMap.get(locationKey) ?? 0;
    const markerColor = MARKER_COLORS[colorIndex % MARKER_COLORS.length];

    // For inline rendering within text
    if (isInline) {
      if (onLocationClick && dataLat && dataLng) {
        // Note: TouchableOpacity doesn't work well inline in Text
        // So we'll just render as styled text with colored dot
        return (
          <Text key={index}>
            <Text style={[styles.geoMarkDotInline, { color: markerColor }]}>● </Text>
            <Text style={styles.geoMarkInline}>{locationName}</Text>
          </Text>
        );
      }
      return (
        <Text key={index}>
          <Text style={[styles.geoMarkDotInline, { color: markerColor }]}>● </Text>
          <Text style={styles.geoMarkInline}>{locationName}</Text>
        </Text>
      );
    }

    // For standalone rendering
    if (onLocationClick && dataLat && dataLng) {
      return (
        <TouchableOpacity
          key={index}
          onPress={() => onLocationClick(locationName, dataLat, dataLng)}
          style={styles.geoMarkTouchable}
        >
          <View style={styles.geoMarkContainer}>
            <View style={[styles.geoMarkDot, { backgroundColor: markerColor }]} />
            <Text style={styles.geoMark}>
              {locationName}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View key={index} style={styles.geoMarkContainer}>
        <View style={[styles.geoMarkDot, { backgroundColor: markerColor }]} />
        <Text style={styles.geoMark}>
          {locationName}
        </Text>
      </View>
    );
  };

  if (parsedElements.length === 0 && !isStreaming) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No itinerary content available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {parsedElements.map((element, index) => renderElement(element, index))}

        {isStreaming && (
          <View style={styles.streamingIndicator}>
            <ActivityIndicator size="small" color="#8b5cf6" />
            <Text style={styles.streamingText}>Loading more...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  h1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
    marginTop: 8,
  },
  h2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 12,
    marginTop: 16,
  },
  h3: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
    marginTop: 12,
  },
  paragraph: {
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  list: {
    marginBottom: 12,
    paddingLeft: 8,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  bullet: {
    fontSize: 14,
    color: '#6b7280',
    marginRight: 4,
  },
  listItemContent: {
    flex: 1,
  },
  geoMark: {
    color: '#374151', // Same as regular text color
    fontWeight: '600',
  },
  geoMarkTouchable: {
    display: 'flex',
  },
  geoMarkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  geoMarkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  geoMarkInline: {
    color: '#374151', // Same as regular text color
    fontWeight: '600',
  },
  geoMarkDotInline: {
    fontSize: 10,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    padding: 20,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  streamingText: {
    fontSize: 14,
    color: '#8b5cf6',
    marginLeft: 8,
  },
  itineraryContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
});
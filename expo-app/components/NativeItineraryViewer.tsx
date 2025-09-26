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
  yPosition?: number;
  height?: number;
}

// Define marker colors to match the map
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

interface NativeItineraryViewerProps {
  content: string;
  isStreaming?: boolean;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  onLocationsUpdate?: (locations: Location[]) => void;
  onVisibleLocationChange?: (location: Location) => void;
  messageId?: string;
  focusedLocation?: Location | null;
  highlightedParagraphId?: string | null;
  onParagraphPositionUpdate?: (id: string, y: number, height: number) => void;
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
  onVisibleLocationChange,
  messageId,
  focusedLocation,
  highlightedParagraphId,
  onParagraphPositionUpdate,
}: NativeItineraryViewerProps) {
  // Track geo-mark positions
  const locationPositions = React.useRef<Map<string, { yPosition: number; height: number }>>(new Map());
  const scrollViewRef = React.useRef<ScrollView>(null);
  const containerRef = React.useRef<View>(null);
  const paragraphGeoMarks = React.useRef<Map<number, string[]>>(new Map()); // Track which geo-marks are in each paragraph

  // Remove local paragraph tracking since parent handles it now

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

  // Track all paragraph IDs in order
  const elementIdsRef = React.useRef<string[]>([]);

  // Collect element IDs during render
  const collectElementId = React.useCallback((id: string) => {
    if (!elementIdsRef.current.includes(id)) {
      elementIdsRef.current.push(id);
    }
  }, []);

  // Determine which elements should be visible based on highlighted element
  const isElementVisible = React.useCallback((elementId: string): boolean => {
    if (!highlightedParagraphId) return false;

    const highlightedIndex = elementIdsRef.current.indexOf(highlightedParagraphId);
    const elementIndex = elementIdsRef.current.indexOf(elementId);

    if (highlightedIndex === -1 || elementIndex === -1) return false;

    // All elements up to and including the highlighted one should be visible
    return elementIndex <= highlightedIndex;
  }, [highlightedParagraphId]);

  // Extract locations and notify parent
  const locations = useMemo(() => {
    if (parsedElements.length > 0) {
      return extractLocations(parsedElements);
    }
    return [];
  }, [parsedElements]);

  useEffect(() => {
    if (onLocationsUpdate && locations.length > 0) {
      // Add position data if available
      const locationsWithPositions = locations.map(loc => {
        const key = `${loc.name}-${loc.lat}-${loc.lng}`;
        const position = locationPositions.current.get(key);
        if (position) {
          return { ...loc, ...position };
        }
        return loc;
      });
      onLocationsUpdate(locationsWithPositions);
    }
  }, [content]); // Only depend on content, not onLocationsUpdate

  // Render a parsed element
  const renderElement = (element: ParsedElement, index: number): React.ReactNode => {
    switch (element.type) {
      case 'h1': {
        const headerId = `h1-${messageId}-${index}`;
        collectElementId(headerId);
        const isHeaderHighlighted = highlightedParagraphId === headerId;
        const isVisible = isElementVisible(headerId);

        return (
          <View
            key={index}
            style={[
              styles.headerContainer,
              !isVisible && styles.elementHidden,
              isHeaderHighlighted && styles.paragraphFocused
            ]}
            onLayout={(event) => {
              event.target.measureInWindow((x, y, width, height) => {
                if (onParagraphPositionUpdate) {
                  onParagraphPositionUpdate(headerId, y, height);
                }
              });
            }}
          >
            <Text style={styles.h1}>
              {element.content}
              {element.children && element.children.map((child, i) => renderElement(child, i))}
            </Text>
          </View>
        );
      }

      case 'h2': {
        const headerId = `h2-${messageId}-${index}`;
        collectElementId(headerId);
        const isHeaderHighlighted = highlightedParagraphId === headerId;
        const isVisible = isElementVisible(headerId);

        return (
          <View
            key={index}
            style={[
              styles.headerContainer,
              !isVisible && styles.elementHidden,
              isHeaderHighlighted && styles.paragraphFocused
            ]}
            onLayout={(event) => {
              event.target.measureInWindow((x, y, width, height) => {
                if (onParagraphPositionUpdate) {
                  onParagraphPositionUpdate(headerId, y, height);
                }
              });
            }}
          >
            <Text style={styles.h2}>
              {element.content}
              {element.children && element.children.map((child, i) => renderElement(child, i))}
            </Text>
          </View>
        );
      }

      case 'h3': {
        const headerId = `h3-${messageId}-${index}`;
        collectElementId(headerId);
        const isHeaderHighlighted = highlightedParagraphId === headerId;
        const isVisible = isElementVisible(headerId);

        return (
          <View
            key={index}
            style={[
              styles.headerContainer,
              !isVisible && styles.elementHidden,
              isHeaderHighlighted && styles.paragraphFocused
            ]}
            onLayout={(event) => {
              event.target.measureInWindow((x, y, width, height) => {
                if (onParagraphPositionUpdate) {
                  onParagraphPositionUpdate(headerId, y, height);
                }
              });
            }}
          >
            <Text style={styles.h3}>
              {element.content}
              {element.children && element.children.map((child, i) => renderElement(child, i))}
            </Text>
          </View>
        );
      }

      case 'p':
        // Track which geo-marks are in this paragraph
        const geoMarksInParagraph: string[] = [];
        const paragraphId = `p-${messageId}-${index}`;
        collectElementId(paragraphId);
        const isParagraphHighlighted = highlightedParagraphId === paragraphId;
        const isParagraphVisible = isElementVisible(paragraphId);

        if (element.children) {
          element.children.forEach(child => {
            if (child.type === 'geo-mark' && child.attributes) {
              const { dataLat, dataLng, dataPlaceName } = child.attributes;
              const name = child.content || dataPlaceName || 'Unknown';
              const key = `${name}-${dataLat}-${dataLng}`;
              geoMarksInParagraph.push(key);
            }
          });
        }

        return (
          <View
            key={index}
            style={[
              styles.paragraph,
              !isParagraphVisible && styles.elementHidden,
              isParagraphHighlighted && styles.paragraphFocused
            ]}
            onLayout={(event) => {
              // Report position to parent
              event.target.measureInWindow((x, y, width, height) => {
                // Report paragraph position to parent
                if (onParagraphPositionUpdate) {
                  onParagraphPositionUpdate(paragraphId, y, height);
                }

                // Also update geo-mark positions if any
                if (geoMarksInParagraph.length > 0) {
                  console.log(`Paragraph with geo-marks layout: Y=${y}, Height=${height}`);
                  geoMarksInParagraph.forEach(geoMarkKey => {
                    updateGeoMarkPosition(geoMarkKey, y, height);
                  });
                }
              });
            }}
          >
            <Text style={styles.text}>
              {element.content || element.children?.map((child, i) => {
                if (child.type === 'geo-mark') {
                  return renderGeoMark(child, i, true);
                }
                if (child.type === 'text') {
                  return child.content;
                }
                return renderInlineElement(child, i);
              })}
            </Text>
          </View>
        );

      case 'ul':
        return (
          <View key={index} style={styles.list}>
            {element.children?.map((child, i) => renderElement(child, i))}
          </View>
        );

      case 'li':
        // Track geo-marks in list items too
        const listItemGeoMarks: string[] = [];
        const listItemId = `li-${messageId}-${index}`;
        collectElementId(listItemId);
        const isListItemHighlighted = highlightedParagraphId === listItemId;
        const isListItemVisible = isElementVisible(listItemId);

        const findGeoMarksInElement = (el: ParsedElement) => {
          if (el.type === 'geo-mark' && el.attributes) {
            const { dataLat, dataLng, dataPlaceName } = el.attributes;
            const name = el.content || dataPlaceName || 'Unknown';
            const key = `${name}-${dataLat}-${dataLng}`;
            listItemGeoMarks.push(key);
          }
          if (el.children) {
            el.children.forEach(findGeoMarksInElement);
          }
        };
        if (element.children) {
          element.children.forEach(findGeoMarksInElement);
        }

        return (
          <View
            key={index}
            style={[
              styles.listItem,
              !isListItemVisible && styles.elementHidden,
              isListItemHighlighted && styles.listItemFocused
            ]}
            onLayout={(event) => {
              // Report position to parent
              event.target.measureInWindow((x, y, width, height) => {
                // Report list item position to parent
                if (onParagraphPositionUpdate) {
                  onParagraphPositionUpdate(listItemId, y, height);
                }

                // Also update geo-mark positions if any
                if (listItemGeoMarks.length > 0) {
                  console.log(`List item with geo-marks layout: Y=${y}, Height=${height}`);
                  listItemGeoMarks.forEach(geoMarkKey => {
                    updateGeoMarkPosition(geoMarkKey, y, height);
                  });
                }
              });
            }}
          >
            <Text style={styles.bullet}>• </Text>
            <View style={styles.listItemContent}>
              {element.children?.map((child, i) => {
                if (child.type === 'text') {
                  return <Text key={i} style={styles.text}>{child.content}</Text>;
                }
                if (child.type === 'geo-mark') {
                  // Render inline geo-marks in list items
                  return (
                    <Text key={i} style={styles.text}>
                      {renderGeoMark(child, i, true)}
                    </Text>
                  );
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
    if (element.type === 'strong') {
      return <Text key={index} style={styles.bold}>{element.content || element.children?.map((child, i) => renderInlineElement(child, i))}</Text>;
    }
    if (element.type === 'em') {
      return <Text key={index} style={styles.italic}>{element.content || element.children?.map((child, i) => renderInlineElement(child, i))}</Text>;
    }
    return null;
  };

  // Track when a geo-mark's position changes
  const updateGeoMarkPosition = React.useCallback((locationKey: string, y: number, height: number) => {
    console.log(`GeoMark position update: ${locationKey} -> Y=${y}, Height=${height}`);
    locationPositions.current.set(locationKey, { yPosition: y, height });

    // Update locations with new position
    if (onLocationsUpdate) {
      const locationsWithPositions = locations.map(loc => {
        const key = `${loc.name}-${loc.lat}-${loc.lng}`;
        const position = locationPositions.current.get(key);
        if (position) {
          return { ...loc, ...position };
        }
        return loc;
      });
      onLocationsUpdate(locationsWithPositions);
    }
  }, [locations, onLocationsUpdate]);

  // Render a geo-mark as a clickable location with colored marker
  const renderGeoMark = (element: ParsedElement, index: number, isInline: boolean = false): React.ReactNode => {
    const { dataLat, dataLng, dataPlaceName } = element.attributes || {};
    const locationName = element.content || dataPlaceName || 'Unknown Location';

    // Get the color index for this location
    const locKey = `${locationName}-${dataLat}-${dataLng}`;
    const colorIndex = locationColorMap.get(locKey) ?? 0;
    const markerColor = MARKER_COLORS[colorIndex % MARKER_COLORS.length];

    // For inline rendering within text
    if (isInline) {
      // Return Text elements that can be inline with other text
      if (onLocationClick && dataLat && dataLng) {
        return (
          <Text key={index}>
            <Text style={[styles.geoMarkDotInline, { color: markerColor }]}>● </Text>
            <Text
              style={styles.geoMarkInline}
              onPress={() => onLocationClick(locationName, dataLat, dataLng)}
            >
              {locationName}
            </Text>
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
    const handleLayout = (event: any) => {
      // Use measureInWindow to get absolute position
      event.target.measureInWindow((x, y, width, height) => {
        console.log(`Standalone GeoMark measureInWindow: ${locationName} -> Y=${y}, Height=${height}`);
        updateGeoMarkPosition(locKey, y, height);
      });
    };

    if (onLocationClick && dataLat && dataLng) {
      return (
        <TouchableOpacity
          key={index}
          onPress={() => onLocationClick(locationName, dataLat, dataLng)}
          style={styles.geoMarkTouchable}
          onLayout={handleLayout}
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
      <View key={index} style={styles.geoMarkContainer} onLayout={handleLayout}>
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
    <View ref={containerRef} style={styles.container}>
      {/* Removed internal ScrollView since we're nested in parent ScrollView */}
      <View style={styles.scrollContent}>
        {parsedElements.map((element, index) => renderElement(element, index))}

        {isStreaming && (
          <View style={styles.streamingIndicator}>
            <ActivityIndicator size="small" color="#8b5cf6" />
            <Text style={styles.streamingText}>Loading more...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    backgroundColor: 'transparent',
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
  elementHidden: {
    opacity: 0.05, // Extremely transparent - map fully visible through text
    backgroundColor: 'transparent',
  },
  paragraphFocused: {
    opacity: 1, // Full visibility when highlighted
    backgroundColor: 'transparent', // Transparent background to show map
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
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
  listItemFocused: {
    opacity: 1, // Full visibility when highlighted
    backgroundColor: 'transparent', // Transparent background to show map
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerContainer: {
    // Container for headers to allow highlighting
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
    backgroundColor: 'transparent',
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
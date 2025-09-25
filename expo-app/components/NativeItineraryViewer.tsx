import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { parseHTML, ParsedElement } from '@/utils/html-parser';

interface NativeItineraryViewerProps {
  content: string;
  isStreaming?: boolean;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
}

export function NativeItineraryViewer({
  content,
  isStreaming = false,
  onLocationClick,
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
                    return (
                      <Text key={i}>
                        {renderGeoMark(child, i)}
                      </Text>
                    );
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
      return renderGeoMark(element, index);
    }
    return null;
  };

  // Render a geo-mark as a clickable location
  const renderGeoMark = (element: ParsedElement, index: number): React.ReactNode => {
    const { dataLat, dataLng, dataPlaceName } = element.attributes || {};
    const locationName = element.content || dataPlaceName || 'Unknown Location';

    if (onLocationClick && dataLat && dataLng) {
      return (
        <TouchableOpacity
          key={index}
          onPress={() => onLocationClick(locationName, dataLat, dataLng)}
          style={styles.geoMarkTouchable}
        >
          <Text style={styles.geoMark}>
            📍 {locationName}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <Text key={index} style={styles.geoMark}>
        📍 {locationName}
      </Text>
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
    color: '#3b82f6',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  geoMarkTouchable: {
    display: 'flex',
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
});
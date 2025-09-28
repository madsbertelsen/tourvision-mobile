import React, { useEffect, useRef } from 'react';
import { Text, View, StyleSheet, Animated } from 'react-native';

// Enhanced type definitions with focus support
export type FlatElement = {
  id: string;
  type: 'header' | 'content' | 'footer' | 'gap';
  messageId: string;
  messageColor: string;
  text?: string;
  htmlContent?: string;
  height: number;
  role?: 'user' | 'assistant';
  timestamp?: Date;
  isItineraryContent?: boolean;
  parsedContent?: Array<{
    type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3';
    text: string;
    color?: string; // Assigned color when active
    lat?: string | null;
    lng?: string | null;
  }>;
  isHeading?: boolean;
  headingLevel?: 1 | 2 | 3;
};

export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
  yPosition?: number;
  height?: number;
}

interface MessageElementWithFocusProps {
  element: FlatElement;
  isVisible: boolean;
  isFocused: boolean; // New: whether this element is in focus
  backgroundColor?: string;
  onLocationsUpdate?: (locations: Location[]) => void;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  onFocus?: (locations: Array<{name: string, lat: number, lng: number}>) => void;
  scrollOffset?: number;
  containerHeight?: number;
  styles: any;
  transitionDuration?: number;
}

// Colors
const INACTIVE_COLOR = '#6B7280'; // gray-500
const INACTIVE_TEXT_COLOR = '#9CA3AF'; // gray-400

export const MessageElementWithFocus: React.FC<MessageElementWithFocusProps> = ({
  element,
  isVisible,
  isFocused,
  backgroundColor = 'white',
  onLocationsUpdate,
  onLocationClick,
  onFocus,
  scrollOffset,
  containerHeight,
  styles,
  transitionDuration = 300,
}) => {
  // Animated values for geo-mark colors
  const geoMarkAnimations = useRef<Map<string, Animated.Value>>(new Map()).current;
  
  // Initialize animation values for geo-marks
  useEffect(() => {
    if (element.parsedContent) {
      element.parsedContent.forEach((item, idx) => {
        if (item.type === 'geo-mark') {
          const key = `${element.id}-${idx}`;
          if (!geoMarkAnimations.has(key)) {
            geoMarkAnimations.set(key, new Animated.Value(0));
          }
        }
      });
    }
  }, [element.parsedContent]);

  // Handle focus changes
  useEffect(() => {
    if (element.parsedContent) {
      const geoMarks: Array<{name: string, lat: number, lng: number}> = [];
      
      element.parsedContent.forEach((item, idx) => {
        if (item.type === 'geo-mark') {
          const key = `${element.id}-${idx}`;
          const animation = geoMarkAnimations.get(key);
          
          if (animation) {
            Animated.timing(animation, {
              toValue: isFocused ? 1 : 0,
              duration: transitionDuration,
              useNativeDriver: false,
            }).start();
          }
          
          // Collect geo-marks for focus callback
          if (isFocused && item.lat && item.lng) {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
              geoMarks.push({ name: item.text, lat, lng });
            }
          }
        }
      });
      
      // Notify parent about focused locations
      if (isFocused && geoMarks.length > 0 && onFocus) {
        onFocus(geoMarks);
      }
    }
  }, [isFocused, element.parsedContent, transitionDuration]);

  if (element.type === 'gap') {
    return <View style={styles.gapBox} />;
  }

  const baseStyle = [
    styles.box,
    {
      backgroundColor: isVisible ? backgroundColor : 'transparent',
      borderTopLeftRadius: element.type === 'header' ? 12 : 0,
      borderTopRightRadius: element.type === 'header' ? 12 : 0,
      borderBottomLeftRadius: element.type === 'footer' ? 12 : 0,
      borderBottomRightRadius: element.type === 'footer' ? 12 : 0,
      // Enhanced shadow for focus indication without layout shift
      shadowColor: isFocused ? '#3B82F6' : '#000',
      shadowOpacity: isVisible ? (isFocused ? 0.3 : 0.1) : 0,
      shadowRadius: isFocused ? 8 : 2,
      shadowOffset: {
        width: 0,
        height: isFocused ? 0 : 1,
      },
      elevation: isVisible ? (isFocused ? 4 : 2) : 0,
    }
  ];

  // Handle header rendering
  if (element.type === 'header') {
    return (
      <View style={baseStyle}>
        <View style={styles.messageHeader}>
          <View style={[styles.avatar, element.role === 'assistant' && styles.assistantAvatar, { opacity: isVisible ? 1 : 0 }]}>
            <Text style={[styles.avatarText, { opacity: isVisible ? 1 : 0 }]}>
              {element.role === 'user' ? 'U' : 'AI'}
            </Text>
          </View>
          <Text style={[styles.senderName, { opacity: isVisible ? 1 : 0 }]}>
            {element.role === 'user' ? 'You' : 'Travel Assistant'}
          </Text>
          {element.timestamp && (
            <Text style={[styles.timestamp, { opacity: isVisible ? 1 : 0 }]}>
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

  // Handle content rendering with focus-aware geo-marks
  if (element.type === 'content') {
    // Check if it's a heading
    if (element.isHeading && element.headingLevel) {
      const headingStyles = {
        1: styles.heading1,
        2: styles.heading2,
        3: styles.heading3,
      };
      return (
        <View style={baseStyle}>
          <Text style={[headingStyles[element.headingLevel], { opacity: isVisible ? 1 : 0 }]}>
            {element.text}
          </Text>
        </View>
      );
    }

    return (
      <View style={baseStyle}>
        {element.parsedContent ? (
          <Text style={[styles.messageText, { opacity: isVisible ? 1 : 0 }]}>
            {element.parsedContent.map((item, idx) => {
              if (item.type === 'geo-mark') {
                const key = `${element.id}-${idx}`;
                const animation = geoMarkAnimations.get(key) || new Animated.Value(0);
                
                // Interpolate colors for smooth transition
                const dotColor = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [INACTIVE_COLOR, item.color || '#3B82F6'],
                });
                
                const textColor = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [INACTIVE_TEXT_COLOR, '#111827'],
                });
                
                return (
                  <Text key={idx}>
                    <Animated.Text style={{ 
                      color: dotColor, 
                      fontSize: 10,
                      marginRight: 2,
                    }}>● </Animated.Text>
                    <Animated.Text style={[
                      styles.locationText,
                      { color: textColor }
                    ]}>{item.text}</Animated.Text>
                    {idx < element.parsedContent!.length - 1 ? ' ' : ''}
                  </Text>
                );
              }
              return <Text key={idx}>{item.text}{idx < element.parsedContent!.length - 1 ? ' ' : ''}</Text>;
            })}
          </Text>
        ) : (
          <Text style={[
            styles.messageText,
            {
              opacity: isVisible ? 1 : 0,
              fontStyle: element.isItineraryContent ? 'italic' : 'normal'
            }
          ]}>
            {element.text}
          </Text>
        )}
      </View>
    );
  }

  // Footer
  return <View style={baseStyle} />;
};

// Default styles
export const messageElementWithFocusStyles = StyleSheet.create({
  box: {
    marginBottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowRadius: 2,
  },
  gapBox: {
    height: 20,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3498DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  assistantAvatar: {
    backgroundColor: '#2ECC71',
  },
  avatarText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  senderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#6b7280',
  },
  messageText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
    paddingVertical: 8,
  },
  locationText: {
    fontWeight: '700',
  },
  heading1: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    marginTop: 4,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 4,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
    marginTop: 2,
  },
});
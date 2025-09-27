import React, { useEffect, useRef } from 'react';
import { Text, View, StyleSheet, Animated } from 'react-native';

// Type definitions (same as MessageElement)
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
  parsedContent?: Array<{type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3', text: string, color?: string, lat?: string | null, lng?: string | null}>;
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

interface MessageElementAnimatedProps {
  element: FlatElement;
  isVisible: boolean;
  backgroundColor?: string;
  onLocationsUpdate?: (locations: Location[]) => void;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  scrollOffset?: number;
  containerHeight?: number;
  styles: any;
  animationDuration?: number; // Duration in milliseconds
  animationType?: 'fade' | 'slide' | 'scale' | 'all';
}

// Component with animated transitions
export const MessageElementAnimated: React.FC<MessageElementAnimatedProps> = ({
  element,
  isVisible,
  backgroundColor = 'white',
  onLocationsUpdate,
  onLocationClick,
  scrollOffset,
  containerHeight,
  styles,
  animationDuration = 300,
  animationType = 'fade',
}) => {
  // Animation values
  const fadeAnim = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(isVisible ? 1 : 0.95)).current;
  const slideAnim = useRef(new Animated.Value(isVisible ? 0 : 10)).current;
  const bgOpacityAnim = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const shadowAnim = useRef(new Animated.Value(isVisible ? 0.1 : 0)).current;

  // Handle visibility changes with animation
  useEffect(() => {
    const animations = [];

    // Fade animation
    if (animationType === 'fade' || animationType === 'all') {
      animations.push(
        Animated.timing(fadeAnim, {
          toValue: isVisible ? 1 : 0.3,
          duration: animationDuration,
          useNativeDriver: true,
        })
      );
    }

    // Scale animation
    if (animationType === 'scale' || animationType === 'all') {
      animations.push(
        Animated.spring(scaleAnim, {
          toValue: isVisible ? 1 : 0.95,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        })
      );
    }

    // Slide animation
    if (animationType === 'slide' || animationType === 'all') {
      animations.push(
        Animated.timing(slideAnim, {
          toValue: isVisible ? 0 : 10,
          duration: animationDuration,
          useNativeDriver: true,
        })
      );
    }

    // Background opacity animation (always included)
    animations.push(
      Animated.timing(bgOpacityAnim, {
        toValue: isVisible ? 1 : 0,
        duration: animationDuration,
        useNativeDriver: false, // backgroundColor can't use native driver
      })
    );

    // Shadow animation
    animations.push(
      Animated.timing(shadowAnim, {
        toValue: isVisible ? 0.1 : 0,
        duration: animationDuration,
        useNativeDriver: false, // shadow properties can't use native driver
      })
    );

    // Run all animations in parallel
    Animated.parallel(animations).start();
  }, [isVisible, animationType, animationDuration]);

  if (element.type === 'gap') {
    return <View style={styles.gapBox} />;
  }

  // Interpolate background color
  const animatedBackgroundColor = bgOpacityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', backgroundColor],
  });

  const baseAnimatedStyle = [
    styles.box,
    {
      borderTopLeftRadius: element.type === 'header' ? 12 : 0,
      borderTopRightRadius: element.type === 'header' ? 12 : 0,
      borderBottomLeftRadius: element.type === 'footer' ? 12 : 0,
      borderBottomRightRadius: element.type === 'footer' ? 12 : 0,
      borderWidth: 0,
    }
  ];

  // Apply animation transforms based on type
  const animatedTransforms = [];
  if (animationType === 'scale' || animationType === 'all') {
    animatedTransforms.push({ scale: scaleAnim });
  }
  if (animationType === 'slide' || animationType === 'all') {
    animatedTransforms.push({ translateY: slideAnim });
  }

  // Handle header rendering
  if (element.type === 'header') {
    return (
      <Animated.View 
        style={[
          ...baseAnimatedStyle,
          {
            backgroundColor: animatedBackgroundColor,
            shadowOpacity: shadowAnim,
            elevation: isVisible ? 2 : 0,
            opacity: fadeAnim,
            transform: animatedTransforms,
          }
        ]}
      >
        <View style={styles.messageHeader}>
          <View style={[styles.avatar, element.role === 'assistant' && styles.assistantAvatar]}>
            <Text style={styles.avatarText}>
              {element.role === 'user' ? 'U' : 'AI'}
            </Text>
          </View>
          <Animated.Text style={[styles.senderName, { opacity: fadeAnim }]}>
            {element.role === 'user' ? 'You' : 'Travel Assistant'}
          </Animated.Text>
          {element.timestamp && (
            <Animated.Text style={[styles.timestamp, { opacity: fadeAnim }]}>
              {element.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Animated.Text>
          )}
        </View>
      </Animated.View>
    );
  }

  // Handle content rendering
  if (element.type === 'content') {
    // Check if it's a heading
    if (element.isHeading && element.headingLevel) {
      const headingStyles = {
        1: styles.heading1,
        2: styles.heading2,
        3: styles.heading3,
      };
      return (
        <Animated.View 
          style={[
            ...baseAnimatedStyle,
            {
              backgroundColor: animatedBackgroundColor,
              shadowOpacity: shadowAnim,
              elevation: isVisible ? 2 : 0,
              opacity: fadeAnim,
              transform: animatedTransforms,
            }
          ]}
        >
          <Animated.Text style={[headingStyles[element.headingLevel], { opacity: fadeAnim }]}>
            {element.text}
          </Animated.Text>
        </Animated.View>
      );
    }

    return (
      <Animated.View 
        style={[
          ...baseAnimatedStyle,
          {
            backgroundColor: animatedBackgroundColor,
            shadowOpacity: shadowAnim,
            elevation: isVisible ? 2 : 0,
            opacity: fadeAnim,
            transform: animatedTransforms,
          }
        ]}
      >
        {element.parsedContent ? (
          <Animated.Text style={[styles.messageText, { opacity: fadeAnim }]}>
            {element.parsedContent.map((item, idx) => {
              if (item.type === 'geo-mark') {
                return (
                  <Text key={idx}>
                    <Text style={{ color: item.color, fontSize: 10 }}>● </Text>
                    <Text style={styles.locationText}>{item.text}</Text>
                    {idx < element.parsedContent!.length - 1 ? ' ' : ''}
                  </Text>
                );
              }
              return <Text key={idx}>{item.text}{idx < element.parsedContent!.length - 1 ? ' ' : ''}</Text>;
            })}
          </Animated.Text>
        ) : (
          <Animated.Text style={[
            styles.messageText,
            {
              opacity: fadeAnim,
              fontStyle: element.isItineraryContent ? 'italic' : 'normal'
            }
          ]}>
            {element.text}
          </Animated.Text>
        )}
      </Animated.View>
    );
  }

  // Footer
  return (
    <Animated.View 
      style={[
        ...baseAnimatedStyle,
        {
          backgroundColor: animatedBackgroundColor,
          shadowOpacity: shadowAnim,
          elevation: isVisible ? 2 : 0,
          opacity: fadeAnim,
          transform: animatedTransforms,
        }
      ]}
    />
  );
};

// Default styles
export const messageElementAnimatedStyles = StyleSheet.create({
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
    color: '#111827',
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
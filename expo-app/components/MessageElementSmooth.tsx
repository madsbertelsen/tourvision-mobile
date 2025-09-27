import React, { useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet, Animated, Easing, LayoutChangeEvent } from 'react-native';

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

export interface SmoothAnimationConfig {
  enabled: boolean;
  duration: number; // milliseconds
  easing: 'linear' | 'easeOut' | 'easeInOut' | 'spring';
  strategy: 'maxHeight' | 'clip' | 'scale';
  stagger: boolean;
  reverseOnExit: boolean;
}

interface MessageElementSmoothProps {
  element: FlatElement;
  isVisible: boolean;
  backgroundColor?: string;
  onLocationsUpdate?: (locations: Location[]) => void;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  scrollOffset?: number;
  containerHeight?: number;
  styles: any;
  animationConfig?: SmoothAnimationConfig;
  staggerDelay?: number; // For staggered animations
}

// Helper to get easing function
const getEasingFunction = (type: string) => {
  switch (type) {
    case 'linear':
      return Easing.linear;
    case 'easeOut':
      return Easing.out(Easing.cubic);
    case 'easeInOut':
      return Easing.inOut(Easing.ease);
    case 'spring':
      return Easing.out(Easing.back(1.5));
    default:
      return Easing.out(Easing.cubic);
  }
};

export const MessageElementSmooth: React.FC<MessageElementSmoothProps> = ({
  element,
  isVisible,
  backgroundColor = 'white',
  onLocationsUpdate,
  onLocationClick,
  scrollOffset,
  containerHeight,
  styles,
  animationConfig = {
    enabled: true,
    duration: 300,
    easing: 'easeOut',
    strategy: 'maxHeight',
    stagger: false,
    reverseOnExit: false,
  },
  staggerDelay = 0,
}) => {
  // State for tracking natural height
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Animation values
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const animatedScale = useRef(new Animated.Value(0)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;
  const backgroundOpacity = useRef(new Animated.Value(0)).current;

  // Track if this element has been animated in
  const hasAnimatedIn = useRef(false);
  const lastVisibleState = useRef(isVisible);

  // Handle gap elements
  if (element.type === 'gap') {
    return <View style={styles.gapBox} />;
  }

  // Capture natural height of content
  const handleContentLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (!naturalHeight || (height > 0 && height !== naturalHeight)) {
      setNaturalHeight(height);
    }
  };

  // Animate when visibility changes
  useEffect(() => {
    if (!animationConfig.enabled) {
      // If animations are disabled, just show/hide instantly
      animatedHeight.setValue(isVisible && naturalHeight ? naturalHeight : 0);
      animatedScale.setValue(isVisible ? 1 : 0);
      animatedOpacity.setValue(isVisible ? 1 : 0);
      backgroundOpacity.setValue(isVisible ? 1 : 0);
      return;
    }

    // Check if visibility actually changed
    if (isVisible === lastVisibleState.current) {
      return;
    }
    lastVisibleState.current = isVisible;

    // Element is becoming visible
    if (isVisible && naturalHeight !== null && naturalHeight > 0) {
      if (!hasBeenVisible) {
        setHasBeenVisible(true);
      }

      // Don't re-animate if already animated in (unless reverseOnExit is true)
      if (hasAnimatedIn.current && !animationConfig.reverseOnExit) {
        return;
      }

      setIsAnimating(true);
      hasAnimatedIn.current = true;

      // Calculate delay for staggered animations
      const delay = animationConfig.stagger ? staggerDelay : 0;

      // Create animations based on strategy
      const animations: Animated.CompositeAnimation[] = [];
      const easingFunction = getEasingFunction(animationConfig.easing);

      // Background opacity animation (always included)
      animations.push(
        Animated.timing(backgroundOpacity, {
          toValue: 1,
          duration: animationConfig.duration * 0.6, // Faster background fade
          delay,
          easing: easingFunction,
          useNativeDriver: false,
        })
      );

      // Content opacity animation
      animations.push(
        Animated.timing(animatedOpacity, {
          toValue: 1,
          duration: animationConfig.duration,
          delay: delay + 50, // Slight delay for content
          easing: easingFunction,
          useNativeDriver: true,
        })
      );

      // Strategy-specific animations
      switch (animationConfig.strategy) {
        case 'maxHeight':
        case 'clip':
          animations.push(
            Animated.timing(animatedHeight, {
              toValue: naturalHeight,
              duration: animationConfig.duration,
              delay,
              easing: easingFunction,
              useNativeDriver: false, // Height can't use native driver
            })
          );
          animatedScale.setValue(1); // Keep scale at 1
          break;

        case 'scale':
          animations.push(
            Animated.timing(animatedScale, {
              toValue: 1,
              duration: animationConfig.duration,
              delay,
              easing: easingFunction,
              useNativeDriver: true, // Scale can use native driver
            })
          );
          animatedHeight.setValue(naturalHeight); // Set height immediately
          break;
      }

      // Run animations in parallel
      Animated.parallel(animations).start(() => {
        setIsAnimating(false);
      });
    }
    // Element is becoming invisible
    else if (!isVisible && animationConfig.reverseOnExit && hasAnimatedIn.current) {
      setIsAnimating(true);

      // Create reverse animations
      const animations: Animated.CompositeAnimation[] = [];
      const easingFunction = Easing.in(Easing.cubic); // Reverse easing

      // Fade out faster
      animations.push(
        Animated.timing(animatedOpacity, {
          toValue: 0,
          duration: animationConfig.duration * 0.7,
          easing: easingFunction,
          useNativeDriver: true,
        })
      );

      animations.push(
        Animated.timing(backgroundOpacity, {
          toValue: 0,
          duration: animationConfig.duration * 0.5,
          easing: easingFunction,
          useNativeDriver: false,
        })
      );

      // Strategy-specific reverse animations
      switch (animationConfig.strategy) {
        case 'maxHeight':
        case 'clip':
          animations.push(
            Animated.timing(animatedHeight, {
              toValue: 0,
              duration: animationConfig.duration * 0.8,
              easing: easingFunction,
              useNativeDriver: false,
            })
          );
          break;

        case 'scale':
          animations.push(
            Animated.timing(animatedScale, {
              toValue: 0.95, // Don't go all the way to 0
              duration: animationConfig.duration * 0.8,
              easing: easingFunction,
              useNativeDriver: true,
            })
          );
          break;
      }

      Animated.parallel(animations).start(() => {
        setIsAnimating(false);
        hasAnimatedIn.current = false;
      });
    }
  }, [isVisible, naturalHeight, animationConfig, staggerDelay]);

  // Build animated container style
  const getAnimatedContainerStyle = () => {
    const baseContainerStyle = [
      styles.box,
      {
        borderTopLeftRadius: element.type === 'header' ? 12 : 0,
        borderTopRightRadius: element.type === 'header' ? 12 : 0,
        borderBottomLeftRadius: element.type === 'footer' ? 12 : 0,
        borderBottomRightRadius: element.type === 'footer' ? 12 : 0,
      }
    ];

    if (!animationConfig.enabled) {
      return [
        ...baseContainerStyle,
        {
          backgroundColor: isVisible ? backgroundColor : 'transparent',
          shadowOpacity: isVisible ? 0.1 : 0,
          elevation: isVisible ? 2 : 0,
        }
      ];
    }

    // Interpolate background color with opacity
    const animatedBackgroundColor = backgroundOpacity.interpolate({
      inputRange: [0, 1],
      outputRange: ['transparent', backgroundColor],
    });

    const animatedStyle: any = {
      backgroundColor: animatedBackgroundColor,
      shadowOpacity: backgroundOpacity.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.1],
      }),
      elevation: isVisible ? 2 : 0,
    };

    // Apply strategy-specific styles
    switch (animationConfig.strategy) {
      case 'maxHeight':
        animatedStyle.maxHeight = animatedHeight;
        animatedStyle.overflow = 'hidden';
        break;

      case 'clip':
        animatedStyle.height = animatedHeight;
        animatedStyle.overflow = 'hidden';
        break;

      case 'scale':
        animatedStyle.transform = [
          { scaleY: animatedScale },
        ];
        animatedStyle.transformOrigin = 'top';
        break;
    }

    return [...baseContainerStyle, animatedStyle];
  };

  // Render header
  if (element.type === 'header') {
    return (
      <Animated.View style={getAnimatedContainerStyle()}>
        <View onLayout={handleContentLayout}>
          <View style={styles.messageHeader}>
            <View style={[styles.avatar, element.role === 'assistant' && styles.assistantAvatar]}>
              <Text style={styles.avatarText}>
                {element.role === 'user' ? 'U' : 'AI'}
              </Text>
            </View>
            <Animated.Text style={[styles.senderName, { opacity: animatedOpacity }]}>
              {element.role === 'user' ? 'You' : 'Travel Assistant'}
            </Animated.Text>
            {element.timestamp && (
              <Animated.Text style={[styles.timestamp, { opacity: animatedOpacity }]}>
                {element.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Animated.Text>
            )}
          </View>
        </View>
      </Animated.View>
    );
  }

  // Render content
  if (element.type === 'content') {
    // Check if it's a heading
    if (element.isHeading && element.headingLevel) {
      const headingStyles = {
        1: styles.heading1,
        2: styles.heading2,
        3: styles.heading3,
      };
      
      return (
        <Animated.View style={getAnimatedContainerStyle()}>
          <View onLayout={handleContentLayout}>
            <Animated.Text style={[headingStyles[element.headingLevel], { opacity: animatedOpacity }]}>
              {element.text}
            </Animated.Text>
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View style={getAnimatedContainerStyle()}>
        <View onLayout={handleContentLayout}>
          {element.parsedContent ? (
            <Animated.Text style={[styles.messageText, { opacity: animatedOpacity }]}>
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
                opacity: animatedOpacity,
                fontStyle: element.isItineraryContent ? 'italic' : 'normal'
              }
            ]}>
              {element.text}
            </Animated.Text>
          )}
        </View>
      </Animated.View>
    );
  }

  // Footer
  return (
    <Animated.View style={getAnimatedContainerStyle()}>
      <View onLayout={handleContentLayout} style={{ height: 10 }} />
    </Animated.View>
  );
};

// Export default styles
export const messageElementSmoothStyles = StyleSheet.create({
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
    borderWidth: 0,
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
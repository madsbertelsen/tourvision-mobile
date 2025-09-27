import React, { useState, useRef, useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { TypewriterText, TypewriterParsedText } from './TypewriterText';

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

export interface TypewriterConfig {
  enabled: boolean;
  speed: number; // characters per second (30-120)
  wordPause: number; // ms pause at word boundaries
  replayOnReenter: boolean; // restart when scrolling back
  instantOnFastScroll: boolean; // complete immediately on fast scroll
}

interface MessageElementTypewriterProps {
  element: FlatElement;
  isVisible: boolean;
  backgroundColor?: string;
  onLocationsUpdate?: (locations: Location[]) => void;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  scrollOffset?: number;
  containerHeight?: number;
  styles: any;
  typewriterConfig?: TypewriterConfig;
  scrollSpeed?: number; // for detecting fast scroll
}

// Component with typewriter effect
export const MessageElementTypewriter: React.FC<MessageElementTypewriterProps> = ({
  element,
  isVisible,
  backgroundColor = 'white',
  onLocationsUpdate,
  onLocationClick,
  scrollOffset,
  containerHeight,
  styles,
  typewriterConfig = {
    enabled: true,
    speed: 60,
    wordPause: 50,
    replayOnReenter: false,
    instantOnFastScroll: true,
  },
  scrollSpeed = 0,
}) => {
  const [hasTypingStarted, setHasTypingStarted] = useState(false);
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const lastScrollOffsetRef = useRef(scrollOffset || 0);
  const [currentScrollSpeed, setCurrentScrollSpeed] = useState(0);

  // Calculate scroll speed
  useEffect(() => {
    if (scrollOffset !== undefined) {
      const speed = Math.abs(scrollOffset - lastScrollOffsetRef.current);
      setCurrentScrollSpeed(speed);
      lastScrollOffsetRef.current = scrollOffset;
    }
  }, [scrollOffset]);

  // Track when typing starts
  useEffect(() => {
    if (isVisible && !hasTypingStarted) {
      setHasTypingStarted(true);
    }
  }, [isVisible, hasTypingStarted]);

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
      shadowOpacity: isVisible ? 0.1 : 0,
      elevation: isVisible ? 2 : 0,
    }
  ];

  // Handle header rendering
  if (element.type === 'header') {
    return (
      <View style={baseStyle}>
        <View style={styles.messageHeader}>
          <View style={[styles.avatar, element.role === 'assistant' && styles.assistantAvatar]}>
            <Text style={styles.avatarText}>
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

  // Handle content rendering with typewriter effect
  if (element.type === 'content') {
    // Check if it's a heading
    if (element.isHeading && element.headingLevel) {
      const headingStyles = {
        1: styles.heading1,
        2: styles.heading2,
        3: styles.heading3,
      };
      
      const headingStyle = [
        headingStyles[element.headingLevel],
        { opacity: isVisible ? 1 : 0 }
      ];

      return (
        <View style={baseStyle}>
          {typewriterConfig.enabled && element.text ? (
            <TypewriterText
              text={element.text}
              isVisible={isVisible}
              speed={typewriterConfig.speed}
              wordPause={typewriterConfig.wordPause}
              style={headingStyle}
              replayOnReenter={typewriterConfig.replayOnReenter}
              instantOnFastScroll={typewriterConfig.instantOnFastScroll}
              scrollSpeed={currentScrollSpeed}
              onComplete={() => setIsTypingComplete(true)}
            />
          ) : (
            <Text style={headingStyle}>
              {element.text}
            </Text>
          )}
        </View>
      );
    }

    return (
      <View style={baseStyle}>
        {element.parsedContent ? (
          typewriterConfig.enabled ? (
            <TypewriterParsedText
              parsedContent={element.parsedContent}
              isVisible={isVisible}
              speed={typewriterConfig.speed}
              wordPause={typewriterConfig.wordPause}
              baseStyle={[styles.messageText, { opacity: isVisible ? 1 : 0 }]}
              locationStyle={styles.locationText}
              replayOnReenter={typewriterConfig.replayOnReenter}
              onComplete={() => setIsTypingComplete(true)}
            />
          ) : (
            <Text style={[styles.messageText, { opacity: isVisible ? 1 : 0 }]}>
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
            </Text>
          )
        ) : (
          element.text ? (
            typewriterConfig.enabled ? (
              <TypewriterText
                text={element.text}
                isVisible={isVisible}
                speed={typewriterConfig.speed}
                wordPause={typewriterConfig.wordPause}
                style={[
                  styles.messageText,
                  {
                    opacity: isVisible ? 1 : 0,
                    fontStyle: element.isItineraryContent ? 'italic' : 'normal'
                  }
                ]}
                replayOnReenter={typewriterConfig.replayOnReenter}
                instantOnFastScroll={typewriterConfig.instantOnFastScroll}
                scrollSpeed={currentScrollSpeed}
                onComplete={() => setIsTypingComplete(true)}
              />
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
            )
          ) : null
        )}
      </View>
    );
  }

  // Footer
  return <View style={baseStyle} />;
};

// Default styles
export const messageElementTypewriterStyles = StyleSheet.create({
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
import React, { useEffect, useState, useRef } from 'react';
import { Text, TextStyle } from 'react-native';

interface TypewriterTextProps {
  text: string;
  isVisible: boolean;
  speed?: number; // characters per second
  wordPause?: number; // milliseconds to pause at word boundaries
  onComplete?: () => void;
  style?: TextStyle | TextStyle[];
  replayOnReenter?: boolean;
  instantOnFastScroll?: boolean;
  scrollSpeed?: number; // pixels per second to detect fast scrolling
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  isVisible,
  speed = 60, // 60 chars per second default
  wordPause = 50, // 50ms pause between words
  onComplete,
  style,
  replayOnReenter = false,
  instantOnFastScroll = true,
  scrollSpeed = 0,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  const charIndexRef = useRef(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastVisibleRef = useRef(false);

  // Detect fast scrolling
  const isFastScrolling = instantOnFastScroll && Math.abs(scrollSpeed) > 500;

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Handle visibility changes
  useEffect(() => {
    // Element just became visible
    if (isVisible && !lastVisibleRef.current) {
      if (!hasBeenVisible || replayOnReenter) {
        // Start or restart typing
        setHasBeenVisible(true);
        setIsTyping(true);
        setIsComplete(false);
        
        if (replayOnReenter || !hasBeenVisible) {
          // Reset text if replaying or first time
          charIndexRef.current = 0;
          setDisplayedText('');
        }
        
        // If fast scrolling, show all text immediately
        if (isFastScrolling) {
          setDisplayedText(text);
          setIsTyping(false);
          setIsComplete(true);
          if (onComplete) onComplete();
        }
      }
    }
    // Element just became invisible
    else if (!isVisible && lastVisibleRef.current) {
      // Pause typing if in progress
      if (isTyping && !isComplete) {
        setIsTyping(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    }
    
    lastVisibleRef.current = isVisible;
  }, [isVisible, hasBeenVisible, replayOnReenter, isFastScrolling, text, onComplete]);

  // Typing effect
  useEffect(() => {
    if (!isTyping || isComplete || charIndexRef.current >= text.length) {
      if (charIndexRef.current >= text.length && !isComplete) {
        setIsComplete(true);
        setIsTyping(false);
        if (onComplete) onComplete();
      }
      return;
    }

    const typeNextChar = () => {
      if (charIndexRef.current < text.length) {
        const currentChar = text[charIndexRef.current];
        const nextChar = text[charIndexRef.current + 1];
        
        // Add the current character
        setDisplayedText(prev => prev + currentChar);
        charIndexRef.current++;
        
        // Calculate delay for next character
        let delay = 1000 / speed; // Base delay based on speed
        
        // Add pause at word boundaries (space followed by non-space)
        if (currentChar === ' ' && nextChar && nextChar !== ' ' && wordPause > 0) {
          delay += wordPause;
        }
        
        // Add slight pause for punctuation
        if (['.', '!', '?', ',', ';', ':'].includes(currentChar)) {
          delay += wordPause * 0.5;
        }
        
        // Schedule next character
        if (charIndexRef.current < text.length) {
          typingTimeoutRef.current = setTimeout(typeNextChar, delay);
        } else {
          // Typing complete
          setIsComplete(true);
          setIsTyping(false);
          if (onComplete) onComplete();
        }
      }
    };

    // Start typing
    const initialDelay = displayedText.length === 0 ? 100 : 0; // Small delay before starting
    typingTimeoutRef.current = setTimeout(typeNextChar, initialDelay);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isTyping, text, speed, wordPause, isComplete, onComplete]);

  // If not visible and never been visible, show nothing
  if (!isVisible && !hasBeenVisible) {
    return <Text style={style}>{''}</Text>;
  }

  // If complete or not typing, show full text with appropriate opacity
  if (isComplete || (!isTyping && !isVisible)) {
    return <Text style={style}>{isVisible ? text : displayedText || ''}</Text>;
  }

  // Show typing progress
  return <Text style={style}>{displayedText}</Text>;
};

// Component for handling parsed content with mixed text and geo-marks
interface ParsedContentItem {
  type: 'text' | 'geo-mark' | 'h1' | 'h2' | 'h3';
  text: string;
  color?: string;
  lat?: string | null;
  lng?: string | null;
}

interface TypewriterParsedTextProps {
  parsedContent: ParsedContentItem[];
  isVisible: boolean;
  speed?: number;
  wordPause?: number;
  onComplete?: () => void;
  baseStyle?: TextStyle | TextStyle[];
  locationStyle?: TextStyle;
  replayOnReenter?: boolean;
}

export const TypewriterParsedText: React.FC<TypewriterParsedTextProps> = ({
  parsedContent,
  isVisible,
  speed = 60,
  wordPause = 50,
  onComplete,
  baseStyle,
  locationStyle,
  replayOnReenter = false,
}) => {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [completedItems, setCompletedItems] = useState<number[]>([]);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const lastVisibleRef = useRef(false);

  // Reset when visibility changes
  useEffect(() => {
    if (isVisible && !lastVisibleRef.current) {
      if (!hasBeenVisible || replayOnReenter) {
        setHasBeenVisible(true);
        if (replayOnReenter || !hasBeenVisible) {
          setCurrentItemIndex(0);
          setCompletedItems([]);
        }
      }
    }
    lastVisibleRef.current = isVisible;
  }, [isVisible, hasBeenVisible, replayOnReenter]);

  const handleItemComplete = (index: number) => {
    setCompletedItems(prev => [...prev, index]);
    
    // Move to next item
    if (index < parsedContent.length - 1) {
      setCurrentItemIndex(index + 1);
    } else if (onComplete) {
      onComplete();
    }
  };

  if (!isVisible && !hasBeenVisible) {
    return <Text style={baseStyle}>{''}</Text>;
  }

  return (
    <Text style={baseStyle}>
      {parsedContent.map((item, idx) => {
        const isCompleted = completedItems.includes(idx);
        const isCurrent = idx === currentItemIndex;
        const shouldShow = isCompleted || isCurrent;

        if (!shouldShow && isVisible) {
          return null;
        }

        if (item.type === 'geo-mark') {
          return (
            <Text key={idx}>
              <Text style={{ color: item.color, fontSize: 10 }}>● </Text>
              {isCurrent && isVisible ? (
                <TypewriterText
                  text={item.text}
                  isVisible={isVisible}
                  speed={speed}
                  wordPause={wordPause}
                  style={locationStyle}
                  onComplete={() => handleItemComplete(idx)}
                  replayOnReenter={false}
                />
              ) : (
                <Text style={locationStyle}>{isCompleted || !isVisible ? item.text : ''}</Text>
              )}
              {idx < parsedContent.length - 1 ? ' ' : ''}
            </Text>
          );
        }

        // Regular text
        if (isCurrent && isVisible) {
          return (
            <Text key={idx}>
              <TypewriterText
                text={item.text}
                isVisible={isVisible}
                speed={speed}
                wordPause={wordPause}
                onComplete={() => handleItemComplete(idx)}
                replayOnReenter={false}
              />
              {idx < parsedContent.length - 1 ? ' ' : ''}
            </Text>
          );
        }

        return (
          <Text key={idx}>
            {isCompleted || !isVisible ? item.text : ''}
            {idx < parsedContent.length - 1 && (isCompleted || !isVisible) ? ' ' : ''}
          </Text>
        );
      })}
    </Text>
  );
};
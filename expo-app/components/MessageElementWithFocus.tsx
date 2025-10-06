import { useMockContext } from '@/contexts/MockContext';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Enhanced type definitions with focus support
export type FlatElement = {
  id: string;
  type: 'header' | 'content' | 'footer' | 'gap' | 'toggle';
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
    photoName?: string | null;
    description?: string | null;
    geoId?: string; // Unique ID for this location
    transportFrom?: string; // ID of origin location
    transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit'; // Transportation mode
  }>;
  isHeading?: boolean;
  headingLevel?: 1 | 2 | 3;
  isDeleted?: boolean; // Track if element is deleted
  isEdited?: boolean; // Track if element has been edited
  originalText?: string; // Store original text for undo
  documentPos?: number; // Position in ProseMirror document
  nodeSize?: number; // Size of node in ProseMirror document
  nodeId?: string; // Unique ID of the ProseMirror node
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
  photoName?: string;
}

interface MessageElementWithFocusProps {
  element: FlatElement;
  isVisible: boolean;
  isFocused: boolean; // New: whether this element is in focus
  isAboveFocus?: boolean; // New: whether this element is above the focused element
  backgroundColor?: string;
  onLocationsUpdate?: (locations: Location[]) => void;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
  onFocus?: (locations: Array<{name: string, lat: number, lng: number}>) => void;
  onToggleCollapse?: (messageId: string) => void;
  onLongPress?: (element: FlatElement) => void; // Handle long press for actions
  onEditSave?: (elementId: string, newText: string) => void; // Save edited text
  onDelete?: (elementId: string) => void; // Delete element
  scrollOffset?: number;
  containerHeight?: number;
  styles: any;
  transitionDuration?: number;
  isEditing?: boolean; // New: whether this element is currently being edited
}

// Colors
const INACTIVE_COLOR = '#6B7280'; // gray-500
const INACTIVE_TEXT_COLOR = '#9CA3AF'; // gray-400

export const MessageElementWithFocus: React.FC<MessageElementWithFocusProps> = ({
  element,
  isVisible,
  isFocused,
  isAboveFocus = false,
  backgroundColor = 'white',
  onLocationsUpdate,
  onLocationClick,
  onFocus,
  onToggleCollapse,
  onLongPress,
  onEditSave,
  onDelete,
  scrollOffset,
  containerHeight,
  styles,
  transitionDuration = 300,
  isEditing: isEditingProp = false,
}) => {
  const router = useRouter();
  const [isEditingInternal, setIsEditingInternal] = useState(false);
  const [editedText, setEditedText] = useState(element.text || '');

  // Use prop or internal state for editing
  const isEditing = isEditingProp || isEditingInternal;

  // Handle save edit
  const handleSaveEdit = () => {
    if (onEditSave && editedText !== element.text) {
      onEditSave(element.id, editedText);
    }
    setIsEditingInternal(false);
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditedText(element.text || '');
    setIsEditingInternal(false);
  };

  let mockContext = null;
  try {
    mockContext = useMockContext();
  } catch (error) {
    // Context not available in this component tree
  }
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
  }, [isFocused, element.parsedContent, transitionDuration, onFocus]);

  if (element.type === 'gap') {
    return <View style={styles.gapBox} />;
  }

  // Handle toggle button
  if (element.type === 'toggle') {
    return (
      <TouchableOpacity
        onPress={() => onToggleCollapse?.(element.messageId)}
        style={styles.toggleButton}
      >
        <Text style={styles.toggleText}>{element.text}</Text>
      </TouchableOpacity>
    );
  }

  // Determine message role for left border color
  const messageRole = element.role || 'assistant';


  const baseStyle = [
    styles.box,
    {
      backgroundColor: isVisible ? backgroundColor : 'transparent',
      // No borders - we'll use text alignment or other indicators
      // No individual shadows or rounded corners for unified sheet
      shadowOpacity: 0,
      elevation: 0,
      // Add subtle indentation for user messages
      paddingLeft: messageRole === 'user' ? 32 : 16,
      paddingRight: messageRole === 'user' ? 16 : 32,
    },
  ];

  // Skip header rendering - we're using a unified sheet without headers
  if (element.type === 'header') {
    return null;
  }

  // Calculate text opacity based on focus state
  const getTextOpacity = () => {
    if (!isVisible) return 0; // Below visibility threshold
    return 1; // All visible text should have full opacity (black)
  };

  const textOpacity = getTextOpacity();

  // Handle content rendering with focus-aware geo-marks
  if (element.type === 'content') {
    // Don't render if deleted
    if (element.isDeleted) {
      return null;
    }

    // console.log('Rendering element with parsedContent:', element.id, element.parsedContent);

    // Check if it's a heading
    if (element.isHeading && element.headingLevel) {
      const headingStyles = {
        1: styles.heading1,
        2: styles.heading2,
        3: styles.heading3,
      };

      if (isEditing) {
        return (
          <Animated.View style={baseStyle}>
            <TextInput
              style={[headingStyles[element.headingLevel], styles.editInput]}
              value={editedText}
              onChangeText={setEditedText}
              onBlur={handleSaveEdit}
              onSubmitEditing={handleSaveEdit}
              autoFocus
              multiline
            />
          </Animated.View>
        );
      }

      return (
        <TouchableOpacity
          onLongPress={() => onLongPress?.(element)}
          activeOpacity={0.9}
        >
          <Animated.View style={baseStyle}>
            <Text style={[
              headingStyles[element.headingLevel],
              { opacity: textOpacity },
              element.isEdited && styles.editedText
            ]}>
              {element.text}
            </Text>
          </Animated.View>
        </TouchableOpacity>
      );
    }

    // Regular content with edit mode
    if (isEditing) {
      return (
        <Animated.View style={baseStyle}>
          <TextInput
            style={[styles.messageText, styles.editInput]}
            value={editedText}
            onChangeText={setEditedText}
            onBlur={handleSaveEdit}
            onSubmitEditing={handleSaveEdit}
            autoFocus
            multiline
          />
        </Animated.View>
      );
    }

    return (
      <TouchableOpacity
        onLongPress={() => onLongPress?.(element)}
        activeOpacity={0.9}
      >
        <Animated.View style={baseStyle}>
          {element.parsedContent ? (
            <Text style={[
              styles.messageText,
              {
                opacity: textOpacity,
                fontWeight: messageRole === 'user' ? '500' : '400',
                fontStyle: messageRole === 'user' ? 'italic' : 'normal',
              },
              element.isEdited && styles.editedText
            ]}>
            {element.parsedContent.map((item, idx) => {
              if (item.type === 'geo-mark') {
                const key = `${element.id}-${idx}`;
                const animation = geoMarkAnimations.get(key) || new Animated.Value(0);

                // Interpolate background color for smooth transition (lighter version of marker color)
                const backgroundColor = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(209, 213, 219, 0.3)', `${item.color || '#3B82F6'}33`], // 33 = 20% opacity
                });

                const textColor = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [INACTIVE_TEXT_COLOR, '#111827'],
                });

                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      // Just focus the map on this location
                      if (mockContext && item.lat && item.lng) {
                        const lat = parseFloat(item.lat);
                        const lng = parseFloat(item.lng);
                        if (!isNaN(lat) && !isNaN(lng)) {
                          const locationData = {
                            id: `loc-${idx}`,
                            name: item.text,
                            lat,
                            lng,
                            description: item.description || '',
                            photoName: item.photoName || ''
                          };

                          // Toggle: if same location is clicked, clear focus
                          if (mockContext.focusedLocation &&
                              mockContext.focusedLocation.id === locationData.id) {
                            mockContext.setFocusedLocation(null);
                          } else {
                            // Set focused location for map animation
                            mockContext.setFocusedLocation(locationData);
                          }
                        }
                      }
                    }}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <Animated.Text style={[
                      styles.locationText,
                      {
                        color: textColor,
                        backgroundColor: backgroundColor,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }
                    ]}>{item.text}</Animated.Text>
                    {idx < element.parsedContent!.length - 1 ? <Text> </Text> : null}
                  </TouchableOpacity>
                );
              }
              return <Text key={idx}>{item.text}{idx < element.parsedContent!.length - 1 ? ' ' : ''}</Text>;
            })}
          </Text>
        ) : (
          <Text style={[
            styles.messageText,
            {
              opacity: textOpacity,
              fontWeight: messageRole === 'user' ? '500' : '400',
              fontStyle: messageRole === 'user' ? 'italic' : (element.isItineraryContent ? 'italic' : 'normal')
            }
          ]}>
            {element.text}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
  }

  // Skip footer rendering - we're using a unified sheet
  if (element.type === 'footer') {
    return null;
  }

  // Default fallback (shouldn't reach here)
  return null;
};

// Default styles
export const messageElementWithFocusStyles = StyleSheet.create({
  box: {
    marginBottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    // Remove shadows since we're in a unified sheet
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
    paddingVertical: 2,
  },
  locationText: {
    fontWeight: '700',
  },
  heading1: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
    marginTop: 12,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    marginTop: 10,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 2,
    marginTop: 6,
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginVertical: 4,
    alignSelf: 'flex-start',
    marginLeft: 16,
  },
  toggleText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 4,
    padding: 4,
    backgroundColor: '#ffffff',
  },
  editedText: {
    fontStyle: 'italic' as const,
    opacity: 0.9,
  },
});
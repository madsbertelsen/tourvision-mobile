import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ToolPickerBottomSheetProps {
  visible: boolean;
  selectedText: string;
  onSelectLocation: () => void;
  onSelectComment: () => void;
  onClose: () => void;
}

type ToolType = 'location' | 'comment';

export default function ToolPickerBottomSheet({
  visible,
  selectedText,
  onSelectLocation,
  onSelectComment,
  onClose,
}: ToolPickerBottomSheetProps) {
  const [focusedTool, setFocusedTool] = useState<ToolType>('location');

  // Reset focus to location when modal opens
  useEffect(() => {
    if (visible) {
      setFocusedTool('location');
    }
  }, [visible]);

  // Keyboard navigation handler
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent event from bubbling to editor
      e.stopPropagation();

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setFocusedTool('location');
          break;

        case 'ArrowRight':
          e.preventDefault();
          setFocusedTool('comment');
          break;

        case 'l':
        case 'L':
          e.preventDefault();
          onSelectLocation();
          break;

        case 'c':
        case 'C':
          e.preventDefault();
          onSelectComment();
          break;

        case 'Enter':
          e.preventDefault();
          if (focusedTool === 'location') {
            onSelectLocation();
          } else {
            onSelectComment();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, focusedTool, onSelectLocation, onSelectComment, onClose]);

  // Truncate long selected text for preview
  const truncatedText = selectedText.length > 50
    ? selectedText.substring(0, 50) + '...'
    : selectedText;

  if (!visible) return null;

  return (
    <>
      {/* Backdrop - only covers document panel */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Bottom Sheet */}
        <Pressable style={styles.bottomSheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <Text style={styles.headerTitle}>Add to Selection</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Selected Text Preview */}
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>Selected text:</Text>
            <Text style={styles.previewText} numberOfLines={2}>
              "{truncatedText}"
            </Text>
          </View>

          {/* Tool Buttons */}
          <View style={styles.toolsContainer}>
            {/* Location Button */}
            <TouchableOpacity
              style={[
                styles.toolButton,
                focusedTool === 'location' && styles.toolButtonFocused
              ]}
              onPress={onSelectLocation}
              onFocus={() => setFocusedTool('location')}
            >
              <View style={styles.toolIconContainer}>
                <Ionicons
                  name="location"
                  size={32}
                  color={focusedTool === 'location' ? '#3B82F6' : '#6B7280'}
                />
              </View>
              <View style={styles.toolTextContainer}>
                <Text style={[
                  styles.toolTitle,
                  focusedTool === 'location' && styles.toolTitleFocused
                ]}>
                  Location
                </Text>
                <Text style={styles.toolDescription}>
                  Add a place or location marker
                </Text>
              </View>
              <View style={styles.shortcutBadge}>
                <Text style={styles.shortcutText}>L</Text>
              </View>
            </TouchableOpacity>

            {/* Comment Button */}
            <TouchableOpacity
              style={[
                styles.toolButton,
                focusedTool === 'comment' && styles.toolButtonFocused
              ]}
              onPress={onSelectComment}
              onFocus={() => setFocusedTool('comment')}
            >
              <View style={styles.toolIconContainer}>
                <Ionicons
                  name="chatbubble"
                  size={32}
                  color={focusedTool === 'comment' ? '#3B82F6' : '#6B7280'}
                />
              </View>
              <View style={styles.toolTextContainer}>
                <Text style={[
                  styles.toolTitle,
                  focusedTool === 'comment' && styles.toolTitleFocused
                ]}>
                  Comment
                </Text>
                <Text style={styles.toolDescription}>
                  Add a note or comment
                </Text>
              </View>
              <View style={styles.shortcutBadge}>
                <Text style={styles.shortcutText}>C</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Keyboard Hint */}
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>
              <Text style={styles.hintKey}>←→</Text> Navigate • <Text style={styles.hintKey}>Enter</Text> Select • <Text style={styles.hintKey}>Esc</Text> Close
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 4,
    position: 'absolute',
    right: 16,
  },
  previewContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewText: {
    fontSize: 14,
    color: '#111827',
    fontStyle: 'italic',
  },
  toolsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 16,
  },
  toolButtonFocused: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  toolIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTextContainer: {
    flex: 1,
  },
  toolTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  toolTitleFocused: {
    color: '#3B82F6',
  },
  toolDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  shortcutBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  shortcutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  hintContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  hintKey: {
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, ScrollView } from 'react-native';

interface ProseMirrorToolbarProps {
  editable: boolean;
  selectionEmpty?: boolean;
  highlightedButton?: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onCommand: (command: string, params?: any) => void;
}

export function ProseMirrorToolbar({ editable, selectionEmpty = true, highlightedButton, canUndo = false, canRedo = false, onCommand }: ProseMirrorToolbarProps) {
  if (!editable) {
    return null;
  }

  const isButtonHighlighted = (buttonId: string) => highlightedButton === buttonId;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.toolbarContent}>
        {/* Undo/Redo */}
        <View style={styles.group}>
          <TouchableOpacity
            style={[
              styles.button,
              !canUndo && styles.buttonDisabled
            ]}
            onPress={() => canUndo && onCommand('undo')}
            disabled={!canUndo}
          >
            <Text style={[
              styles.buttonText,
              !canUndo && styles.buttonTextDisabled
            ]}>↶</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              !canRedo && styles.buttonDisabled
            ]}
            onPress={() => canRedo && onCommand('redo')}
            disabled={!canRedo}
          >
            <Text style={[
              styles.buttonText,
              !canRedo && styles.buttonTextDisabled
            ]}>↷</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Heading */}
        <View style={styles.group}>
          <TouchableOpacity
            style={[
              styles.button,
              isButtonHighlighted('h2') && styles.buttonHighlighted
            ]}
            onPress={() => onCommand('setHeading', { level: 2 })}
          >
            <Text style={[
              styles.buttonText,
              isButtonHighlighted('h2') && styles.buttonTextHighlighted
            ]}>H2</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Lists */}
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('toggleBulletList')}
          >
            <Text style={styles.buttonText}>☰</Text>
          </TouchableOpacity>
        </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 0,
    width: '100%',
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...Platform.select({
      web: {
        boxShadow: 'none' as any,
        overflow: 'visible' as any,
      },
    }),
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexGrow: 1,
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...Platform.select({
      web: {
        minWidth: 'auto' as any,
      },
    }),
  },
  group: {
    flexDirection: 'row',
    gap: 6,
  },
  button: {
    width: 40,
    height: 36,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    ...Platform.select({
      web: {
        transition: 'all 0.2s' as any,
        cursor: 'pointer' as any,
      },
    }),
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonHighlighted: {
    backgroundColor: '#e5e7eb',
  },
  buttonText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  buttonTextDisabled: {
    opacity: 0.4,
  },
  buttonTextHighlighted: {
    color: '#111827',
  },
  buttonEmoji: {
    fontSize: 18,
  },
  boldText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  italicText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#ffffff',
  },
  strikeText: {
    fontSize: 15,
    textDecorationLine: 'line-through',
    color: '#ffffff',
  },
  codeText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#ffffff',
  },
  underlineText: {
    fontSize: 15,
    textDecorationLine: 'underline',
    color: '#ffffff',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
  locationIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationIconDisabled: {
    opacity: 0.4,
  },
  locationPin: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: '#374151',
    borderRadius: 7,
    top: 1,
  },
  locationDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    backgroundColor: '#ffffff',
    borderRadius: 3,
    top: 5,
  },
});
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';

interface ProseMirrorToolbarProps {
  editable: boolean;
  selectionEmpty?: boolean;
  highlightedButton?: string | null;
  onCommand: (command: string, params?: any) => void;
}

export function ProseMirrorToolbar({ editable, selectionEmpty = true, highlightedButton, onCommand }: ProseMirrorToolbarProps) {
  if (!editable) {
    return null;
  }

  const isButtonHighlighted = (buttonId: string) => highlightedButton === buttonId;

  return (
    <View style={styles.container}>
      <View style={styles.toolbarContent}>
        {/* Block type selector - Always use buttons, no dropdown */}
        <View style={styles.group}>
          <TouchableOpacity
            style={[
              styles.button,
              isButtonHighlighted('paragraph') && styles.buttonHighlighted
            ]}
            onPress={() => onCommand('setParagraph')}
          >
            <Text style={[
              styles.buttonText,
              isButtonHighlighted('paragraph') && styles.buttonTextHighlighted
            ]}>P</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              isButtonHighlighted('h1') && styles.buttonHighlighted
            ]}
            onPress={() => onCommand('setHeading', { level: 1 })}
          >
            <Text style={[
              styles.buttonText,
              isButtonHighlighted('h1') && styles.buttonTextHighlighted
            ]}>H1</Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            style={[
              styles.button,
              isButtonHighlighted('h3') && styles.buttonHighlighted
            ]}
            onPress={() => onCommand('setHeading', { level: 3 })}
          >
            <Text style={[
              styles.buttonText,
              isButtonHighlighted('h3') && styles.buttonTextHighlighted
            ]}>H3</Text>
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

        <View style={styles.divider} />

        {/* Geo-mark */}
        <View style={styles.group}>
          <TouchableOpacity
            style={[
              styles.button,
              selectionEmpty && styles.buttonDisabled,
              isButtonHighlighted('location') && styles.buttonHighlighted
            ]}
            onPress={() => !selectionEmpty && onCommand('createGeoMark')}
            disabled={selectionEmpty}
          >
            <View style={[styles.locationIcon, selectionEmpty && styles.locationIconDisabled]}>
              <View style={styles.locationPin} />
              <View style={styles.locationDot} />
            </View>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    rowGap: 8, // Add space between wrapped rows
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
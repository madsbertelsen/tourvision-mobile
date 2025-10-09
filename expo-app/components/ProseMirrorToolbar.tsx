import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';

interface ProseMirrorToolbarProps {
  editable: boolean;
  selectionEmpty?: boolean;
  onCommand: (command: string, params?: any) => void;
}

export function ProseMirrorToolbar({ editable, selectionEmpty = true, onCommand }: ProseMirrorToolbarProps) {
  if (!editable) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Undo/Redo */}
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('undo')}
          >
            <Text style={styles.buttonText}>↶</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('redo')}
          >
            <Text style={styles.buttonText}>↷</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Text formatting */}
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('toggleBold')}
          >
            <Text style={styles.boldText}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('toggleItalic')}
          >
            <Text style={styles.italicText}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('toggleStrike')}
          >
            <Text style={styles.strikeText}>S</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('toggleCode')}
          >
            <Text style={styles.codeText}>{'</>'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('toggleUnderline')}
          >
            <Text style={styles.underlineText}>U</Text>
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
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('toggleOrderedList')}
          >
            <Text style={styles.buttonText}>1.</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Geo-mark */}
        <View style={styles.group}>
          <TouchableOpacity
            style={[styles.button, selectionEmpty && styles.buttonDisabled]}
            onPress={() => !selectionEmpty && onCommand('createGeoMark')}
            disabled={selectionEmpty}
          >
            <Text style={[styles.buttonEmoji, selectionEmpty && styles.buttonTextDisabled]}>📍</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Link */}
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => onCommand('insertLink')}
          >
            <Text style={styles.buttonText}>🔗</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    height: 44,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  group: {
    flexDirection: 'row',
    gap: 2,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  buttonTextDisabled: {
    opacity: 0.4,
  },
  buttonEmoji: {
    fontSize: 16,
  },
  boldText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
  },
  italicText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#374151',
  },
  strikeText: {
    fontSize: 14,
    textDecorationLine: 'line-through',
    color: '#374151',
  },
  codeText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#374151',
  },
  underlineText: {
    fontSize: 14,
    textDecorationLine: 'underline',
    color: '#374151',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
});
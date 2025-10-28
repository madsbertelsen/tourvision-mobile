import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Block types */}
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

        {/* Text formatting */}
        <View style={styles.group}>
          <TouchableOpacity
            style={[
              styles.button,
              isButtonHighlighted('bold') && styles.buttonHighlighted
            ]}
            onPress={() => onCommand('toggleBold')}
          >
            <Text style={[
              styles.boldText,
              isButtonHighlighted('bold') && styles.buttonTextHighlighted
            ]}>B</Text>
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
            style={[
              styles.button,
              selectionEmpty && styles.buttonDisabled,
              isButtonHighlighted('location') && styles.buttonHighlighted
            ]}
            onPress={() => !selectionEmpty && onCommand('createGeoMark')}
            disabled={selectionEmpty}
          >
            <Text style={[
              styles.buttonEmoji,
              selectionEmpty && styles.buttonTextDisabled,
              isButtonHighlighted('location') && styles.buttonTextHighlighted
            ]}>📍</Text>
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
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    height: 52,
    paddingVertical: 8,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  group: {
    flexDirection: 'row',
    gap: 6,
  },
  button: {
    width: 40,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonHighlighted: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
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
    color: '#ffffff',
  },
  buttonEmoji: {
    fontSize: 18,
  },
  boldText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#374151',
  },
  italicText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#374151',
  },
  strikeText: {
    fontSize: 15,
    textDecorationLine: 'line-through',
    color: '#374151',
  },
  codeText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#374151',
  },
  underlineText: {
    fontSize: 15,
    textDecorationLine: 'underline',
    color: '#374151',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: '#d1d5db',
    marginHorizontal: 8,
  },
});
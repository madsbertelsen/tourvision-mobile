import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView, Platform } from 'react-native';

interface ProseMirrorToolbarProps {
  editable: boolean;
  selectionEmpty?: boolean;
  highlightedButton?: string | null;
  onCommand: (command: string, params?: any) => void;
  viewMode?: 'document' | 'map';
  onViewModeChange?: (mode: 'document' | 'map') => void;
}

export function ProseMirrorToolbar({ editable, selectionEmpty = true, highlightedButton, onCommand, viewMode, onViewModeChange }: ProseMirrorToolbarProps) {
  if (!editable) {
    return null;
  }

  const isButtonHighlighted = (buttonId: string) => highlightedButton === buttonId;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={styles.scrollContent}
        style={{ flex: 1 }}
        nestedScrollEnabled={true}
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

        {/* View Mode Toggle - Only show if onViewModeChange is provided */}
        {onViewModeChange && (
          <>
            <View style={styles.divider} />
            <View style={styles.group}>
              <TouchableOpacity
                style={[styles.button, viewMode === 'map' && styles.buttonHighlighted]}
                onPress={() => onViewModeChange(viewMode === 'document' ? 'map' : 'document')}
              >
                <Text style={styles.buttonText}>{viewMode === 'document' ? '🗺️' : '📄'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2d3748',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)' as any,
        overflow: 'visible' as any,
      },
    }),
  },
  scrollContent: {
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    fontSize: 15,
    color: '#ffffff',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 4,
  },
});
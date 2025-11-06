/**
 * CurrentWordOverlay - Displays the currently spoken word during presentation
 *
 * Shows the current word being narrated as a text overlay on top of the map.
 * Synchronized with voice narration via the presentation context.
 *
 * Features:
 * - Displays current word from currentWordPosition
 * - Only visible during active presentation
 * - Positioned at top center of map
 * - Smooth fade-in/fade-out transitions
 * - Semi-transparent background for readability
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePresentation } from '@/contexts/presentation-context';

export default function CurrentWordOverlay() {
  const { isPresenting, currentWordPosition } = usePresentation();

  // Don't render if not presenting or no word position
  if (!isPresenting || !currentWordPosition || !currentWordPosition.wordInfo) {
    return null;
  }

  const currentWord = currentWordPosition.wordInfo.word;

  // Don't render if word is empty
  if (!currentWord || currentWord.trim().length === 0) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.wordContainer}>
        <Text style={styles.wordText}>{currentWord}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 998, // Below PresentationOverlay (1000), above map
    pointerEvents: 'none', // Allow touches to pass through
  },
  wordContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  wordText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
});

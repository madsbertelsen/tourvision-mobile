import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePresentation } from '@/contexts/presentation-context';

/**
 * PresentationOverlay - Shows presentation controls when a presentation is active
 *
 * Features:
 * - Block navigation (previous/next)
 * - Play/pause narration toggle
 * - Stop presentation
 * - Shows current block index
 */
export default function PresentationOverlay() {
  const {
    isPresenting,
    currentBlockIndex,
    blocks,
    isNarrating,
    nextBlock,
    previousBlock,
    stopPresentation,
    toggleNarration,
  } = usePresentation();

  // Don't render if not presenting
  if (!isPresenting) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.controls}>
        {/* Previous block button */}
        <TouchableOpacity
          onPress={previousBlock}
          style={[styles.button, currentBlockIndex === 0 && styles.buttonDisabled]}
          disabled={currentBlockIndex === 0}
        >
          <Ionicons name="play-back" size={24} color={currentBlockIndex === 0 ? "#9CA3AF" : "#fff"} />
        </TouchableOpacity>

        {/* Play/pause narration */}
        <TouchableOpacity
          onPress={toggleNarration}
          style={[styles.button, styles.primaryButton]}
        >
          <Ionicons name={isNarrating ? "pause" : "play"} size={28} color="#fff" />
        </TouchableOpacity>

        {/* Next block button */}
        <TouchableOpacity
          onPress={nextBlock}
          style={[styles.button, currentBlockIndex === blocks.length - 1 && styles.buttonDisabled]}
          disabled={currentBlockIndex === blocks.length - 1}
        >
          <Ionicons name="play-forward" size={24} color={currentBlockIndex === blocks.length - 1 ? "#9CA3AF" : "#fff"} />
        </TouchableOpacity>

        {/* Block counter */}
        <Text style={styles.counter}>
          {currentBlockIndex + 1} / {blocks.length}
        </Text>

        {/* Stop presentation button */}
        <TouchableOpacity
          onPress={stopPresentation}
          style={[styles.button, styles.stopButton]}
        >
          <Ionicons name="stop" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'box-none', // Allow touches to pass through except for controls
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.95)', // Dark semi-transparent background
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 50,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    pointerEvents: 'auto', // Ensure controls receive touches
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
  },
  stopButton: {
    backgroundColor: '#EF4444',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.5,
  },
  counter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'center',
  },
});

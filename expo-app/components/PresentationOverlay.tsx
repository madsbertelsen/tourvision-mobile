import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePresentation } from '@/contexts/presentation-context';

export default function PresentationOverlay() {
  const {
    isPresenting,
    currentBlockIndex,
    blocks,
    isNarrating,
    currentWordPosition,
    nextBlock,
    previousBlock,
    stopPresentation,
    toggleNarration,
  } = usePresentation();

  if (!isPresenting || blocks.length === 0) {
    return null;
  }

  const isFirstBlock = currentBlockIndex === 0;
  const isLastBlock = currentBlockIndex === blocks.length - 1;

  // Extract the current word being spoken
  const currentWord = currentWordPosition?.wordInfo?.word || null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Currently Spoken Word Overlay */}
      {currentWord && isNarrating && (
        <View style={styles.wordOverlay} pointerEvents="none">
          <Text style={styles.currentWord}>{currentWord}</Text>
        </View>
      )}

      {/* Floating Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={previousBlock}
          disabled={isFirstBlock}
        >
          <Ionicons
            name="chevron-back"
            size={28}
            color={isFirstBlock ? 'rgba(255, 255, 255, 0.3)' : '#ffffff'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playPauseButton}
          onPress={toggleNarration}
        >
          <Ionicons
            name={isNarrating ? 'pause' : 'play'}
            size={28}
            color="#ffffff"
          />
        </TouchableOpacity>

        <Text style={styles.progressText}>
          {currentBlockIndex + 1} / {blocks.length}
        </Text>

        <TouchableOpacity
          style={styles.navButton}
          onPress={nextBlock}
          disabled={isLastBlock}
        >
          <Ionicons
            name="chevron-forward"
            size={28}
            color={isLastBlock ? 'rgba(255, 255, 255, 0.3)' : '#ffffff'}
          />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.stopButton} onPress={stopPresentation}>
          <Ionicons name="close" size={28} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Transparent - only shows controls and word overlay
  },
  wordOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentWord: {
    fontSize: 48,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.85)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
  },
  navButton: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
  },
  playPauseButton: {
    padding: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.8)', // Blue background for play/pause
    borderRadius: 8,
  },
  progressText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 8,
  },
  stopButton: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
  },
});

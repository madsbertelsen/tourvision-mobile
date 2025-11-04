import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePresentation } from '@/contexts/presentation-context';

export default function PresentationOverlay() {
  const {
    isPresenting,
    currentBlockIndex,
    blocks,
    nextBlock,
    previousBlock,
    stopPresentation,
  } = usePresentation();

  if (!isPresenting || blocks.length === 0) {
    return null;
  }

  const currentBlock = blocks[currentBlockIndex];
  const isFirstBlock = currentBlockIndex === 0;
  const isLastBlock = currentBlockIndex === blocks.length - 1;

  return (
    <View style={styles.overlay}>
      {/* Content Display - Like news captions */}
      {Platform.OS === 'web' ? (
        <div
          dangerouslySetInnerHTML={{ __html: currentBlock.content }}
          style={{
            fontSize: '20px',
            lineHeight: '1.5',
            color: '#ffffff',
            fontWeight: '600',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
            marginBottom: '16px',
          }}
        />
      ) : (
        <Text style={styles.contentText}>{currentBlock.content}</Text>
      )}

      {/* Minimal Controls Bar */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={previousBlock}
          disabled={isFirstBlock}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={isFirstBlock ? 'rgba(255, 255, 255, 0.3)' : '#ffffff'}
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
            size={24}
            color={isLastBlock ? 'rgba(255, 255, 255, 0.3)' : '#ffffff'}
          />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.stopButton} onPress={stopPresentation}>
          <Ionicons name="close" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  contentText: {
    fontSize: 20,
    lineHeight: 30,
    color: '#ffffff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    marginBottom: 16,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  navButton: {
    padding: 8,
  },
  progressText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 8,
  },
  stopButton: {
    padding: 8,
  },
});

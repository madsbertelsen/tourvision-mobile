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
      {/* Content Display */}
      <View style={styles.contentContainer}>
        {Platform.OS === 'web' ? (
          <div
            dangerouslySetInnerHTML={{ __html: currentBlock.content }}
            style={{
              fontSize: '18px',
              lineHeight: '1.6',
              color: '#ffffff',
            }}
          />
        ) : (
          <Text style={styles.contentText}>{currentBlock.content}</Text>
        )}
      </View>

      {/* Navigation Controls */}
      <View style={styles.controlsContainer}>
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {currentBlockIndex + 1} / {blocks.length}
          </Text>
        </View>

        {/* Navigation buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.navButton, isFirstBlock && styles.navButtonDisabled]}
            onPress={previousBlock}
            disabled={isFirstBlock}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={isFirstBlock ? '#9CA3AF' : '#ffffff'}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.stopButton} onPress={stopPresentation}>
            <Ionicons name="stop" size={20} color="#ffffff" />
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, isLastBlock && styles.navButtonDisabled]}
            onPress={nextBlock}
            disabled={isLastBlock}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={isLastBlock ? '#9CA3AF' : '#ffffff'}
            />
          </TouchableOpacity>
        </View>
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
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    maxHeight: '40%',
  },
  contentContainer: {
    marginBottom: 20,
    maxHeight: '60%',
    overflow: 'hidden',
  },
  contentText: {
    fontSize: 18,
    lineHeight: 28,
    color: '#ffffff',
  },
  controlsContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#D1D5DB',
    fontWeight: '600',
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(75, 85, 99, 0.5)',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  stopButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
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

  const isFirstBlock = currentBlockIndex === 0;
  const isLastBlock = currentBlockIndex === blocks.length - 1;

  // Get all blocks up to current index (progressive reveal)
  const visibleBlocks = blocks.slice(0, currentBlockIndex + 1);

  return (
    <View style={styles.overlay}>
      {/* Transparent ProseMirror-style content overlay */}
      <ScrollView
        style={styles.contentScrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {visibleBlocks.map((block, index) => (
          <View key={block.id} style={styles.blockWrapper}>
            {Platform.OS === 'web' ? (
              <div
                dangerouslySetInnerHTML={{ __html: block.content }}
                style={{
                  fontSize: '24px',
                  lineHeight: '2.5',
                  color: '#ffffff',
                  fontWeight: '600',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 0, 0, 0.8)',
                  marginBottom: '32px',
                }}
              />
            ) : (
              <Text style={styles.blockText}>{block.content}</Text>
            )}
          </View>
        ))}
      </ScrollView>

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
    // Fully transparent - map shows through
  },
  contentScrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 40,
    paddingTop: 80,
    paddingBottom: 120,
  },
  blockWrapper: {
    marginBottom: 32,
  },
  blockText: {
    fontSize: 24,
    lineHeight: 60,
    color: '#ffffff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
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

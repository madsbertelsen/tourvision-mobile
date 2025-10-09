import { BottomSheetView, useBottomSheet } from '@gorhom/bottom-sheet';
import type { EditorState } from 'prosemirror-state';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import ProseMirrorViewerWrapper from './ProseMirrorViewerWrapper';

interface TripDocumentSheetProps {
  editorState: EditorState | null;
  onNodeFocus: (nodeId: string | null) => void;
  focusedNodeId: string | null;
  isEditMode: boolean;
  onChange: (doc: any) => void;
}

export function TripDocumentSheet({
  editorState,
  onNodeFocus,
  focusedNodeId,
  isEditMode,
  onChange,
}: TripDocumentSheetProps) {
  const { animatedPosition, animatedIndex } = useBottomSheet();
  const [settledHeight, setSettledHeight] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const screenHeight = Dimensions.get('window').height;
  const animationTimeoutRef = useRef<NodeJS.Timeout>();

  // Track when sheet index changes (more reliable than position tracking)
  useAnimatedReaction(
    () => animatedIndex.value,
    (currentIndex, previousIndex) => {
      'worklet';

      // Index changed means sheet is snapping to a position
      if (currentIndex !== previousIndex) {
        runOnJS(() => {
          setIsAnimating(true);
        })();
      }
    },
    []
  );

  // Track position changes to detect when animation settles
  useAnimatedReaction(
    () => animatedPosition.value,
    (position) => {
      'worklet';

      runOnJS(() => {
        // Clear any existing timeout
        if (animationTimeoutRef.current) {
          clearTimeout(animationTimeoutRef.current);
        }

        // Set a timeout to detect when animation stops
        animationTimeoutRef.current = setTimeout(() => {
          // Animation has stopped, update height
          const finalHeight = Math.max(100, screenHeight - position);
          console.log('[TripDocumentSheet] Animation settled at position:', position.toFixed(0), 'Height:', finalHeight.toFixed(0));
          setSettledHeight(finalHeight);
          setIsAnimating(false);
        }, 150); // Wait 150ms of no movement to consider animation complete
      })();
    },
    []
  );

  // Initialize height on mount
  useEffect(() => {
    // Small delay to ensure animatedPosition is ready
    const initTimeout = setTimeout(() => {
      const initialHeight = Math.max(100, screenHeight - animatedPosition.value);
      console.log('[TripDocumentSheet] Initial height:', initialHeight);
      setSettledHeight(initialHeight);
    }, 100);

    // Cleanup function
    return () => {
      clearTimeout(initTimeout);
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Use settled height, or fallback to a reasonable default
  const visibleHeight = settledHeight || Math.max(100, screenHeight - 400);

  // Log when height actually changes
  useEffect(() => {
    if (!isAnimating && settledHeight) {
      console.log('[TripDocumentSheet] Height set to:', settledHeight.toFixed(0));
    }
  }, [settledHeight, isAnimating]);


  return (
    <BottomSheetView style={styles.bottomSheetContent}>
      <View style={{ height: visibleHeight, width: '100%' }}>
        {editorState?.doc ? (
          <ProseMirrorViewerWrapper
            content={editorState.doc.toJSON()}
            onNodeFocus={onNodeFocus}
            focusedNodeId={focusedNodeId}
            editable={isEditMode}
            onChange={onChange}
            // Don't pass height as prop to avoid re-renders
            // The DOM component will use ResizeObserver to detect container size
          />
        ) : (
          <View style={styles.centerContent}>
            <Text style={styles.loadingText}>Waiting for content...</Text>
          </View>
        )}
      </View>
    </BottomSheetView>
  );
}

const styles = StyleSheet.create({
  bottomSheetContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
});
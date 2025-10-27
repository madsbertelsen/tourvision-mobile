import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Platform } from 'react-native';
import ProseMirrorWebView from '@/components/ProseMirrorWebView';
import { TypingAnimator, AnimationState, DEFAULT_TYPING_CONFIG } from '@/utils/typing-animator';

export default function DynamicLandingDocument() {
  const [animationState, setAnimationState] = useState<AnimationState | null>(null);
  const [showCursor, setShowCursor] = useState(true);
  const animatorRef = useRef<TypingAnimator | null>(null);
  const webViewRef = useRef<any>(null);

  // Initialize animator
  useEffect(() => {
    const animator = new TypingAnimator(
      DEFAULT_TYPING_CONFIG,
      (state) => {
        setAnimationState(state);
        // Update document in WebView
        if (webViewRef.current && state.document) {
          webViewRef.current.postMessage({
            type: 'setContent',
            content: state.document
          });
        }
      },
      (command, data) => {
        console.log('[Animation Command]', command, data);
        // Handle special commands if needed
      }
    );

    animatorRef.current = animator;
    animator.start();

    return () => {
      animator.pause();
    };
  }, []);

  // Cursor blinking effect
  useEffect(() => {
    if (!animationState?.isComplete) {
      const interval = setInterval(() => {
        setShowCursor(prev => !prev);
      }, DEFAULT_TYPING_CONFIG.cursorBlinkRate);

      return () => clearInterval(interval);
    } else {
      setShowCursor(false);
    }
  }, [animationState?.isComplete]);

  const handleSkip = () => {
    if (animatorRef.current) {
      animatorRef.current.skip();
    }
  };

  const handlePauseResume = () => {
    if (animatorRef.current) {
      if (animationState?.isPaused) {
        animatorRef.current.resume();
      } else {
        animatorRef.current.pause();
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Animation Controls */}
      {!animationState?.isComplete && (
        <View style={styles.controls}>
          <Pressable
            onPress={handlePauseResume}
            style={styles.controlButton}
          >
            <Text style={styles.controlButtonText}>
              {animationState?.isPaused ? '▶️ Resume' : '⏸️ Pause'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSkip}
            style={styles.controlButton}
          >
            <Text style={styles.controlButtonText}>⏭️ Skip Animation</Text>
          </Pressable>
        </View>
      )}

      {/* Completion Message */}
      {animationState?.isComplete && (
        <View style={styles.completionBanner}>
          <Text style={styles.completionText}>
            👉 Try editing this document yourself! Click anywhere to add your own destinations, format text, or create your first travel story.
          </Text>
        </View>
      )}

      {/* ProseMirror Editor */}
      <View style={styles.editorContainer}>
        <ProseMirrorWebView
          ref={webViewRef}
          initialContent={null}
          onContentChange={(doc) => {
            // Handle user edits after animation completes
            if (animationState?.isComplete) {
              console.log('[User Edit]', doc);
            }
          }}
          editable={animationState?.isComplete ?? false}
          showToolbar={animationState?.isComplete ?? false}
        />

        {/* Animated Cursor */}
        {!animationState?.isComplete && showCursor && (
          <View style={styles.cursorOverlay}>
            <View style={styles.cursor} />
          </View>
        )}
      </View>

      {/* Progress Indicator */}
      {!animationState?.isComplete && animationState && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            Writing... {Math.round((animationState.currentIndex / 1000) * 100)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  completionBanner: {
    padding: 16,
    backgroundColor: '#dbeafe',
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
  },
  completionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    textAlign: 'center',
  },
  editorContainer: {
    flex: 1,
    position: 'relative',
  },
  cursorOverlay: {
    position: 'absolute',
    right: 0,
    top: 0,
    pointerEvents: 'none',
  },
  cursor: {
    width: 2,
    height: 24,
    backgroundColor: '#3b82f6',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

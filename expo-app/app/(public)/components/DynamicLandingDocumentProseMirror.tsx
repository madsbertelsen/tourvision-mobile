import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Platform } from 'react-native';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { ProseMirrorToolbar } from '@/components/ProseMirrorToolbar';
import { TypingAnimatorCommands, AnimationState, DEFAULT_TYPING_CONFIG } from '@/utils/typing-animator-commands';
import { EditorCommand } from '@/utils/command-sequence-generator';

export default function DynamicLandingDocumentProseMirror() {
  const [animationState, setAnimationState] = useState<AnimationState | null>(null);
  const [highlightedButton, setHighlightedButton] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [animationStarted, setAnimationStarted] = useState(false);
  const animatorRef = useRef<TypingAnimatorCommands | null>(null);
  const webViewRef = useRef<ProseMirrorWebViewRef>(null);

  // Track text selection for geo-mark creation
  const pendingGeoMarkRef = useRef<{ start: number; end: number; data: any } | null>(null);

  // Initialize animator
  useEffect(() => {
    const animator = new TypingAnimatorCommands(
      DEFAULT_TYPING_CONFIG,
      (state) => {
        setAnimationState(state);
      },
      (command) => {
        handleCommand(command);
      }
    );

    animatorRef.current = animator;

    return () => {
      animator.pause();
    };
  }, []);

  // Start animation when editor is ready - DO NOT use timeout, start immediately
  useEffect(() => {
    if (editorReady && animatorRef.current && !animationStarted) {
      console.log('[Landing] ===== STARTING ANIMATION IMMEDIATELY =====');
      console.log('[Landing] Editor ready state:', editorReady);
      console.log('[Landing] WebView ref exists:', !!webViewRef.current);
      console.log('[Landing] sendCommand available:', typeof webViewRef.current?.sendCommand);

      setAnimationStarted(true);
      animatorRef.current?.start();
    }
  }, [editorReady, animationStarted]);

  const handleCommand = (command: EditorCommand) => {
    if (!webViewRef.current) {
      console.error('[Landing] CRITICAL: No webViewRef for command:', command.type);
      return;
    }

    // Log every 10th character, or all non-text commands
    if (command.type !== 'insertText' || Math.random() < 0.1) {
      console.log('[Landing] Executing command:', command.type, command.text ? `"${command.text}"` : '');
    }

    switch (command.type) {
      case 'insertText':
        webViewRef.current.sendCommand('insertText', { text: command.text });
        break;

      case 'insertParagraph':
        webViewRef.current.sendCommand('insertParagraph');
        break;

      case 'setHeading':
        flashButton(`heading-${command.level}`);
        webViewRef.current.sendCommand('setHeading', { level: command.level });
        break;

      case 'toggleBold':
        flashButton('bold');
        webViewRef.current.sendCommand('toggleBold');
        break;

      case 'selectText':
        console.log('[Landing] Selecting text, count:', command.count);
        // Select text by moving cursor backwards (Shift+ArrowLeft)
        webViewRef.current.sendCommand('selectText', { count: command.count });
        break;

      case 'createGeoMark':
        flashButton('location');
        // Text should already be selected by the previous selectText command
        console.log('[Landing] Creating geo-mark from selection:', {
          placeName: command.geoMarkData.placeName,
          selectedText: command.geoMarkData.selectedText
        });

        // Create geo-mark from the current selection
        webViewRef.current.sendCommand('createGeoMark', {
          geoMarkData: command.geoMarkData,
        });
        break;

      case 'wait':
        // Animation complete signal
        break;
    }
  };

  const flashButton = (buttonId: string) => {
    setHighlightedButton(buttonId);
    setTimeout(() => {
      setHighlightedButton(null);
    }, 300);
  };

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

  const progress = animatorRef.current?.getProgress() || 0;

  return (
    <View style={styles.container}>
      {/* Animation Controls - Removed per user request */}

      {/* Toolbar with Button Highlighting */}
      <View style={styles.toolbarContainer}>
        <ProseMirrorToolbar
          editable={true}
          highlightedButton={highlightedButton}
          onCommand={(command, params) => {
            webViewRef.current?.sendCommand(command, params);
          }}
        />
        {/* Highlight overlay for specific buttons */}
        {highlightedButton && (
          <View style={styles.highlightOverlay}>
            <Text style={styles.highlightText}>
              {highlightedButton === 'bold' && '✨ Making text bold'}
              {highlightedButton === 'heading-1' && '✨ Creating main heading'}
              {highlightedButton === 'heading-2' && '✨ Creating subheading'}
              {highlightedButton === 'location' && '✨ Adding location marker'}
            </Text>
          </View>
        )}
      </View>

      {/* ProseMirror Editor */}
      <View style={styles.editorContainer}>
        <ProseMirrorWebView
          ref={webViewRef}
          initialContent={{ type: 'doc', content: [{ type: 'paragraph', content: [] }] }} // Start with empty paragraph
          onContentChange={(doc) => {
            // Handle user edits after animation completes
            if (animationState?.isComplete) {
              console.log('[Landing] User edited document');
            }
          }}
          editable={true} // Always editable (AI is "editing" during animation)
          showToolbar={false} // We render toolbar separately above
          onReady={() => {
            console.log('[Landing] ===== EDITOR ONREADY CALLBACK FIRED =====');
            console.log('[Landing] Setting editorReady to TRUE');
            setEditorReady(true);
            console.log('[Landing] editorReady state should now be true');
          }}
        />
      </View>
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
    padding: 12,
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
  progressIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
  toolbarContainer: {
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  highlightOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  highlightText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    minHeight: 400,
    position: 'relative',
  },
});

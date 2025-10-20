import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, KeyboardAvoidingView, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import ProseMirrorNativeRenderer from '@/components/ProseMirrorNativeRenderer';
import CommentModal from '@/components/CommentModal';
import AIAssistantModal from '@/components/AIAssistantModal';
import { useStreamingTripGeneration, type TypingInstruction } from '@/hooks/useStreamingTripGeneration';
import { router } from 'expo-router';
import { useTripContext } from './_layout';

export default function TripDocumentView() {
  console.log('[TripDocumentView] Component mounted');
  const insets = useSafeAreaInsets();
  const {
    tripId,
    currentTrip,
    currentDoc,
    isEditMode,
    setIsEditMode,
    selectionEmpty,
    setSelectionEmpty,
    geoMarkDataToCreate,
    handleDocumentChange,
    handleShowGeoMarkEditor,
    documentRef,
  } = useTripContext();

  const [toolbarState, setToolbarState] = useState({
    paragraph: false,
    h1: false,
    h2: false,
    h3: false,
    bold: false,
    italic: false,
  });

  // Comment modal state
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentData, setCommentData] = useState<{
    selectedText: string;
    from: number;
    to: number;
  } | null>(null);

  // AI Assistant state
  const [showAIModal, setShowAIModal] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingAbortRef = useRef<AbortController | null>(null);
  const hasProcessedTypingRef = useRef<boolean>(false); // Track if we've processed the current generation
  const { state: streamState, startGeneration, cancel: cancelGeneration } = useStreamingTripGeneration();

  const handleSelectionChange = useCallback((empty: boolean) => {
    console.log('[TripDocumentView] Selection empty:', empty);
    setSelectionEmpty(empty);
  }, [setSelectionEmpty]);

  const handleToolbarStateChange = useCallback((state: any) => {
    console.log('[TripDocumentView] Toolbar state changed:', state);
    setToolbarState(state);
  }, []);

  const handleGeoMarkNavigate = useCallback((attrs: any) => {
    console.log('[TripDocumentView] Navigate to location:', attrs);

    // Navigate to location screen (Stack-nested for slide transition)
    // Use absolute path to match read mode behavior
    const pathname = tripId
      ? `/(mock)/trip/${tripId}/location/[locationId]` as any
      : '/(mock)/location/[id]' as any;

    const params: any = {
      locationId: attrs.geoId || 'unknown',
      id: attrs.geoId || 'unknown',
      name: attrs.placeName || 'Location',
      lat: attrs.lat || '0',
      lng: attrs.lng || '0',
      description: attrs.description || '',
      colorIndex: attrs.colorIndex?.toString() || '0',
      tripId: tripId, // Pass tripId so location screen can load trip data
    };

    // Pass contextDocument/visitDocument if it exists
    if (attrs.contextDocument) {
      params.contextDocument = JSON.stringify(attrs.contextDocument);
    } else if (attrs.visitDocument) {
      params.contextDocument = JSON.stringify(attrs.visitDocument);
    }

    router.push({
      pathname,
      params,
    });
  }, [tripId]);

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  const createGeoMark = () => {
    console.log('[TripDocumentView] Create Location button clicked');
    console.log('[TripDocumentView] Selection empty:', selectionEmpty);

    if (selectionEmpty) {
      alert('Please select some text first!');
      return;
    }

    console.log('[TripDocumentView] Sending createGeoMark command to WebView');
    (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('createGeoMark');
  };

  const handleShowCommentEditor = useCallback((data: { selectedText: string; from: number; to: number }) => {
    console.log('[TripDocumentView] Showing comment editor for:', data);
    setCommentData(data);
    setShowCommentModal(true);
  }, []);

  const handleSaveComment = useCallback((comment: any) => {
    console.log('[TripDocumentView] Saving comment:', comment);

    if (commentData && documentRef) {
      // Check if this is an @ai command
      const isAICommand = comment.content?.trim().startsWith('@ai');

      if (isAICommand) {
        // Extract AI instruction (remove @ai prefix)
        const instruction = comment.content.trim().substring(3).trim();
        console.log('[TripDocumentView] AI inline edit triggered:', instruction);
        console.log('[TripDocumentView] Selected text:', commentData.selectedText);
        console.log('[TripDocumentView] Range:', commentData.from, 'to', commentData.to);

        // Trigger inline AI edit
        handleInlineAIEdit(instruction, commentData.selectedText, commentData.from, commentData.to);
      } else {
        // Regular comment - send command to ProseMirror WebView to create the comment
        (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('createComment', {
          ...comment,
          from: commentData.from,
          to: commentData.to,
        });
      }
    }

    setCommentData(null);
    setShowCommentModal(false);
  }, [commentData, documentRef]);

  const handleCommentClick = useCallback((attrs: any) => {
    console.log('[TripDocumentView] Comment clicked:', attrs);
    // Show the comment in a modal (read-only for now)
    Alert.alert(
      attrs.userName || 'Comment',
      attrs.content || 'No content',
      [{ text: 'OK' }]
    );
  }, []);

  // AI Assistant handlers
  const handleAIPrompt = useCallback(async (prompt: string) => {
    console.log('[TripDocumentView] Starting AI generation with prompt:', prompt);
    console.log('[TripDocumentView] Resetting hasProcessedTypingRef to false');
    // Reset flag so new content can be typed
    hasProcessedTypingRef.current = false;
    // Keep modal open while generating
    await startGeneration(prompt);
  }, [startGeneration]);

  // Inline AI edit handler (triggered by @ai comments)
  const handleInlineAIEdit = useCallback(async (
    instruction: string,
    selectedText: string,
    from: number,
    to: number
  ) => {
    console.log('[TripDocumentView] Starting inline AI edit');
    console.log('[TripDocumentView] Resetting hasProcessedTypingRef to false for inline edit');

    // Reset flag so new content can be typed
    hasProcessedTypingRef.current = false;

    // Build prompt with context
    const prompt = `The user selected this text from their trip document:

"${selectedText}"

User instruction: ${instruction}

Please generate replacement content that addresses the user's request. Only return the replacement HTML content (with headings, paragraphs, and geo-marks if needed), nothing else.`;

    console.log('[TripDocumentView] Inline edit prompt:', prompt);

    // Store the range to delete
    (window as any).__inlineEditRange = { from, to };

    // Start generation
    await startGeneration(prompt);
  }, [startGeneration]);

  // Helper function for delays
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Process typing instructions when they become available
  useEffect(() => {
    const processTypingInstructions = async () => {
      console.log('[TripDocumentView] useEffect triggered:', {
        useTypingMode: streamState.useTypingMode,
        instructionsLength: streamState.typingInstructions.length,
        isTyping,
        hasProcessed: hasProcessedTypingRef.current
      });

      // Don't process if no instructions, already typing, or already processed this generation
      if (
        !streamState.useTypingMode ||
        streamState.typingInstructions.length === 0 ||
        isTyping ||
        hasProcessedTypingRef.current
      ) {
        console.log('[TripDocumentView] Skipping typing simulation - guard condition failed');
        return;
      }

      console.log('[TripDocumentView] Starting typing simulation...');

      // Close AI modal immediately so user can see typing
      setShowAIModal(false);

      setIsTyping(true);
      hasProcessedTypingRef.current = true; // Mark as processed

      // Create abort controller for cancellation
      typingAbortRef.current = new AbortController();

      try {
        // Focus editor and show typing cursor
        if (documentRef.current) {
          documentRef.current.focusEditor();
          await sleep(500);
          documentRef.current.sendCommand('showTypingCursor');
        }

        // Check if this is an inline edit (with stored range to delete)
        const inlineEditRange = (window as any).__inlineEditRange;
        let instructions = [...streamState.typingInstructions];

        if (inlineEditRange) {
          console.log('[TripDocumentView] Inline edit detected, prepending delete instructions');
          // Prepend instructions to select and delete the original content
          instructions = [
            { type: 'selectRange', from: inlineEditRange.from, to: inlineEditRange.to } as TypingInstruction,
            { type: 'deleteSelection' } as TypingInstruction,
            ...instructions
          ];
          // Clear the stored range
          delete (window as any).__inlineEditRange;
        }

        console.log(`[TripDocumentView] Processing ${instructions.length} instructions`);

        for (let i = 0; i < instructions.length; i++) {
          if (typingAbortRef.current.signal.aborted) {
            console.log('[TripDocumentView] Typing aborted');
            break;
          }

          const instruction = instructions[i];

          if (instruction.type === 'selectRange') {
            // Select a specific range in the document
            console.log('[TripDocumentView] Selecting range:', instruction.from, 'to', instruction.to);
            if (documentRef.current) {
              documentRef.current.sendCommand('selectRange', {
                from: instruction.from,
                to: instruction.to
              });
            }
            await sleep(300);
          } else if (instruction.type === 'deleteSelection') {
            // Delete the current selection
            console.log('[TripDocumentView] Deleting selection');
            if (documentRef.current) {
              documentRef.current.sendCommand('deleteSelection');
            }
            await sleep(300);
          } else if (instruction.type === 'setHeading') {
            // Send heading command
            if (documentRef.current) {
              documentRef.current.sendCommand('setHeading', { level: instruction.level });
            }
            await sleep(100);
          } else if (instruction.type === 'typeText') {
            // Type character by character
            const text = instruction.text;
            for (let j = 0; j < text.length; j++) {
              if (typingAbortRef.current.signal.aborted) break;

              const char = text[j];
              if (documentRef.current) {
                documentRef.current.typeCharacter(char);
              }

              await sleep(100);
            }
          } else if (instruction.type === 'insertParagraph') {
            // Insert paragraph break
            if (documentRef.current) {
              documentRef.current.insertParagraph();
            }
            await sleep(500);
          } else if (instruction.type === 'insertGeoMark') {
            // Type the text character by character
            const text = instruction.text;
            for (let j = 0; j < text.length; j++) {
              if (typingAbortRef.current.signal.aborted) break;

              const char = text[j];
              if (documentRef.current) {
                documentRef.current.typeCharacter(char);
              }

              await sleep(50);
            }

            // Select and convert to geo-mark
            if (documentRef.current) {
              const textLength = text.length;
              documentRef.current.sendCommand('selectBackward', { length: textLength });
              await sleep(300);

              const geoMarkData = {
                geoId: instruction.attrs.geoId || `loc-${Date.now()}`,
                placeName: instruction.attrs.placeName || text,
                lat: instruction.attrs.lat,
                lng: instruction.attrs.lng,
                colorIndex: parseInt(instruction.attrs.colorIndex || '0'),
                coordSource: instruction.attrs.coordSource || 'llm-fallback',
              };

              documentRef.current.createGeoMarkWithData(geoMarkData);
              await sleep(200);
            }
          }
        }

        console.log('[TripDocumentView] Typing complete!');

        // Wait a bit for the last onChange to fire
        await sleep(200);
      } catch (error) {
        console.error('[TripDocumentView] Typing error:', error);
      } finally {
        // Hide the typing cursor indicator
        if (documentRef.current) {
          documentRef.current.sendCommand('hideTypingCursor');
        }
        setIsTyping(false);
        typingAbortRef.current = null;
        // Keep hasProcessedTypingRef.current = true to prevent re-processing
      }
    };

    processTypingInstructions();
  }, [streamState.typingInstructions, streamState.useTypingMode]); // Removed isTyping and documentRef from dependencies

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {currentTrip?.title || 'Trip'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={toggleEditMode}
          style={[styles.button, isEditMode && styles.buttonActive]}
        >
          <Text style={[styles.buttonText, isEditMode && styles.buttonTextActive]}>
            {isEditMode ? 'Read Mode' : 'Edit Mode'}
          </Text>
        </TouchableOpacity>

        {isEditMode && (
          <TouchableOpacity
            onPress={createGeoMark}
            style={[styles.button, selectionEmpty && styles.buttonDisabled]}
            disabled={selectionEmpty}
          >
            <Text style={[styles.buttonText, selectionEmpty && styles.buttonTextDisabled]}>
              Create Location
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Platform: {Platform.OS} | Edit: {isEditMode ? 'ON' : 'OFF'} |
          Selection: {selectionEmpty ? 'Empty' : 'Has text'}
        </Text>
      </View>

      {/* Editor - Keep WebView mounted but hidden in read mode */}
      <View style={styles.editorWrapper}>
        {/* WebView - Always mounted, hidden in read mode */}
        <View style={[styles.editorContainer, !isEditMode && styles.hidden]}>
          <ProseMirrorWebView
            ref={documentRef}
            content={currentDoc}
            editable={isEditMode}
            onChange={handleDocumentChange}
            onSelectionChange={handleSelectionChange}
            onToolbarStateChange={handleToolbarStateChange}
            onGeoMarkNavigate={handleGeoMarkNavigate}
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
            onShowCommentEditor={handleShowCommentEditor}
            onCommentClick={handleCommentClick}
            geoMarkDataToCreate={geoMarkDataToCreate}
          />
        </View>

        {/* Native Renderer - Only visible in read mode */}
        {!isEditMode && (
          <View style={styles.nativeRendererContainer}>
            <ProseMirrorNativeRenderer content={currentDoc} tripId={tripId} />
          </View>
        )}
      </View>

      {/* Toolbar - Only in edit mode, outside editor wrapper */}
      {isEditMode && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
        >
          <ScrollView
            horizontal
            style={styles.toolbar}
            contentContainerStyle={styles.toolbarContent}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bounces={false}
            alwaysBounceVertical={false}
            alwaysBounceHorizontal={true}
            scrollEnabled={true}
            scrollsToTop={false}
            overScrollMode="never"
          >
            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setParagraph')}
              style={[styles.toolbarButton, toolbarState.paragraph && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.paragraph && styles.toolbarButtonTextActive]}>P</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setHeading', { level: 1 })}
              style={[styles.toolbarButton, toolbarState.h1 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h1 && styles.toolbarButtonTextActive]}>H1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setHeading', { level: 2 })}
              style={[styles.toolbarButton, toolbarState.h2 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h2 && styles.toolbarButtonTextActive]}>H2</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setHeading', { level: 3 })}
              style={[styles.toolbarButton, toolbarState.h3 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h3 && styles.toolbarButtonTextActive]}>H3</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('toggleBold')}
              style={[styles.toolbarButton, toolbarState.bold && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.bold && styles.toolbarButtonTextActive]}>B</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('toggleItalic')}
              style={[styles.toolbarButton, toolbarState.italic && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.italic && styles.toolbarButtonTextActive]}>I</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              onPress={() => {
                // Trigger comment on selection
                if (!selectionEmpty && documentRef.current) {
                  documentRef.current.sendCommand('addComment');
                }
              }}
              style={[styles.toolbarButton, selectionEmpty && styles.toolbarButtonDisabled]}
              disabled={selectionEmpty}
            >
              <Ionicons name="chatbubble-outline" size={18} color={selectionEmpty ? "#9CA3AF" : "#3B82F6"} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowAIModal(true)}
              style={styles.toolbarButton}
            >
              <Ionicons name="sparkles" size={18} color="#8B5CF6" />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* AI Assistant Modal */}
      <AIAssistantModal
        visible={showAIModal}
        onClose={() => {
          if (!isTyping) {
            setShowAIModal(false);
          }
        }}
        onSubmit={handleAIPrompt}
        isGenerating={streamState.isStreaming || isTyping}
      />

      {/* Comment Modal */}
      <CommentModal
        visible={showCommentModal}
        onClose={() => {
          setShowCommentModal(false);
          setCommentData(null);
        }}
        onSave={handleSaveComment}
        selectedText={commentData?.selectedText}
      />

      {/* Debug Info */}
      {currentDoc && (
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>
            Last saved: {new Date().toLocaleTimeString()}
          </Text>
          <Text style={styles.debugText} numberOfLines={2}>
            Doc nodes: {currentDoc.content?.length || 0} | Trip: {currentTrip?.title || 'N/A'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  buttonTextActive: {
    color: '#ffffff',
  },
  buttonTextDisabled: {
    color: '#9ca3af',
  },
  infoBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fbbf24',
  },
  infoText: {
    fontSize: 12,
    color: '#92400e',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  editorWrapper: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  nativeRendererContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
  },
  toolbar: {
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    height: 56, // Fixed height
    overflow: 'hidden', // Prevent content from expanding vertically
  },
  toolbarContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    minWidth: 40,
    alignItems: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  toolbarButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#f3f4f6',
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  toolbarButtonTextActive: {
    color: '#ffffff',
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
  debugInfo: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  debugText: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

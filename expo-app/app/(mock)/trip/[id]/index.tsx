import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, KeyboardAvoidingView, Alert, ScrollView, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import ProseMirrorNativeRenderer from '@/components/ProseMirrorNativeRenderer';
import CommentModal from '@/components/CommentModal';
import AIAssistantModal from '@/components/AIAssistantModal';
import CollaborationBar from '@/components/CollaborationBar';
import ShareTripModal from '@/components/ShareTripModal';
import { useYjsCollaboration } from '@/contexts/YjsCollaborationContext';
import { useStreamingTripGeneration } from '@/hooks/useStreamingTripGeneration';
import { router } from 'expo-router';
import { useTripContext } from './_layout';
import { requestAICommentReply, subscribeToAIReplies } from '@/lib/ai-comment-service';

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

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);

  // Track keyboard visibility
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener('keyboardWillShow', () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
  }, []);
  const { state: streamState, startGeneration, cancel: cancelGeneration } = useStreamingTripGeneration();

  // NOTE: AI generation now uses Y.js collaboration. The Edge Function participates
  // as a regular Y.js client, applying changes directly to the shared document.
  // All clients receive updates automatically through the existing Y.js infrastructure.

  // Set up Y.js collaboration
  const { setEditorRef, isCollaborating, startCollaboration } = useYjsCollaboration();
  useEffect(() => {
    setEditorRef(documentRef);
  }, [setEditorRef, documentRef]);

  // Save to AsyncStorage during Y.js collaboration
  // During Y.js collaboration, documentChange events are suppressed to avoid circular updates
  // So we need to save the document state to local storage in two scenarios:
  // 1. Immediately when collaboration starts (to capture Y.js sync from database)
  // 2. Periodically during active collaboration
  useEffect(() => {
    if (!isCollaborating || !documentRef.current || !currentTrip) return;

    // Immediate save when collaboration starts (after Y.js syncs from DB)
    const immediateTimer = setTimeout(() => {
      console.log('[TripDocumentView] Initial save after Y.js sync');
      documentRef.current?.getState();
    }, 2000); // Wait 2 seconds for Y.js to sync from database

    // Periodic saves during active editing
    const saveInterval = setInterval(() => {
      console.log('[TripDocumentView] Periodic save to AsyncStorage');
      documentRef.current?.getState();
    }, 10000); // Save every 10 seconds

    return () => {
      clearTimeout(immediateTimer);
      clearInterval(saveInterval);
    };
  }, [isCollaborating, documentRef, currentTrip]);

  // Auto-start collaboration when WebView is ready to sync Y.js state from database
  const [isWebViewReady, setIsWebViewReady] = React.useState(false);

  const handleWebViewReady = React.useCallback(() => {
    console.log('[TripDocumentView] WebView is ready');
    setIsWebViewReady(true);
  }, []);

  useEffect(() => {
    if (!tripId || !isWebViewReady || isCollaborating) return;

    const autoStartCollaboration = async () => {
      try {
        console.log('[TripDocumentView] Auto-starting collaboration to load Y.js state');
        await startCollaboration(tripId);
      } catch (error) {
        console.error('[TripDocumentView] Failed to auto-start collaboration:', error);
      }
    };

    autoStartCollaboration();
  }, [tripId, isWebViewReady, isCollaborating, startCollaboration]);

  // Note: Y.js collaboration handles sync automatically through YSupabaseProvider
  // No need for manual step subscription like with Socket.IO

  // Subscribe to AI comment replies via Supabase Realtime
  useEffect(() => {
    if (!tripId) return;

    console.log('[TripDocumentView] Setting up AI reply subscription for trip:', tripId);

    const unsubscribe = subscribeToAIReplies(tripId, (data) => {
      console.log('[TripDocumentView] AI comment reply received:', {
        commentId: data.commentId,
        replyLength: data.aiReply.length,
      });

      // Update the comment with the AI reply
      // Convert the plain text AI reply to a simple ProseMirror doc
      const aiReplyDoc = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: data.aiReply
          }]
        }]
      };

      if (documentRef.current) {
        documentRef.current.sendCommand('updateCommentAIReply', {
          commentId: data.commentId,
          aiReplyDoc: aiReplyDoc
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tripId, documentRef]);

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

  const handleSaveComment = useCallback(async (comment: any) => {
    console.log('[TripDocumentView] Saving comment:', comment);

    if (commentData && documentRef) {
      // Check if this is an @ai command
      const isAICommand = comment.content?.trim().startsWith('@ai');

      if (isAICommand) {
        // Extract AI instruction (remove @ai prefix)
        const instruction = comment.content.trim().substring(3).trim();
        console.log('[TripDocumentView] AI comment detected:', instruction);
        console.log('[TripDocumentView] Selected text:', commentData.selectedText);
        console.log('[TripDocumentView] Range:', commentData.from, 'to', commentData.to);

        // IMPORTANT: Save the comment FIRST before triggering AI
        // This way the comment remains visible while AI generates reply
        (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('createComment', {
          ...comment,
          from: commentData.from,
          to: commentData.to,
        });

        // Auto-enable collaboration if not already active
        if (!isCollaborating) {
          console.log('[TripDocumentView] Auto-enabling collaboration for AI comment reply');
          try {
            await startCollaboration(tripId);
            // Give collaboration a moment to establish connection
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('[TripDocumentView] Collaboration enabled successfully');
          } catch (error) {
            console.error('[TripDocumentView] Failed to enable collaboration:', error);
          }
        }

        // Now request AI reply for the comment via Edge Function
        console.log('[TripDocumentView] Requesting AI comment reply via Edge Function...');

        try {
          const result = await requestAICommentReply({
            documentId: tripId,
            commentId: comment.commentId,
            from: commentData.from,
            to: commentData.to,
            instruction: instruction,
            selectedText: commentData.selectedText || '',
            userId: comment.userId,
            userName: comment.userName,
          });

          if (!result.success) {
            console.error('[TripDocumentView] AI comment reply failed:', result.error);
            if (Platform.OS === 'web') {
              window.alert(`AI reply failed: ${result.error}`);
            } else {
              Alert.alert('AI Reply Failed', result.error || 'Unknown error');
            }
          } else {
            console.log('[TripDocumentView] AI comment reply requested successfully');
          }
        } catch (error) {
          console.error('[TripDocumentView] Error requesting AI reply:', error);
          if (Platform.OS === 'web') {
            window.alert('Failed to request AI reply');
          } else {
            Alert.alert('Error', 'Failed to request AI reply');
          }
        }
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
  }, [commentData, documentRef, isCollaborating, startCollaboration, tripId]);

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

    // Auto-enable collaboration if not already active
    if (!isCollaborating) {
      console.log('[TripDocumentView] Auto-enabling collaboration for AI generation');
      await startCollaboration(tripId);
      // Give collaboration a moment to establish connection
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Start generation - Edge Function will participate as Y.js collaborator
    await startGeneration(prompt, tripId);
  }, [startGeneration, isCollaborating, startCollaboration, tripId]);

  // Inline AI edit handler (triggered by @ai comments)
  // NOTE: This feature needs to be redesigned for Y.js collaboration
  // For now, inline edits will replace the entire document
  const handleInlineAIEdit = useCallback(async (
    instruction: string,
    selectedText: string,
    from: number,
    to: number
  ) => {
    console.log('[TripDocumentView] Starting inline AI edit');
    console.log('[TripDocumentView] WARNING: Inline edits not yet supported with Y.js collaboration');

    // Auto-enable collaboration if not already active
    if (!isCollaborating) {
      console.log('[TripDocumentView] Auto-enabling collaboration for inline AI edit');
      await startCollaboration(tripId);
      // Give collaboration a moment to establish connection
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Build prompt with context
    const prompt = `The user selected this text from their trip document:

"${selectedText}"

User instruction: ${instruction}

Please generate replacement content that addresses the user's request. Only return the replacement HTML content (with headings, paragraphs, and geo-marks if needed), nothing else.`;

    console.log('[TripDocumentView] Inline edit prompt:', prompt);

    // TODO: Implement proper inline edit with Y.js transactions
    // For now, just generate content (will replace entire document)
    await startGeneration(prompt, tripId);
  }, [startGeneration, isCollaborating, startCollaboration, tripId]);

  // NOTE: Typing simulation has been removed. AI generation now uses Y.js collaboration,
  // so updates appear automatically through the existing collaboration infrastructure.

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
          onPress={() => setShowShareModal(true)}
          style={styles.shareButton}
        >
          <Ionicons name="share-outline" size={20} color="#3B82F6" />
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>

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

      {/* Collaboration Bar */}
      {tripId && <CollaborationBar tripId={tripId} />}

      {/* Toolbar - Only in edit mode, above editor */}
      {isEditMode && (
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

          <TouchableOpacity
            onPress={() => {
              // Navigate to video playback route
              router.push({
                pathname: `/(mock)/trip/${tripId}/video`,
                params: {
                  tripId: tripId,
                  documentContent: JSON.stringify(currentDoc),
                }
              });
            }}
            style={styles.toolbarButton}
          >
            <Ionicons name="play-circle" size={18} color="#10B981" />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Editor - Keep WebView mounted but hidden in read mode */}
      <View style={styles.editorWrapper}>
        {/* WebView - Always mounted, hidden in read mode */}
        <View style={[styles.editorContainer, !isEditMode && styles.hidden]}>
          <ProseMirrorWebView
            key={tripId} // Force remount when trip changes
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
            onReady={handleWebViewReady}
          />
        </View>

        {/* Native Renderer - Only visible in read mode */}
        {!isEditMode && (
          <View style={styles.nativeRendererContainer}>
            <ProseMirrorNativeRenderer content={currentDoc} tripId={tripId} />
          </View>
        )}
      </View>

      {/* AI Assistant Modal */}
      <AIAssistantModal
        visible={showAIModal}
        onClose={() => setShowAIModal(false)}
        onSubmit={handleAIPrompt}
        isGenerating={streamState.isGenerating}
      />

      {/* Share Modal */}
      {tripId && currentTrip && (
        <ShareTripModal
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          tripId={tripId}
          tripTitle={currentTrip.title || 'Untitled Trip'}
        />
      )}

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
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#EBF5FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
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
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    maxHeight: 56, // Limit toolbar height
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
});

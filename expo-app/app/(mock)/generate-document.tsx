import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { useStreamingDocumentGeneration, type TypingInstruction } from '@/hooks/useStreamingDocumentGeneration';
import { createDocument, saveDocument } from '@/utils/documents-storage';

export default function GenerateTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt: string }>();
  const documentRef = useRef<ProseMirrorWebViewRef>(null);
  const { state: streamState, startGeneration, cancel: cancelGeneration } = useStreamingDocumentGeneration();

  const [toolbarState, setToolbarState] = useState({
    paragraph: false,
    h1: false,
    h2: false,
    h3: false,
    bold: false,
    italic: false,
  });
  const [highlightedButton, setHighlightedButton] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingAbortRef = useRef<AbortController | null>(null);
  const [localDoc, setLocalDoc] = useState<any>(null); // Track document during typing
  const processedInstructionsRef = useRef<TypingInstruction[] | null>(null); // Track which instructions we've processed
  const bottomBarAnim = useRef(new Animated.Value(100)).current; // Start off-screen
  const [savedTripId, setSavedTripId] = useState<string | null>(null);

  // Sync streaming document to local state
  const currentDoc = localDoc || streamState.document;
  const isGenerating = streamState.isStreaming;
  const isComplete = !isGenerating && !isTyping && savedTripId !== null;

  // Auto-scroll to bottom when document updates during generation
  // Throttle scrolling to avoid jerky behavior
  const lastScrollTimeRef = useRef(0);
  useEffect(() => {
    if ((isGenerating || isTyping) && documentRef.current) {
      const now = Date.now();
      // Only scroll every 200ms to keep it smooth
      if (now - lastScrollTimeRef.current > 200) {
        documentRef.current.scrollToBottom();
        lastScrollTimeRef.current = now;
      }
    }
  }, [currentDoc, isGenerating, isTyping]);

  // Process typing instructions when they become available
  useEffect(() => {
    const processTypingInstructions = async () => {
      // Don't process if no instructions, already typing, or already processed these exact instructions
      if (
        !streamState.useTypingMode ||
        streamState.typingInstructions.length === 0 ||
        isTyping ||
        processedInstructionsRef.current === streamState.typingInstructions
      ) {
        return;
      }

      console.log('[GenerateTrip] Starting typing simulation...');
      setIsTyping(true);
      processedInstructionsRef.current = streamState.typingInstructions;

      // Create abort controller for cancellation
      typingAbortRef.current = new AbortController();

      try {
        // Focus editor first to show keyboard and position cursor
        if (documentRef.current) {
          documentRef.current.focusEditor();
          await sleep(500); // Wait for editor to focus

          // Show the typing cursor indicator
          documentRef.current.sendCommand('showTypingCursor');
        }

        const instructions = streamState.typingInstructions;
        console.log(`[GenerateTrip] Processing ${instructions.length} instructions`);

        for (let i = 0; i < instructions.length; i++) {
          if (typingAbortRef.current.signal.aborted) {
            console.log('[GenerateTrip] Typing aborted');
            break;
          }

          const instruction = instructions[i];

          if (instruction.type === 'setHeading') {
            // Highlight toolbar button
            const buttonKey = `h${instruction.level}`;
            setHighlightedButton(buttonKey);
            await sleep(300); // Pause to show button highlight

            // Send heading command
            if (documentRef.current) {
              documentRef.current.sendCommand('setHeading', { level: instruction.level });
            }

            // Unhighlight button
            setHighlightedButton(null);
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

              // Delay between characters (slower so cursor is visible)
              await sleep(100);
            }
          } else if (instruction.type === 'insertParagraph') {
            // Insert paragraph break
            if (documentRef.current) {
              documentRef.current.insertParagraph();
            }
            await sleep(500); // Pause after paragraph
          } else if (instruction.type === 'insertGeoMark') {
            console.log('[GenerateTrip] Processing insertGeoMark instruction:', instruction);

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

            // Then select the typed text and convert to geo-mark
            if (documentRef.current) {
              // Select the text we just typed (length of text backwards from cursor)
              const textLength = text.length;

              // Send command to select text backwards and create geo-mark
              documentRef.current.sendCommand('selectBackward', { length: textLength });
              await sleep(300); // Wait for selection to be processed by WebView

              // Create geo-mark with attributes
              const geoMarkData = {
                geoId: instruction.attrs.geoId || `loc-${Date.now()}`,
                placeName: instruction.attrs.placeName || text,
                lat: instruction.attrs.lat,
                lng: instruction.attrs.lng,
                colorIndex: parseInt(instruction.attrs.colorIndex || '0'),
                coordSource: instruction.attrs.coordSource || 'llm-fallback',
              };

              documentRef.current.createGeoMarkWithData(geoMarkData);
              await sleep(200); // Wait for geo-mark creation
            }
          }
        }

        console.log('[GenerateTrip] Typing complete!');

        // Mark as complete and trigger auto-save
        // Wait a bit for the last onChange to fire
        await sleep(200);

        // Manually trigger save by extracting title and saving
        if (localDoc) {
          try {
            // Extract title from first heading or use prompt
            let title = 'AI Generated Trip';
            const firstHeading = localDoc.content?.find(
              (node: any) => node.type === 'heading' && node.attrs?.level === 1
            );
            if (firstHeading?.content?.[0]?.text) {
              title = firstHeading.content[0].text;
            }

            // Create and save document
            const newDocument = await createDocument(title);
            await saveDocument({
              ...newDocument,
              document: localDoc,
            });
            console.log('[GenerateTrip] Document saved:', newDocument.id);

            // Store document ID and show bottom bar
            setSavedTripId(newDocument.id);

            // Animate bottom bar sliding up
            Animated.spring(bottomBarAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 50,
              friction: 8,
            }).start();
          } catch (error) {
            console.error('[GenerateTrip] Failed to save document:', error);
            Alert.alert('Error', 'Failed to save document');
          }
        }
      } catch (error) {
        console.error('[GenerateTrip] Typing error:', error);
      } finally {
        // Hide the typing cursor indicator
        if (documentRef.current) {
          documentRef.current.sendCommand('hideTypingCursor');
        }
        setIsTyping(false);
        typingAbortRef.current = null;
      }
    };

    processTypingInstructions();
  }, [streamState.typingInstructions, streamState.useTypingMode, isTyping]);

  // Helper function for delays
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleDocumentChange = useCallback((doc: any) => {
    // Update local document as it builds up during typing
    console.log('[GenerateTrip] Document changed, updating local state');
    setLocalDoc(doc);
  }, []);

  const handleToolbarStateChange = useCallback((state: any) => {
    setToolbarState(state);
  }, []);

  // Auto-start generation when screen loads
  useEffect(() => {
    const prompt = params.prompt;
    if (prompt) {
      // Reset local document state and processed instructions
      setLocalDoc(null);
      processedInstructionsRef.current = null;

      console.log('[GenerateTrip] Auto-starting generation with prompt:', prompt);
      startGeneration(prompt);
    } else {
      // No prompt provided, go back
      Alert.alert('Error', 'No prompt provided', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }
  }, [params.prompt]);

  // Handle errors
  useEffect(() => {
    if (streamState.error) {
      Alert.alert('Generation Failed', streamState.error, [
        {
          text: 'Try Again',
          onPress: () => {
            router.back();
          },
        },
      ]);
    }
  }, [streamState.error]);

  const handleCancel = () => {
    if (isGenerating) {
      Alert.alert(
        'Cancel Generation?',
        'Are you sure you want to cancel the document generation?',
        [
          { text: 'Keep Generating', style: 'cancel' },
          {
            text: 'Cancel',
            style: 'destructive',
            onPress: () => {
              cancelGeneration();
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3B82F6" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {isGenerating && !isTyping && (
            <>
              <ActivityIndicator size="small" color="#3B82F6" style={{ marginRight: 8 }} />
              <Text style={styles.headerStatus}>AI is preparing your document...</Text>
            </>
          )}
          {isTyping && (
            <>
              <Text style={styles.headerEmoji}>⌨️</Text>
              <Text style={styles.headerStatus}>AI is typing your document...</Text>
            </>
          )}
          {!isGenerating && !isTyping && (
            <Text style={styles.headerTitle}>New Document</Text>
          )}
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Document Editor */}
      <View style={styles.editorContainer}>
        <ProseMirrorWebView
          ref={documentRef}
          content={currentDoc}
          editable={true}
          onChange={handleDocumentChange}
          onToolbarStateChange={handleToolbarStateChange}
        />
      </View>

      {/* Bottom Action Bar - Slides up when complete */}
      {isComplete && (
        <Animated.View
          style={[
            styles.bottomBar,
            {
              transform: [{ translateY: bottomBarAnim }]
            }
          ]}
        >
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => {
              if (savedTripId) {
                router.replace(`/(mock)/document/${savedTripId}`);
              }
            }}
          >
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.primaryButtonText}>Open Document</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => router.back()}
          >
            <Ionicons name="add-circle-outline" size={24} color="#3B82F6" />
            <Text style={styles.secondaryButtonText}>Create Another</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
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
    backgroundColor: '#ffffff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  backText: {
    fontSize: 17,
    color: '#3B82F6',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  headerStatus: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6b7280',
  },
  headerEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32, // Extra padding for safe area
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  secondaryButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
});

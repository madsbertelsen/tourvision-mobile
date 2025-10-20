import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { useStreamingTripGeneration, type TypingInstruction } from '@/hooks/useStreamingTripGeneration';
import { createTrip, saveTrip } from '@/utils/trips-storage';

export default function GenerateTripScreen() {
  const router = useRouter();
  const documentRef = useRef<ProseMirrorWebViewRef>(null);
  const { state: streamState, startGeneration, cancel: cancelGeneration } = useStreamingTripGeneration();

  const [prompt, setPrompt] = useState('');
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

  // Sync streaming document to local state
  const currentDoc = localDoc || streamState.document;
  const isGenerating = streamState.isStreaming;

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
      if (!streamState.useTypingMode || streamState.typingInstructions.length === 0 || isTyping) {
        return;
      }

      console.log('[GenerateTrip] Starting typing simulation...');
      setIsTyping(true);

      // Create abort controller for cancellation
      typingAbortRef.current = new AbortController();

      try {
        // Focus editor first to show keyboard and position cursor
        if (documentRef.current) {
          documentRef.current.focusEditor();
          await sleep(500); // Wait for editor to focus
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

              // Delay between characters (realistic typing speed)
              await sleep(50);
            }
          } else if (instruction.type === 'insertParagraph') {
            // Insert paragraph break
            if (documentRef.current) {
              documentRef.current.insertParagraph();
            }
            await sleep(500); // Pause after paragraph
          } else if (instruction.type === 'insertGeoMark') {
            // First type the text character by character
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
              await sleep(100); // Wait for selection

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
              await sleep(100); // Wait for geo-mark creation
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

            // Create and save trip
            const newTrip = await createTrip(title);
            await saveTrip({
              ...newTrip,
              document: localDoc,
            });
            console.log('[GenerateTrip] Trip saved:', newTrip.id);

            // Show success message
            Alert.alert(
              'Trip Generated!',
              `Your trip "${title}" has been created. You can now edit it.`,
              [
                {
                  text: 'Open Trip',
                  onPress: () => {
                    router.replace(`/(mock)/trip/${newTrip.id}`);
                  },
                },
                {
                  text: 'Create Another',
                  style: 'cancel',
                },
              ]
            );
          } catch (error) {
            console.error('[GenerateTrip] Failed to save trip:', error);
            Alert.alert('Error', 'Failed to save trip');
          }
        }
      } catch (error) {
        console.error('[GenerateTrip] Typing error:', error);
      } finally {
        setIsTyping(false);
        typingAbortRef.current = null;
      }
    };

    processTypingInstructions();
  }, [streamState.typingInstructions, streamState.useTypingMode, isTyping, localDoc, router]);

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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      return;
    }

    // Reset local document state
    setLocalDoc(null);

    console.log('[GenerateTrip] Starting generation with prompt:', prompt);
    await startGeneration(prompt);
  };

  // Handle errors
  useEffect(() => {
    if (streamState.error) {
      Alert.alert('Generation Failed', streamState.error, [
        {
          text: 'Try Again',
          onPress: () => {
            // Reset will happen automatically
          },
        },
      ]);
    }
  }, [streamState.error]);

  const handleCancel = () => {
    if (isGenerating) {
      Alert.alert(
        'Cancel Generation?',
        'Are you sure you want to cancel the trip generation?',
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
        <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Generate Trip with AI</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Prompt Input */}
      <View style={styles.promptSection}>
        <Text style={styles.promptLabel}>What kind of trip do you want to plan?</Text>
        <View style={styles.promptInputContainer}>
          <TextInput
            style={styles.promptInput}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g., Plan a 5-day trip to Tokyo for food lovers"
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={200}
            editable={!isGenerating && !isTyping}
          />
          <TouchableOpacity
            onPress={handleGenerate}
            style={[
              styles.generateButton,
              (!prompt.trim() || isGenerating || isTyping) && styles.generateButtonDisabled
            ]}
            disabled={!prompt.trim() || isGenerating || isTyping}
          >
            {(isGenerating || isTyping) ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#fff" />
                <Text style={styles.generateButtonText}>Generate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {isGenerating && !isTyping && (
          <Text style={styles.generatingText}>
            ✨ AI is preparing your trip...
          </Text>
        )}
        {isTyping && (
          <Text style={styles.generatingText}>
            ⌨️ AI is typing your trip...
          </Text>
        )}
      </View>

      {/* Document Editor */}
      <KeyboardAvoidingView
        style={styles.editorWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.editorContainer}>
          <ProseMirrorWebView
            ref={documentRef}
            content={currentDoc}
            editable={true}
            onChange={handleDocumentChange}
            onToolbarStateChange={handleToolbarStateChange}
          />
        </View>

        {/* Toolbar - Show during typing with highlights */}
        {(!isGenerating || isTyping) && (
          <View style={styles.toolbar}>
            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setParagraph')}
              style={[
                styles.toolbarButton,
                toolbarState.paragraph && styles.toolbarButtonActive,
                highlightedButton === 'paragraph' && styles.toolbarButtonHighlighted
              ]}
              disabled={isTyping}
            >
              <Text style={[
                styles.toolbarButtonText,
                toolbarState.paragraph && styles.toolbarButtonTextActive,
                highlightedButton === 'paragraph' && styles.toolbarButtonTextHighlighted
              ]}>P</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setHeading', { level: 1 })}
              style={[
                styles.toolbarButton,
                toolbarState.h1 && styles.toolbarButtonActive,
                highlightedButton === 'h1' && styles.toolbarButtonHighlighted
              ]}
              disabled={isTyping}
            >
              <Text style={[
                styles.toolbarButtonText,
                toolbarState.h1 && styles.toolbarButtonTextActive,
                highlightedButton === 'h1' && styles.toolbarButtonTextHighlighted
              ]}>H1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setHeading', { level: 2 })}
              style={[
                styles.toolbarButton,
                toolbarState.h2 && styles.toolbarButtonActive,
                highlightedButton === 'h2' && styles.toolbarButtonHighlighted
              ]}
              disabled={isTyping}
            >
              <Text style={[
                styles.toolbarButtonText,
                toolbarState.h2 && styles.toolbarButtonTextActive,
                highlightedButton === 'h2' && styles.toolbarButtonTextHighlighted
              ]}>H2</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setHeading', { level: 3 })}
              style={[
                styles.toolbarButton,
                toolbarState.h3 && styles.toolbarButtonActive,
                highlightedButton === 'h3' && styles.toolbarButtonHighlighted
              ]}
              disabled={isTyping}
            >
              <Text style={[
                styles.toolbarButtonText,
                toolbarState.h3 && styles.toolbarButtonTextActive,
                highlightedButton === 'h3' && styles.toolbarButtonTextHighlighted
              ]}>H3</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('toggleBold')}
              style={[
                styles.toolbarButton,
                toolbarState.bold && styles.toolbarButtonActive,
                highlightedButton === 'bold' && styles.toolbarButtonHighlighted
              ]}
              disabled={isTyping}
            >
              <Text style={[
                styles.toolbarButtonText,
                toolbarState.bold && styles.toolbarButtonTextActive,
                highlightedButton === 'bold' && styles.toolbarButtonTextHighlighted
              ]}>B</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('toggleItalic')}
              style={[
                styles.toolbarButton,
                toolbarState.italic && styles.toolbarButtonActive,
                highlightedButton === 'italic' && styles.toolbarButtonHighlighted
              ]}
              disabled={isTyping}
            >
              <Text style={[
                styles.toolbarButtonText,
                toolbarState.italic && styles.toolbarButtonTextActive,
                highlightedButton === 'italic' && styles.toolbarButtonTextHighlighted
              ]}>I</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
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
  },
  headerButton: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  promptSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  promptLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  promptInputContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  promptInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#ffffff',
    minHeight: 60,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  generateButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  generatingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  editorWrapper: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
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
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  toolbarButtonTextActive: {
    color: '#ffffff',
  },
  toolbarButtonHighlighted: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  toolbarButtonTextHighlighted: {
    color: '#ffffff',
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
});

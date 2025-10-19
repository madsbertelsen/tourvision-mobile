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
import { useStreamingTripGeneration } from '@/hooks/useStreamingTripGeneration';
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

  // Sync streaming document to local state
  const currentDoc = streamState.document;
  const isGenerating = streamState.isStreaming;

  // Auto-scroll to bottom when document updates during generation
  useEffect(() => {
    if (isGenerating && documentRef.current) {
      documentRef.current.scrollToBottom();
    }
  }, [currentDoc, isGenerating]);

  const handleDocumentChange = useCallback((doc: any) => {
    // During streaming, prevent manual edits
    if (isGenerating) {
      return;
    }
    // After generation, allow manual edits
  }, [isGenerating]);

  const handleToolbarStateChange = useCallback((state: any) => {
    setToolbarState(state);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      return;
    }

    console.log('[GenerateTrip] Starting generation with prompt:', prompt);
    await startGeneration(prompt);
  };

  // Handle completion - auto-save trip
  useEffect(() => {
    if (streamState.isComplete && !streamState.error) {
      console.log('[GenerateTrip] Generation complete, auto-saving...');

      (async () => {
        try {
          // Extract title from first heading or use prompt
          let title = 'AI Generated Trip';
          const firstHeading = streamState.document.content?.find(
            (node: any) => node.type === 'heading' && node.attrs?.level === 1
          );
          if (firstHeading?.content?.[0]?.text) {
            title = firstHeading.content[0].text;
          }

          // Create and save trip
          const newTrip = await createTrip(title);
          await saveTrip({
            ...newTrip,
            document: streamState.document,
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
      })();
    }
  }, [streamState.isComplete, streamState.error, streamState.document, router]);

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
            editable={!isGenerating}
          />
          <TouchableOpacity
            onPress={handleGenerate}
            style={[
              styles.generateButton,
              (!prompt.trim() || isGenerating) && styles.generateButtonDisabled
            ]}
            disabled={!prompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#fff" />
                <Text style={styles.generateButtonText}>Generate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {isGenerating && (
          <Text style={styles.generatingText}>
            ✨ AI is creating your personalized trip...
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

        {/* Toolbar - Only show when not generating */}
        {!isGenerating && (
          <View style={styles.toolbar}>
            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setParagraph')}
              style={[styles.toolbarButton, toolbarState.paragraph && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.paragraph && styles.toolbarButtonTextActive]}>P</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setHeading', { level: 1 })}
              style={[styles.toolbarButton, toolbarState.h1 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h1 && styles.toolbarButtonTextActive]}>H1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setHeading', { level: 2 })}
              style={[styles.toolbarButton, toolbarState.h2 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h2 && styles.toolbarButtonTextActive]}>H2</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('setHeading', { level: 3 })}
              style={[styles.toolbarButton, toolbarState.h3 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h3 && styles.toolbarButtonTextActive]}>H3</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('toggleBold')}
              style={[styles.toolbarButton, toolbarState.bold && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.bold && styles.toolbarButtonTextActive]}>B</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => documentRef.current?.sendCommand('toggleItalic')}
              style={[styles.toolbarButton, toolbarState.italic && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.italic && styles.toolbarButtonTextActive]}>I</Text>
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
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
});

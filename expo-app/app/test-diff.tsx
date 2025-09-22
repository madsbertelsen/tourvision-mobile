import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TipTapTestEditorSimple, { TipTapTestEditorHandle } from '@/components/TipTapTestEditorSimple';

// Sample travel document
const initialDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Paris Weekend Trip' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'A romantic 3-day getaway to the City of Light.' }]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Day 1 - Arrival' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Check into hotel near the Louvre. Evening stroll along the Seine.' }]
    }
  ]
};

// Static proposal with transaction steps
// Position calculation for this doc:
// doc(0) h1(1) text(19) h1(20) p(21) text(67) p(68) h2(69) text(85) h2(86) p(87) text(151) p(152) doc(153)
// We want to insert after position 152 (before doc closing)
const staticProposal = {
  id: 'test-proposal-001',
  title: 'Add Eiffel Tower Visit',
  description: 'Add a section about visiting the Eiffel Tower on Day 2',
  transaction_steps: [
    {
      stepType: 'replace',
      from: 152, // Position after last paragraph
      to: 152,   // Same position (insertion)
      slice: {
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Day 2 - Eiffel Tower' }]
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Morning visit to the Eiffel Tower. Book tickets in advance for skip-the-line access. Best views from the second floor. Consider sunset timing for golden hour photos.'
            }]
          }
        ],
        openStart: 0,
        openEnd: 0
      }
    }
  ],
  operation_metadata: {
    inverseSteps: [
      {
        stepType: 'replace',
        from: 152,
        to: 346, // The range that will need to be deleted to revert
        slice: {
          content: [],
          openStart: 0,
          openEnd: 0
        }
      }
    ]
  }
};

export default function TestDiffScreen() {
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const editorRef = useRef<TipTapTestEditorHandle>(null);

  const handleShowChanges = () => {
    if (!isPreviewActive && editorRef.current) {
      console.log('Applying transaction steps for preview');
      editorRef.current.applyTransactionSteps(
        staticProposal.transaction_steps,
        staticProposal.operation_metadata?.inverseSteps
      );
      setIsPreviewActive(true);
    }
  };

  const handleHideChanges = () => {
    if (isPreviewActive && editorRef.current) {
      console.log('Reverting transaction steps');
      editorRef.current.revertTransactionSteps();
      setIsPreviewActive(false);
    }
  };

  const handleEditorReady = () => {
    setEditorReady(true);
  };

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Test only available on web platform</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>TipTap Diff Preview Test</Text>
          <Text style={styles.subtitle}>Test real TipTap editor with diff extension</Text>
        </View>

        <View style={styles.proposalCard}>
          <View style={styles.proposalHeader}>
            <Text style={styles.proposalTitle}>{staticProposal.title}</Text>
            <Text style={styles.proposalDescription}>{staticProposal.description}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.previewButton,
              isPreviewActive && styles.previewButtonActive,
              !editorReady && styles.previewButtonDisabled
            ]}
            onPress={isPreviewActive ? handleHideChanges : handleShowChanges}
            disabled={!editorReady}
          >
            <Text style={styles.previewButtonText}>
              {!editorReady ? 'Loading Editor...' :
               isPreviewActive ? '✓ Hide Changes' : '👁 Show Changes in Document'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.editorContainer}>
          <Text style={styles.editorLabel}>TipTap Document Editor</Text>
          <View style={styles.editor}>
            <TipTapTestEditorSimple
              ref={editorRef}
              initialDocument={initialDocument}
              onReady={handleEditorReady}
              editable={!isPreviewActive}
            />
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How it works:</Text>
          <Text style={styles.infoText}>
            1. Uses real TipTap editor with DiffVisualization extension{'\n'}
            2. Click "Show Changes" to apply transaction steps{'\n'}
            3. Content should appear with green highlighting{'\n'}
            4. Click "Hide Changes" to revert using saved original state{'\n'}
            5. Document should be restored exactly as before
          </Text>
        </View>

        <View style={styles.debugInfo}>
          <Text style={styles.debugTitle}>Debug Info:</Text>
          <Text style={styles.debugText}>Preview Active: {isPreviewActive ? 'Yes' : 'No'}</Text>
          <Text style={styles.debugText}>Editor Ready: {editorReady ? 'Yes' : 'No'}</Text>
          <Text style={styles.debugText}>Platform: {Platform.OS}</Text>
          <Text style={styles.debugText}>
            Transaction steps: {staticProposal.transaction_steps.length}
          </Text>
          <Text style={styles.debugText}>
            Inverse steps: {staticProposal.operation_metadata.inverseSteps.length}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  proposalCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  proposalHeader: {
    marginBottom: 12,
  },
  proposalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  proposalDescription: {
    fontSize: 14,
    color: '#666',
  },
  previewButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewButtonActive: {
    backgroundColor: '#10b981',
  },
  previewButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  previewButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  editorContainer: {
    marginBottom: 20,
  },
  editorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  editor: {
    backgroundColor: 'white',
    borderRadius: 12,
    minHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#3730a3',
    lineHeight: 20,
  },
  debugInfo: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 4,
  },
  debugText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
});
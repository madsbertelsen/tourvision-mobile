import React, { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProseMirror } from '@nytimes/react-prosemirror';
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { Decoration, DecorationSet } from 'prosemirror-view';

// Create initial document
const createInitialDoc = (schema: Schema) => {
  return schema.node('doc', null, [
    schema.node('heading', { level: 1 }, [
      schema.text('Paris Weekend Trip')
    ]),
    schema.node('paragraph', null, [
      schema.text('A romantic 3-day getaway to the City of Light.')
    ]),
    schema.node('heading', { level: 2 }, [
      schema.text('Day 1 - Arrival')
    ]),
    schema.node('paragraph', null, [
      schema.text('Check into hotel near the Louvre. Evening stroll along the Seine.')
    ]),
    // Day 2 will be inserted here
    schema.node('heading', { level: 2 }, [
      schema.text('Day 3 - Departure')
    ]),
    schema.node('paragraph', null, [
      schema.text('Morning visit to a local café. Departure from Charles de Gaulle airport.')
    ])
  ]);
};

// Plugin key for diff visualization
const diffPluginKey = new PluginKey('diff');

// Create diff visualization plugin
const createDiffPlugin = () => {
  return new Plugin({
    key: diffPluginKey,
    state: {
      init() {
        return {
          decorations: DecorationSet.empty,
          originalDoc: null,
          isPreview: false,
        };
      },
      apply(tr, pluginState) {
        const meta = tr.getMeta(diffPluginKey);

        if (meta?.setPreview) {
          // Create decorations for the added content
          const decorations = meta.decorations || DecorationSet.empty;
          return {
            decorations,
            originalDoc: meta.originalDoc,
            isPreview: true,
          };
        }

        if (meta?.clearPreview) {
          return {
            decorations: DecorationSet.empty,
            originalDoc: null,
            isPreview: false,
          };
        }

        // Map decorations through the transaction
        return {
          ...pluginState,
          decorations: pluginState.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    props: {
      decorations(state) {
        const pluginState = this.getState(state);
        return pluginState?.decorations || DecorationSet.empty;
      },
    },
  });
};

// Static proposal with transaction steps
const staticProposal = {
  id: 'test-proposal-001',
  title: 'Add Day 2 to Itinerary',
  description: 'Add Eiffel Tower and Montmartre visit on Day 2',
};

export default function TestProseMirrorScreen() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const originalStateRef = useRef<EditorState | null>(null);

  const editorState = useMemo(() => {
    return EditorState.create({
      doc: createInitialDoc(basicSchema),
      schema: basicSchema,
      plugins: [createDiffPlugin()]
    });
  }, []);

  const [state, setState] = useState(editorState);

  const handleShowChanges = () => {
    if (isPreviewActive) return;

    // Save the original state
    originalStateRef.current = state;

    // Create a transform to apply the changes
    const tr = state.tr;

    // Track positions and content we need
    let insertAfterDay1 = 0;
    let nodeCount = 0;

    // Find position after Day 1 paragraph
    state.doc.descendants((node, pos) => {
      nodeCount++;
      if (nodeCount === 4) {
        // Day 1 paragraph
        insertAfterDay1 = pos + node.nodeSize;
        return false;
      }
    });

    const decorationSpecs = [];

    // Insert Day 2 content after Day 1
    const day2Heading = basicSchema.node('heading', { level: 2 }, [
      basicSchema.text('Day 2 - Eiffel Tower & Montmartre')
    ]);
    const day2Para1 = basicSchema.node('paragraph', null, [
      basicSchema.text('Morning: Eiffel Tower visit with pre-booked tickets. Lunch at Café de l\'Homme with tower views.')
    ]);
    const day2Para2 = basicSchema.node('paragraph', null, [
      basicSchema.text('Afternoon: Explore Montmartre, visit Sacré-Cœur, artist squares. Evening: Moulin Rouge show (optional).')
    ]);

    tr.insert(insertAfterDay1, [day2Heading, day2Para1, day2Para2]);
    const day2Size = day2Heading.nodeSize + day2Para1.nodeSize + day2Para2.nodeSize;

    // Mark Day 2 as addition only
    decorationSpecs.push(
      Decoration.inline(
        insertAfterDay1,
        insertAfterDay1 + day2Size,
        { class: 'diff-addition' },
        { inclusiveStart: true, inclusiveEnd: true }
      )
    );

    // Create all decorations
    const decorations = DecorationSet.create(tr.doc, decorationSpecs);

    // Set metadata for the plugin
    tr.setMeta(diffPluginKey, {
      setPreview: true,
      originalDoc: state.doc,
      decorations,
    });

    setState(state.apply(tr));
    setIsPreviewActive(true);
  };

  const handleHideChanges = () => {
    if (!isPreviewActive || !originalStateRef.current) return;

    // Restore the original state
    const tr = originalStateRef.current.tr;
    tr.setMeta(diffPluginKey, { clearPreview: true });

    setState(originalStateRef.current);
    setIsPreviewActive(false);
    originalStateRef.current = null;
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
      <View style={styles.header}>
        <Text style={styles.title}>ProseMirror Diff Preview Test</Text>
        <Text style={styles.subtitle}>Test ProseMirror with diff visualization</Text>
      </View>

      <View style={styles.proposalCard}>
        <View style={styles.proposalHeader}>
          <Text style={styles.proposalTitle}>{staticProposal.title}</Text>
          <Text style={styles.proposalDescription}>{staticProposal.description}</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.previewButton,
            isPreviewActive && styles.previewButtonActive
          ]}
          onPress={isPreviewActive ? handleHideChanges : handleShowChanges}
        >
          <Text style={styles.previewButtonText}>
            {isPreviewActive ? '✓ Hide Changes' : '👁 Show Changes in Document'}
          </Text>
        </TouchableOpacity>

        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#10b981' }]} />
            <Text style={styles.legendText}>Added</Text>
          </View>
        </View>
      </View>

      <View style={styles.editorContainer}>
        <Text style={styles.editorLabel}>ProseMirror Document Editor</Text>
        <View style={styles.editor}>
          <div ref={setMount}>
            <ProseMirror
              mount={mount}
              state={state}
              dispatchTransaction={(tr) => {
                setState((s) => s.apply(tr));
              }}
            >
              <div style={{
                padding: 16,
                minHeight: 300,
                fontSize: 16,
                lineHeight: 1.5,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }} />
            </ProseMirror>
          </div>
          {isPreviewActive && (
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: '#10b981',
              color: 'white',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 'bold',
            }}>
              PREVIEW MODE
            </div>
          )}
        </View>
      </View>

      <style>{`
        .diff-addition {
          background-color: #dcfce7;
          padding: 4px 2px;
          border-radius: 2px;
          border-left: 3px solid #10b981;
          margin-left: -5px;
          padding-left: 5px;
        }
        .ProseMirror {
          outline: none;
        }
        .ProseMirror h1 {
          font-size: 24px;
          font-weight: 600;
          margin: 0.5em 0;
        }
        .ProseMirror h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 0.5em 0;
        }
        .ProseMirror p {
          margin: 0.5em 0;
        }
      `}</style>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <Text style={styles.infoText}>
          1. Green highlights show new content additions{'\n'}
          2. Content is inserted at the appropriate position{'\n'}
          3. Document remains fully readable{'\n'}
          4. Click "Hide Changes" to see original document{'\n'}
          5. No deletions - only additions are supported
        </Text>
      </View>

      <View style={styles.debugInfo}>
        <Text style={styles.debugTitle}>Debug Info:</Text>
        <Text style={styles.debugText}>
          Preview Active: {isPreviewActive ? 'Yes' : 'No'}{'\n'}
          Document size: {state.doc.nodeSize}{'\n'}
          Content blocks: {state.doc.content.childCount}{'\n'}
          Platform: {Platform.OS}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    position: 'relative',
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
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
    marginTop: 12,
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
  },
  legendContainer: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#6b7280',
  },
});
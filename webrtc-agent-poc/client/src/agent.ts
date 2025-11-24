/**
 * Agent LLM Functionality
 *
 * This module contains the AI agent logic that will be bundled into the agent build.
 * In the public build, this module is not included.
 */

import * as Y from 'yjs';
import { yDocToProsemirrorJSON } from 'y-prosemirror';

// Helper function to recursively extract text from ProseMirror JSON
function extractTextFromJSON(node: any): string {
  if (!node) return '';

  // If it's a text node, return its text
  if (node.type === 'text') {
    return node.text || '';
  }

  // If it has content, recursively process children
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromJSON).join('');
  }

  return '';
}

export function initializeAgent(yXmlFragment: Y.XmlFragment, ydoc: Y.Doc, documentId: string) {
  console.log('[Agent] Initializing agent with Y.js document observation');
  console.log(`[Agent] Document ID: ${documentId}`);

  let debounceTimer: number | null = null;
  let lastText = '';

  // Observe Y.js document changes directly
  yXmlFragment.observeDeep((events, transaction) => {
    // Skip local changes (agent's own modifications)
    if (transaction.local) {
      console.log('[Agent] Skipping local change');
      return;
    }

    console.log('[Agent] Remote document change detected');

    // Convert Y.js document to ProseMirror JSON
    try {
      const json = yDocToProsemirrorJSON(ydoc);
      const text = extractTextFromJSON(json);

      // Only process if text actually changed
      if (text === lastText) {
        return;
      }

      lastText = text;

      // Check for punctuation in the text
      const hasPunctuation = text.includes('.') || text.includes('?');

      if (hasPunctuation) {
        // Determine which punctuation was added
        const character = text.includes('?') ? '?' : '.';

        console.log(`[Agent] 🔴 Punctuation "${character}" detected in document`);

        // Clear existing debounce timer
        if (debounceTimer !== null) {
          console.log('[Agent] Clearing previous debounce timer');
          clearTimeout(debounceTimer);
        }

        // Set new timer (1 second delay, same as frontend-prosemirror)
        debounceTimer = window.setTimeout(() => {
          console.log('[Agent] ✅ Debounce complete (1s), triggering LLM processing');

          // Show alert as proof of concept
          alert(`🤖 LLM Triggered!\n\nCharacter: ${character}\nTime: ${new Date().toLocaleTimeString()}\nDocument: ${documentId}\nText length: ${text.length} chars`);

          // TODO: Replace alert with actual LLM processing
          // processDocumentWithLLM();
        }, 1000); // 1 second debounce
      }
    } catch (error) {
      console.error('[Agent] Error processing document change:', error);
    }
  });

  // Mark that agent is enabled
  (window as any).AGENT_ENABLED = true;

  console.log('[Agent] Agent initialized and observing document changes');
  console.log('[Agent] Waiting for punctuation (. or ?) to trigger LLM...');
}

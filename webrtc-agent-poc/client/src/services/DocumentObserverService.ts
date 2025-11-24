/**
 * DocumentObserverService - Y.js document observation with pause detection
 *
 * Observes Y.js document changes and triggers callbacks after a pause
 * in typing activity (2-second delay).
 */

import * as Y from 'yjs';
import { yDocToProsemirrorJSON } from 'y-prosemirror';

export interface DocumentObserverCallbacks {
  onPauseDetected?: (text: string) => void;
  onTextChanged?: (text: string) => void;
}

/**
 * Helper function to recursively extract text from ProseMirror JSON
 */
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

export class DocumentObserverService {
  private yXmlFragment: Y.XmlFragment;
  private ydoc: Y.Doc;
  private callbacks: DocumentObserverCallbacks;
  private debounceTimer: number | null = null;
  private lastText: string = '';

  constructor(
    yXmlFragment: Y.XmlFragment,
    ydoc: Y.Doc,
    callbacks: DocumentObserverCallbacks = {}
  ) {
    this.yXmlFragment = yXmlFragment;
    this.ydoc = ydoc;
    this.callbacks = callbacks;

    this.startObserving();
  }

  /**
   * Start observing Y.js document changes
   */
  private startObserving(): void {
    console.log('[DocumentObserverService] Starting Y.js document observation');

    this.yXmlFragment.observeDeep((events, transaction) => {
      // Skip local changes (agent's own modifications)
      if (transaction.local) {
        console.log('[DocumentObserverService] Skipping local change');
        return;
      }

      console.log('[DocumentObserverService] Remote document change detected');

      try {
        // Convert Y.js document to ProseMirror JSON
        const json = yDocToProsemirrorJSON(this.ydoc);
        const text = extractTextFromJSON(json);

        // Only process if text actually changed
        if (text === this.lastText) {
          return;
        }

        this.lastText = text;

        // Trigger text changed callback
        if (this.callbacks.onTextChanged) {
          this.callbacks.onTextChanged(text);
        }

        console.log('[DocumentObserverService] 🔴 Text change detected, starting pause timer...');

        // Clear existing timer (reset on each change)
        if (this.debounceTimer !== null) {
          console.log('[DocumentObserverService] Resetting pause timer');
          clearTimeout(this.debounceTimer);
        }

        // Set new timer (2 second pause detection)
        this.debounceTimer = window.setTimeout(() => {
          console.log('[DocumentObserverService] ✅ Pause detected (2s of inactivity)');

          // Trigger pause detected callback
          if (this.callbacks.onPauseDetected) {
            this.callbacks.onPauseDetected(text);
          }
        }, 2000); // 2 second pause detection
      } catch (error) {
        console.error('[DocumentObserverService] Error processing document change:', error);
      }
    });

    console.log('[DocumentObserverService] Document observation started');
  }

  /**
   * Stop observing (cleanup)
   */
  destroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    console.log('[DocumentObserverService] Service destroyed');
  }
}

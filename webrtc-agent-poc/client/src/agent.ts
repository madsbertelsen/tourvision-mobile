/**
 * Agent LLM Functionality - Service-based Implementation
 *
 * This module contains the AI agent logic that uses modular services
 * with callback pattern for geo-marking functionality.
 */

import * as Y from 'yjs';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';

// Services
import { GeocodingService } from './services/GeocodingService';
import { GeoMarkingService } from './services/GeoMarkingService';
import { DocumentObserverService } from './services/DocumentObserverService';

export function initializeAgent(
  yXmlFragment: Y.XmlFragment,
  ydoc: Y.Doc,
  documentId: string,
  editorView: EditorView,
  schema: Schema
) {
  console.log('[Agent] Initializing agent with modular services');
  console.log(`[Agent] Document ID: ${documentId}`);

  // Initialize services
  const geocodingService = new GeocodingService();
  const geoMarkingService = new GeoMarkingService(
    editorView,
    schema,
    geocodingService,
    {
      onLocationExtracted: (locations) => {
        console.log(`[Agent] 📍 Extracted ${locations.length} locations:`, locations);
      },
      onGeoMarkCreated: (geoId, locationName) => {
        console.log(`[Agent] ✅ Created geo-mark: ${locationName} (${geoId})`);
      },
      onError: (error) => {
        console.error('[Agent] ❌ Error during geo-marking:', error);
      }
    }
  );

  // Initialize document observer with callbacks
  const documentObserver = new DocumentObserverService(yXmlFragment, ydoc, {
    onPauseDetected: async (text) => {
      console.log(`[Agent] 🤖 Pause detected (2s inactivity), starting LLM processing...`);
      console.log(`[Agent] Document text length: ${text.length} characters`);

      try {
        // Process document with geo-marking service
        await geoMarkingService.processDocument();
        console.log('[Agent] ✅ LLM processing complete');
      } catch (error) {
        console.error('[Agent] ❌ Error during LLM processing:', error);
      }
    },
    onTextChanged: (text) => {
      // Optional: Log text changes for debugging
      // console.log(`[Agent] Text changed, length: ${text.length}`);
    }
  });

  // Mark that agent is enabled
  (window as any).AGENT_ENABLED = true;

  console.log('[Agent] ✅ Agent initialized with services');
  console.log('[Agent] Waiting for 2-second pause after text changes to trigger LLM processing...');
}

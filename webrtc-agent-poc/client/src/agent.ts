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
import { getAgentDataChannelService } from './services/AgentDataChannelService';
import { clarifyIntent } from './services/IntentClarificationService';
import { generatePlan } from './services/OllamaAgentService';
import type { ClarifiedIntent, AgentCommandMessage } from './types/agent';

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

  // Set up WebRTC data channel message handler
  const agentService = getAgentDataChannelService();
  if (agentService) {
    agentService.setMessageHandler(async (message: AgentCommandMessage) => {
      if (message.type === 'analyze-transcript') {
        console.log('[Agent] Received analyze-transcript request:', message.requestId);
        console.log('[Agent] Transcript:', message.transcript);

        try {
          // Phase 1: Intent Clarification
          console.log('[Agent] Phase 1: Starting intent clarification...');
          const intentResult = await clarifyIntent(
            message.transcript,
            message.documentContext,
            editorView
          );

          // Handle ambiguity (not yet implemented - return error for now)
          if (intentResult.type === 'ambiguous') {
            console.warn('[Agent] Intent ambiguous:', intentResult.question);
            agentService.sendAgentError(
              message.requestId,
              'Cannot clarify intent - ambiguous input detected',
              {
                question: intentResult.question.question,
                options: intentResult.question.options
              }
            );
            return;
          }

          const intent: ClarifiedIntent = intentResult.intent;
          console.log('[Agent] Intent clarified:', intent.intent);
          console.log('[Agent] Confidence:', intent.confidence);

          // Phase 2: Plan Generation (includes geocoding)
          console.log('[Agent] Phase 2: Generating plan with geocoding...');
          const plan = await generatePlan(intent, []);

          if (!plan) {
            throw new Error('Failed to generate plan - generatePlan returned null');
          }

          console.log('[Agent] Plan generated successfully');
          console.log('[Agent] Tools:', plan.tools.length);

          // Send plan back to user tab
          agentService.sendPlanReady(message.requestId, plan);
          console.log('[Agent] Sent plan-ready to user tab:', message.requestId);

        } catch (error) {
          console.error('[Agent] Analysis failed:', error);
          agentService.sendAgentError(
            message.requestId,
            error instanceof Error ? error.message : 'Unknown error occurred',
            error
          );
        }
      }
    });

    console.log('[Agent] ✅ WebRTC data channel message handler set up');
  } else {
    console.warn('[Agent] AgentDataChannelService not available - commands via data channel disabled');
  }

  // Mark that agent is enabled
  (window as any).AGENT_ENABLED = true;

  console.log('[Agent] ✅ Agent initialized with services');
  console.log('[Agent] Waiting for 2-second pause after text changes to trigger LLM processing...');
  console.log('[Agent] Listening for analyze-transcript commands via WebRTC data channel...');
}

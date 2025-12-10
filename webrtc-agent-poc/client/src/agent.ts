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
import { parsePlanToToolCalls } from './services/PlanParser';
import { executePlan } from './services/ToolExecutor';
import type { ClarifiedIntent, AgentCommandMessage } from './types/agent';

export function initializeAgent(
  yXmlFragment: Y.XmlFragment,
  ydoc: Y.Doc,
  documentId: string,
  editorView: EditorView,
  schema: Schema,
  notifyGeoMarkChange: () => void
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
          console.log('[Agent] Plan received:', intent.intent);
          console.log('[Agent] Confidence:', intent.confidence);

          // Phase 2: Parse plan and geocode locations
          console.log('[Agent] Phase 2: Parsing plan and geocoding locations...');
          const plan = await parsePlanToToolCalls(intent);

          if (!plan) {
            throw new Error('Failed to parse plan - parsePlanToToolCalls returned null');
          }

          console.log('[Agent] Plan parsed successfully');
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

  // Add test helper function to window for debugging
  (window as any).testAgentCommand = async (transcript: string) => {
    console.log('[TestAgent] Testing command:', transcript);

    try {
      // Phase 1: Intent Clarification
      console.log('[TestAgent] Phase 1: Intent clarification...');
      const intentResult = await clarifyIntent(transcript, '', editorView);

      if (intentResult.type === 'ambiguous') {
        console.warn('[TestAgent] Intent ambiguous:', intentResult.question);
        return { error: 'Ambiguous intent', question: intentResult.question };
      }

      const intent = intentResult.intent;
      console.log('[TestAgent] Plan:', intent.intent);
      console.log('[TestAgent] Confidence:', intent.confidence);
      console.log('[TestAgent] Reasoning:', intent.reasoning);

      // Phase 2: Parse plan and geocode
      console.log('[TestAgent] Phase 2: Parsing plan and geocoding...');
      const plan = await parsePlanToToolCalls(intent);

      if (!plan) {
        throw new Error('parsePlanToToolCalls returned null');
      }

      console.log('[TestAgent] Plan parsed:');
      console.log('  - Status:', plan.status);
      console.log('  - Tools:', plan.tools.length);
      console.log('  - Tools details:', plan.tools);

      // Phase 3: Execute the plan
      console.log('[TestAgent] Phase 3: Executing plan...');
      const executionResults = await executePlan(
        plan,
        {
          editorView,
          schema,
          detectedLocations: [],
          yXmlFragment,
          ydoc,
          notifyGeoMarkChange
        }
      );

      console.log('[TestAgent] Plan executed, results:', executionResults);

      return {
        intent,
        plan,
        executionResults
      };
    } catch (error) {
      console.error('[TestAgent] Error:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  console.log('[Agent] ✅ Agent initialized with services');
  console.log('[Agent] 🧪 Test function available: testAgentCommand("your command here")');
  console.log('[Agent] Waiting for 2-second pause after text changes to trigger LLM processing...');
  console.log('[Agent] Listening for analyze-transcript commands via WebRTC data channel...');
}

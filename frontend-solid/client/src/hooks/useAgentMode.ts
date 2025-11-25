import { createSignal, createEffect, onCleanup } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { DOMSerializer } from 'prosemirror-model';
import { getCollaborationStore } from '../stores/collaboration';
import { getLocationsStore } from '../stores/locations';
import { getEditorStore } from '../stores/editor';
import { extractLocations, checkOllamaConnection } from '../lib/ollama';
import { geocodeLocation } from '../lib/geocoding';

// Agent colors - distinct from regular user colors
const AGENT_COLORS = ['#10B981', '#8B5CF6', '#F59E0B'];

interface AgentState {
  isAgent: boolean;
  agentId: string | null;
  status: 'initializing' | 'connected' | 'processing' | 'idle' | 'error';
  lastActivity: number;
  processedChanges: number;
  ollamaConnected: boolean;
  lastExtraction: {
    locations: Array<{ name: string; context: string }>;
  } | null;
}

export function useAgentMode() {
  const [searchParams] = useSearchParams();
  const collaboration = getCollaborationStore();
  const locationsStore = getLocationsStore();
  const editorStore = getEditorStore();

  const isAgent = () => searchParams.agent === 'true';
  const agentId = () => searchParams.agentId as string | null;

  const [state, setState] = createSignal<AgentState>({
    isAgent: isAgent(),
    agentId: agentId(),
    status: 'initializing',
    lastActivity: Date.now(),
    processedChanges: 0,
    ollamaConnected: false,
    lastExtraction: null
  });

  // Notify orchestrator of status changes
  const notifyOrchestrator = (status: AgentState['status']) => {
    if (window.opener) {
      window.opener.postMessage({
        type: 'agent-status',
        agentId: agentId(),
        status
      }, '*');
    }
  };

  // Initialize agent mode
  createEffect(() => {
    if (!isAgent()) return;

    console.log('[Agent] Initializing agent mode:', agentId());

    // Set window title to indicate agent
    document.title = `Agent: ${agentId()}`;

    // Check Ollama connection
    checkOllamaConnection().then(connected => {
      setState(s => ({ ...s, ollamaConnected: connected }));
      if (connected) {
        console.log('[Agent] Ollama connected');
      } else {
        console.warn('[Agent] Ollama not available - LLM features disabled');
      }
    });

    // Update awareness to show as agent
    const provider = collaboration.state().provider;
    if (provider) {
      const color = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)];
      provider.awareness.setLocalState({
        user: {
          name: `Agent ${agentId()?.slice(-5) || 'Unknown'}`,
          color,
          isAgent: true
        }
      });

      setState(s => ({ ...s, status: 'connected' }));
      notifyOrchestrator('connected');

      console.log('[Agent] Connected and awareness set');
    }
  });

  // Listen to document changes
  createEffect(() => {
    if (!isAgent()) return;

    const yDoc = collaboration.state().yDoc;
    if (!yDoc) return;

    const yXmlFragment = yDoc.getXmlFragment('prosemirror');

    // Track paragraph count to detect new paragraphs
    let lastParagraphCount = countParagraphs(yXmlFragment);

    // Debounce timer for processing changes
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleChange = (events: any[], transaction: any) => {
      // Skip changes from self
      if (transaction.local) return;

      console.log('[Agent] Document changed, events:', events.length);
      setState(s => ({ ...s, lastActivity: Date.now() }));

      // Check for new paragraphs (user pressed Enter)
      const currentParagraphCount = countParagraphs(yXmlFragment);
      if (currentParagraphCount > lastParagraphCount) {
        const newParagraphs = currentParagraphCount - lastParagraphCount;
        console.log('[Agent] New paragraph detected!', {
          previous: lastParagraphCount,
          current: currentParagraphCount,
          new: newParagraphs
        });

        // Trigger LLM processing when new paragraph is added
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          processDocumentChanges();
        }, 1000);
      }
      lastParagraphCount = currentParagraphCount;
    };

    yXmlFragment.observeDeep(handleChange);

    onCleanup(() => {
      yXmlFragment.unobserveDeep(handleChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  });

  // Count paragraphs in the Y.js document
  function countParagraphs(yXmlFragment: any): number {
    let count = 0;
    const iterate = (element: any) => {
      if (element.nodeName === 'paragraph') {
        count++;
      }
      // Recursively check children
      if (element.toArray) {
        for (const child of element.toArray()) {
          iterate(child);
        }
      }
    };
    iterate(yXmlFragment);
    return count;
  }

  // Process document changes with Ollama LLM
  const processDocumentChanges = async () => {
    // Check if Ollama is available
    if (!state().ollamaConnected) {
      console.log('[Agent] Ollama not connected, skipping LLM processing');
      return;
    }

    setState(s => ({ ...s, status: 'processing' }));
    notifyOrchestrator('processing');

    try {
      const view = editorStore.editorView();
      if (!view) {
        console.log('[Agent] No editor view available');
        setState(s => ({ ...s, status: 'idle' }));
        return;
      }

      // Get document content as HTML
      const doc = view.state.doc;
      const fragment = DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content);
      const div = document.createElement('div');
      div.appendChild(fragment);
      const htmlContent = div.innerHTML;

      // Skip if text is too short
      if (doc.textContent.length < 10) {
        console.log('[Agent] Text too short, skipping');
        setState(s => ({ ...s, status: 'idle' }));
        return;
      }

      console.log('[Agent] Processing document with Ollama:', {
        htmlLength: htmlContent.length,
        textLength: doc.textContent.length,
        existingLocations: locationsStore.state.locations.length
      });

      // Call Ollama to extract locations
      const result = await extractLocations(htmlContent);

      console.log('[Agent] Ollama extraction result:', result);

      // Update state with extraction results
      setState(s => ({
        ...s,
        processedChanges: s.processedChanges + 1,
        lastExtraction: result,
        status: 'idle'
      }));
      notifyOrchestrator('idle');

      // Process found locations - geocode and apply geo-marks
      if (result.locations.length > 0) {
        console.log('[Agent] Found locations:', result.locations.map(l => l.name).join(', '));

        // Process each location
        for (const location of result.locations) {
          try {
            // Geocode the location to get coordinates
            console.log(`[Agent] Geocoding "${location.name}"...`);
            const geocoded = await geocodeLocation(location.name);

            if (geocoded) {
              console.log(`[Agent] Geocoded "${location.name}":`, {
                lat: geocoded.lat,
                lng: geocoded.lng,
                displayName: geocoded.displayName
              });

              // Apply geo-mark to the text in the document
              const geoId = editorStore.applyGeoMarkToText(
                location.name,
                geocoded.lat,
                geocoded.lng,
                geocoded.displayName
              );

              if (geoId) {
                console.log(`[Agent] Applied geo-mark to "${location.name}":`, geoId);
              } else {
                console.log(`[Agent] Could not apply geo-mark to "${location.name}" (text not found or already marked)`);
              }
            } else {
              console.log(`[Agent] Could not geocode "${location.name}"`);
            }

            // Small delay between geocoding requests to be nice to Nominatim
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err) {
            console.error(`[Agent] Error processing location "${location.name}":`, err);
          }
        }

        // Ensure a map block exists if we added any geo-marks
        const mapInserted = editorStore.ensureMapBlock();
        if (mapInserted) {
          console.log('[Agent] Inserted map block at end of document');
        }
      }

    } catch (error) {
      console.error('[Agent] Error processing changes:', error);
      setState(s => ({ ...s, status: 'error' }));
      notifyOrchestrator('error');
    }
  };

  // Cleanup on window close
  createEffect(() => {
    if (!isAgent()) return;

    const handleBeforeUnload = () => {
      notifyOrchestrator('closed');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    onCleanup(() => window.removeEventListener('beforeunload', handleBeforeUnload));
  });

  return {
    isAgent,
    agentId,
    state
  };
}

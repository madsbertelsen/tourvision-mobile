import { createSignal, createEffect, onCleanup } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { getCollaborationStore } from '../stores/collaboration';
import { getLocationsStore } from '../stores/locations';
import { getEditorStore } from '../stores/editor';

// Agent colors - distinct from regular user colors
const AGENT_COLORS = ['#10B981', '#8B5CF6', '#F59E0B'];

interface AgentState {
  isAgent: boolean;
  agentId: string | null;
  status: 'initializing' | 'connected' | 'processing' | 'idle' | 'error';
  lastActivity: number;
  processedChanges: number;
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
    processedChanges: 0
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

    // Debounce timer for processing changes
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleChange = (events: any[], transaction: any) => {
      // Skip changes from self
      if (transaction.local) return;

      console.log('[Agent] Document changed, events:', events.length);
      setState(s => ({ ...s, lastActivity: Date.now() }));

      // Debounce processing
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processDocumentChanges();
      }, 1000);
    };

    yXmlFragment.observeDeep(handleChange);

    onCleanup(() => {
      yXmlFragment.unobserveDeep(handleChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  });

  // Process document changes (placeholder for LLM integration)
  const processDocumentChanges = async () => {
    setState(s => ({ ...s, status: 'processing' }));
    notifyOrchestrator('processing');

    try {
      const view = editorStore.editorView();
      if (!view) {
        console.log('[Agent] No editor view available');
        return;
      }

      // Get document content
      const doc = view.state.doc;
      const textContent = doc.textContent;

      console.log('[Agent] Processing document:', {
        length: textContent.length,
        locations: locationsStore.state.locations.length
      });

      // TODO: Call LLM here when conditions are met
      // For now, just log the change
      setState(s => ({
        ...s,
        processedChanges: s.processedChanges + 1,
        status: 'idle'
      }));
      notifyOrchestrator('idle');

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

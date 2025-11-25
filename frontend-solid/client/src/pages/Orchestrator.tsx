import { type Component, createSignal, For, onCleanup } from 'solid-js';
import styles from './Orchestrator.module.scss';

interface AgentTab {
  id: string;
  docId: string;
  window: Window | null;
  status: 'opening' | 'connected' | 'closed';
  createdAt: number;
}

export const Orchestrator: Component = () => {
  const [agentTabs, setAgentTabs] = createSignal<AgentTab[]>([]);

  // Listen for messages from agent tabs
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'agent-status') {
      const { agentId, status } = event.data;
      setAgentTabs(tabs =>
        tabs.map(tab =>
          tab.id === agentId ? { ...tab, status } : tab
        )
      );
    }
  };

  window.addEventListener('message', handleMessage);
  onCleanup(() => window.removeEventListener('message', handleMessage));

  // Spawn a new agent tab for a document
  const spawnAgent = (docId: string) => {
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const agentUrl = `/${docId}?agent=true&agentId=${agentId}`;

    console.log('[Orchestrator] Spawning agent:', agentId, 'for document:', docId);

    const agentWindow = window.open(agentUrl, agentId, 'width=800,height=600');

    const newTab: AgentTab = {
      id: agentId,
      docId,
      window: agentWindow,
      status: 'opening',
      createdAt: Date.now()
    };

    setAgentTabs(tabs => [...tabs, newTab]);
  };

  // Close an agent tab
  const closeAgent = (agentId: string) => {
    const tab = agentTabs().find(t => t.id === agentId);
    if (tab?.window && !tab.window.closed) {
      tab.window.close();
    }
    setAgentTabs(tabs => tabs.filter(t => t.id !== agentId));
  };

  // Close all agent tabs
  const closeAllAgents = () => {
    agentTabs().forEach(tab => {
      if (tab.window && !tab.window.closed) {
        tab.window.close();
      }
    });
    setAgentTabs([]);
  };

  // Handle spawn form submission
  const [docIdInput, setDocIdInput] = createSignal('');

  const handleSpawn = (e: Event) => {
    e.preventDefault();
    const docId = docIdInput().trim();
    if (docId) {
      spawnAgent(docId);
      setDocIdInput('');
    }
  };

  return (
    <div class={styles.container}>
      <h1>Agent Orchestrator</h1>
      <p class={styles.description}>
        Manage AI agents that connect to documents via WebRTC.
        Each agent listens to document changes and can run LLM analysis.
      </p>

      <form class={styles.spawnForm} onSubmit={handleSpawn}>
        <input
          type="text"
          placeholder="Enter document ID"
          value={docIdInput()}
          onInput={(e) => setDocIdInput(e.currentTarget.value)}
          class={styles.input}
        />
        <button type="submit" class={styles.spawnBtn}>
          Spawn Agent
        </button>
      </form>

      <div class={styles.agentList}>
        <div class={styles.listHeader}>
          <h2>Active Agents ({agentTabs().length})</h2>
          {agentTabs().length > 0 && (
            <button class={styles.closeAllBtn} onClick={closeAllAgents}>
              Close All
            </button>
          )}
        </div>

        {agentTabs().length === 0 ? (
          <p class={styles.emptyState}>No agents running</p>
        ) : (
          <For each={agentTabs()}>
            {(tab) => (
              <div class={styles.agentCard}>
                <div class={styles.agentInfo}>
                  <span class={styles.agentId}>{tab.id}</span>
                  <span class={styles.docId}>Document: {tab.docId}</span>
                  <span class={`${styles.status} ${styles[tab.status]}`}>
                    {tab.status}
                  </span>
                </div>
                <button
                  class={styles.closeBtn}
                  onClick={() => closeAgent(tab.id)}
                >
                  Close
                </button>
              </div>
            )}
          </For>
        )}
      </div>
    </div>
  );
};

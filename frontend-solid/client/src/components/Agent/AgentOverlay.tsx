import { type Component } from 'solid-js';
import styles from './AgentOverlay.module.scss';

interface AgentState {
  isAgent: boolean;
  agentId: string | null;
  status: 'initializing' | 'connected' | 'processing' | 'idle' | 'error';
  lastActivity: number;
  processedChanges: number;
}

interface AgentOverlayProps {
  agentId: string | null;
  state: AgentState;
}

export const AgentOverlay: Component<AgentOverlayProps> = (props) => {
  const statusLabels: Record<AgentState['status'], string> = {
    initializing: 'Initializing...',
    connected: 'Connected',
    processing: 'Processing...',
    idle: 'Idle',
    error: 'Error'
  };

  return (
    <div class={styles.overlay}>
      <div class={styles.badge}>
        <div class={styles.icon}>🤖</div>
        <div class={styles.info}>
          <span class={styles.label}>Agent Mode</span>
          <span class={styles.id}>{props.agentId?.slice(-8) || 'Unknown'}</span>
        </div>
        <div class={`${styles.status} ${styles[props.state.status]}`}>
          {statusLabels[props.state.status]}
        </div>
      </div>
      <div class={styles.stats}>
        <span>Changes processed: {props.state.processedChanges}</span>
      </div>
    </div>
  );
};

import { type Component, Show } from 'solid-js';
import { getDocumentStore } from '../../stores/document';
import { getLocationsStore } from '../../stores/locations';
import { getCollaborationStore } from '../../stores/collaboration';
import { PresenceAvatars } from '../Presence/PresenceAvatars';
import styles from './ui.module.scss';

interface HeaderProps {
  onNewDocument: () => void;
}

export const Header: Component<HeaderProps> = (props) => {
  const documentStore = getDocumentStore();
  const locationsStore = getLocationsStore();
  const collaboration = getCollaborationStore();

  const handleToggleProvider = () => {
    const currentDocId = documentStore.currentDocId();
    if (!currentDocId) return;

    const currentType = collaboration.state().providerType;
    const newType = currentType === 'websocket' ? 'webrtc' : 'websocket';
    collaboration.switchProvider(currentDocId, newType);
  };

  const getProviderIcon = () => {
    return collaboration.state().providerType === 'websocket' ? '🔌' : '📡';
  };

  const getProviderLabel = () => {
    return collaboration.state().providerType === 'websocket' ? 'WebSocket' : 'WebRTC';
  };

  return (
    <header class={styles.header}>
      <div class={styles.headerLeft}>
        <h1 class={styles.title}>TourVision Editor</h1>
        <button class={styles.newDocBtn} onClick={props.onNewDocument}>
          + New Document
        </button>
        <Show when={documentStore.currentDocId()}>
          <span class={styles.docId}>
            Current: <strong>{documentStore.currentDocId()}</strong>
          </span>
        </Show>
        <Show when={collaboration.state().connected}>
          <span class={styles.connectionStatus} classList={{ [styles.connected]: collaboration.state().synced }}>
            {collaboration.state().synced ? '● Synced' : '○ Connecting...'}
          </span>
        </Show>
        <Show when={documentStore.currentDocId()}>
          <button
            class={styles.providerToggle}
            onClick={handleToggleProvider}
            title={`Switch to ${collaboration.state().providerType === 'websocket' ? 'WebRTC' : 'WebSocket'}`}
          >
            {getProviderIcon()} {getProviderLabel()}
          </button>
        </Show>
      </div>
      <div class={styles.headerRight}>
        <span class={styles.locationCount}>
          Locations: <strong>{locationsStore.state.locations.length}</strong>
        </span>
        <Show when={documentStore.currentDocId()}>
          <PresenceAvatars />
        </Show>
      </div>
    </header>
  );
};

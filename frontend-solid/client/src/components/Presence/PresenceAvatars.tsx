import { type Component, createSignal, createEffect, onCleanup, For } from 'solid-js';
import { getCollaborationStore } from '../../stores/collaboration';
import styles from './presence.module.scss';

interface User {
  name: string;
  color: string;
}

export const PresenceAvatars: Component = () => {
  const collaboration = getCollaborationStore();
  const [users, setUsers] = createSignal<User[]>([]);

  createEffect(() => {
    const provider = collaboration.state().provider;
    if (!provider) return;

    const updatePresence = () => {
      const states = Array.from(provider.awareness.getStates().values());
      const connectedUsers = states
        .filter((state: any) => state.user)
        .map((state: any) => state.user as User);

      setUsers(connectedUsers);
    };

    // Listen for awareness changes
    provider.awareness.on('change', updatePresence);

    // Initial update
    updatePresence();

    onCleanup(() => {
      provider.awareness.off('change', updatePresence);
    });
  });

  return (
    <div class={styles.presenceContainer}>
      <span class={styles.label}>Editing:</span>
      <div class={styles.avatars}>
        {users().length === 0 ? (
          <span class={styles.noUsers}>No one else here</span>
        ) : (
          <For each={users()}>
            {(user) => (
              <div class={styles.avatar} style={{ 'border-color': user.color }}>
                <div class={styles.dot} style={{ 'background-color': user.color }} />
                <span class={styles.name}>{user.name}</span>
              </div>
            )}
          </For>
        )}
      </div>
    </div>
  );
};

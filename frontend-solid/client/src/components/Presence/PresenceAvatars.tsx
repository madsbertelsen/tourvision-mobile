import { type Component, createSignal, createEffect, onCleanup, For, Show } from 'solid-js';
import { getCollaborationStore } from '../../stores/collaboration';
import { getFollowModeStore } from '../../stores/followMode';
import { getFullscreenMapStore } from '../../stores/fullscreenMap';
import styles from './presence.module.scss';

interface User {
  id: string;
  name: string;
  color: string;
  isViewingFullscreen: boolean;
}

export const PresenceAvatars: Component = () => {
  const collaboration = getCollaborationStore();
  const followModeStore = getFollowModeStore();
  const fullscreenMapStore = getFullscreenMapStore();
  const [users, setUsers] = createSignal<User[]>([]);

  createEffect(() => {
    const provider = collaboration.state().provider;
    if (!provider) return;

    const updatePresence = () => {
      const localClientId = provider.awareness.clientID;
      const states = Array.from(provider.awareness.getStates().entries());
      const connectedUsers = states
        .filter(([clientId, state]: [number, any]) =>
          state.user && clientId !== localClientId
        )
        .map(([clientId, state]: [number, any]) => ({
          id: String(clientId),
          name: state.user.name,
          color: state.user.color,
          isViewingFullscreen: !!state.fullscreenMap?.isViewing
        } as User));

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

  const handleAvatarClick = (user: User) => {
    // Only allow following if we're in fullscreen mode and they're viewing fullscreen too
    if (fullscreenMapStore.state().isVisible && user.isViewingFullscreen) {
      followModeStore.toggleFollowing(user.id, user.name);
    }
  };

  return (
    <div class={styles.presenceContainer}>
      <span class={styles.label}>Editing:</span>
      <div class={styles.avatars}>
        {users().length === 0 ? (
          <span class={styles.noUsers}>No one else here</span>
        ) : (
          <For each={users()}>
            {(user) => {
              const isClickable = () =>
                fullscreenMapStore.state().isVisible && user.isViewingFullscreen;
              const isBeingFollowed = () =>
                followModeStore.state().followingUserId === user.id;

              return (
                <div
                  class={`${styles.avatar} ${isClickable() ? styles.clickable : ''} ${isBeingFollowed() ? styles.following : ''}`}
                  style={{ 'border-color': user.color }}
                  onClick={() => handleAvatarClick(user)}
                  title={isClickable() ? `Click to ${isBeingFollowed() ? 'stop following' : 'follow'} ${user.name}` : user.name}
                >
                  <div class={styles.dot} style={{ 'background-color': user.color }} />
                  <span class={styles.name}>{user.name}</span>
                  <Show when={isBeingFollowed()}>
                    <span class={styles.followingBadge}>Following</span>
                  </Show>
                </div>
              );
            }}
          </For>
        )}
      </div>
    </div>
  );
};

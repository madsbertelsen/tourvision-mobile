import { createSignal } from 'solid-js';
import { getCollaborationStore } from './collaboration';

interface FollowModeState {
  isFollowing: boolean;
  followingUserId: string | null;
  followingUserName: string | null;
}

// Create follow mode store
function createFollowModeStore() {
  const [state, setState] = createSignal<FollowModeState>({
    isFollowing: false,
    followingUserId: null,
    followingUserName: null
  });

  // Broadcast following state to awareness
  function updateAwareness(followingUserId: string | null) {
    const collaboration = getCollaborationStore();
    const provider = collaboration.state().provider;
    if (provider) {
      provider.awareness.setLocalStateField('following', followingUserId ? {
        userId: followingUserId,
        timestamp: Date.now()
      } : null);
      console.log('[FollowMode] Awareness updated:', followingUserId);
    }
  }

  function startFollowing(userId: string, userName: string) {
    console.log('[FollowMode] Starting to follow:', userName, userId);
    setState({ isFollowing: true, followingUserId: userId, followingUserName: userName });
    updateAwareness(userId);
  }

  function stopFollowing() {
    console.log('[FollowMode] Stopped following');
    setState({ isFollowing: false, followingUserId: null, followingUserName: null });
    updateAwareness(null);
  }

  function toggleFollowing(userId: string, userName: string) {
    if (state().followingUserId === userId) {
      stopFollowing();
    } else {
      startFollowing(userId, userName);
    }
  }

  return {
    state,
    startFollowing,
    stopFollowing,
    toggleFollowing
  };
}

// Singleton instance
let followModeStore: ReturnType<typeof createFollowModeStore> | null = null;

export function getFollowModeStore() {
  if (!followModeStore) {
    followModeStore = createFollowModeStore();
  }
  return followModeStore;
}

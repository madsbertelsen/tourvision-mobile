import { createSignal } from 'solid-js';
import { getCollaborationStore } from './collaboration';

interface FollowModeState {
  isFollowing: boolean;
  followingUserId: string | null;
  followingUserName: string | null;
}

export interface Invitation {
  fromUserId: string;
  fromUserName: string;
  fromUserColor: string;
  mapNodePosition: number;
  timestamp: number;
}

// Create follow mode store
function createFollowModeStore() {
  const [state, setState] = createSignal<FollowModeState>({
    isFollowing: false,
    followingUserId: null,
    followingUserName: null
  });

  // Track pending invitation from another user
  const [pendingInvitation, setPendingInvitation] = createSignal<Invitation | null>(null);

  // Track if we're currently inviting others
  const [isInviting, setIsInviting] = createSignal(false);

  // Track handled invitations by their timestamp to avoid re-showing
  const handledInvitations = new Set<string>();

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

  // Send invitation to all users viewing the same map
  function sendInvitation(mapNodePosition: number) {
    const collaboration = getCollaborationStore();
    const provider = collaboration.state().provider;
    if (!provider) return;

    const localState = provider.awareness.getLocalState();
    const userName = localState?.user?.name || 'Anonymous';
    const userColor = localState?.user?.color || '#3B82F6';
    const userId = String(provider.awareness.clientID);

    provider.awareness.setLocalStateField('invitation', {
      fromUserId: userId,
      fromUserName: userName,
      fromUserColor: userColor,
      mapNodePosition,
      timestamp: Date.now()
    });

    setIsInviting(true);
    console.log('[FollowMode] Invitation sent');

    // Auto-cancel invitation after 30 seconds
    setTimeout(() => {
      cancelInvitation();
    }, 30000);
  }

  // Cancel outgoing invitation
  function cancelInvitation() {
    const collaboration = getCollaborationStore();
    const provider = collaboration.state().provider;
    if (provider) {
      provider.awareness.setLocalStateField('invitation', null);
    }
    setIsInviting(false);
    console.log('[FollowMode] Invitation cancelled');
  }

  // Set pending invitation from another user (only if not already handled)
  function setInvitation(invitation: Invitation | null) {
    if (invitation) {
      // Create unique key for this invitation
      const invitationKey = `${invitation.fromUserId}-${invitation.timestamp}`;

      // Skip if we've already handled this invitation
      if (handledInvitations.has(invitationKey)) {
        return;
      }
    }
    setPendingInvitation(invitation);
  }

  // Check if an invitation has been handled
  function isInvitationHandled(invitation: Invitation): boolean {
    const invitationKey = `${invitation.fromUserId}-${invitation.timestamp}`;
    return handledInvitations.has(invitationKey);
  }

  // Accept an invitation
  function acceptInvitation() {
    const invitation = pendingInvitation();
    if (invitation) {
      // Mark as handled so it won't show again
      const invitationKey = `${invitation.fromUserId}-${invitation.timestamp}`;
      handledInvitations.add(invitationKey);

      startFollowing(invitation.fromUserId, invitation.fromUserName);
      setPendingInvitation(null);
      console.log('[FollowMode] Invitation accepted');
    }
  }

  // Decline an invitation
  function declineInvitation() {
    const invitation = pendingInvitation();
    if (invitation) {
      // Mark as handled so it won't show again
      const invitationKey = `${invitation.fromUserId}-${invitation.timestamp}`;
      handledInvitations.add(invitationKey);
    }
    setPendingInvitation(null);
    console.log('[FollowMode] Invitation declined');
  }

  return {
    state,
    pendingInvitation,
    isInviting,
    startFollowing,
    stopFollowing,
    toggleFollowing,
    sendInvitation,
    cancelInvitation,
    setInvitation,
    isInvitationHandled,
    acceptInvitation,
    declineInvitation
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

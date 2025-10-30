/**
 * Liveblocks client configuration
 *
 * This file sets up the Liveblocks client for real-time collaboration.
 * It uses Supabase JWT for authentication.
 */

import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import { supabase } from "@/lib/supabase/client";

// Type definitions for Liveblocks
type Presence = {
  cursor: { x: number; y: number } | null;
  user: {
    id: string;
    name: string;
    color: string;
  };
};

type Storage = {
  // Y.js document will be stored here
};

type UserMeta = {
  id: string;
  info: {
    name: string;
    email: string;
    avatar?: string;
  };
};

type RoomEvent = {};

// Create Liveblocks client
export const client = createClient({
  publicApiKey: process.env.EXPO_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!,

  // Authentication using Supabase JWT
  async resolveUsers({ userIds }) {
    // Fetch user info from Supabase
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, username')
      .in('id', userIds);

    if (error || !data) {
      console.error('[Liveblocks] Error fetching users:', error);
      return [];
    }

    return data.map(profile => ({
      id: profile.id,
      info: {
        name: profile.full_name || profile.username || 'Unknown',
        email: '', // Not exposed in profiles
        avatar: profile.avatar_url,
      },
    }));
  },

  async resolveMentionSuggestions({ text }) {
    // Optional: Implement @mentions if needed
    return [];
  },
});

// Create typed room context
export const {
  RoomProvider,
  useRoom,
  useMyPresence,
  useUpdateMyPresence,
  useSelf,
  useOthers,
  useOthersMapped,
  useOthersConnectionIds,
  useOther,
  useBroadcastEvent,
  useEventListener,
  useErrorListener,
  useStorage,
  useObject,
  useMap,
  useList,
  useBatch,
  useHistory,
  useUndo,
  useRedo,
  useCanUndo,
  useCanRedo,
  useMutation,
  useStatus,
  useLostConnectionListener,
} = createRoomContext<Presence, Storage, UserMeta, RoomEvent>(client);

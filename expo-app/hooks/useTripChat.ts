import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-context';
import { useEffect } from 'react';

export interface ChatMessage {
  id: string;
  trip_id: string;
  user_id: string;
  message: string;
  created_at: string;
  edited_at?: string;
  is_edited?: boolean;
  attachments?: any;
  reply_to?: string;
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

export function useTripChat(tripId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch messages
  const { data: messages, isLoading, error } = useQuery({
    queryKey: ['trip-chat', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_chat_messages')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch user profiles separately if needed
      const messagesWithUsers = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('id', msg.user_id)
            .single();

          return {
            ...msg,
            user: profileData || { id: msg.user_id, email: 'Unknown', full_name: null }
          };
        })
      );

      return messagesWithUsers as ChatMessage[];
    },
    enabled: !!tripId && !!user,
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('trip_chat_messages')
        .insert({
          trip_id: tripId,
          user_id: user.id,
          message,
        })
        .select('*')
        .single();

      if (error) throw error;

      // Fetch user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', user.id)
        .single();

      return {
        ...data,
        user: profileData || { id: user.id, email: user.email || 'Unknown', full_name: null }
      } as ChatMessage;
    },
    onSuccess: (newMessage) => {
      // Optimistically update the cache
      queryClient.setQueryData(['trip-chat', tripId], (old: ChatMessage[] | undefined) => {
        if (!old) return [newMessage];
        // Check if message already exists to avoid duplicates
        const exists = old.some(msg => msg.id === newMessage.id);
        if (exists) return old;
        return [...old, newMessage];
      });
    },
  });

  // Set up real-time subscription
  useEffect(() => {
    if (!tripId || !user) return;

    const channel = supabase
      .channel(`trip-chat:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trip_chat_messages',
          filter: `trip_id=eq.${tripId}`,
        },
        async (payload) => {
          // Fetch the complete message
          const { data: messageData } = await supabase
            .from('trip_chat_messages')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (messageData) {
            // Fetch user profile
            const { data: profileData } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .eq('id', messageData.user_id)
              .single();

            const messageWithUser = {
              ...messageData,
              user: profileData || { id: messageData.user_id, email: 'Unknown', full_name: null }
            };

            queryClient.setQueryData(['trip-chat', tripId], (old: ChatMessage[] | undefined) => {
              if (!old) return [messageWithUser];
              // Check if message already exists (to avoid duplicates)
              const exists = old.some(msg => msg.id === messageWithUser.id);
              if (exists) return old;
              return [...old, messageWithUser];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, user, queryClient]);

  return {
    messages,
    isLoading,
    error,
    sendMessage: sendMessage.mutate,
    isSending: sendMessage.isPending,
  };
}
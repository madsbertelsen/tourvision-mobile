import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-context';
import { JSONContent } from '@tiptap/react';
import { ChatMessage } from './useTripChat';

export interface AISuggestion {
  id: string;
  trip_id: string;
  created_by: string;
  created_at: string;
  suggestion_type: 'add' | 'modify' | 'remove' | 'reorganize';
  title: string;
  description?: string;
  current_content?: any;
  proposed_content: any;
  chat_context?: string[];
  ai_reasoning?: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  approved_at?: string;
  applied_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  approval_count: number;
  rejection_count: number;
  required_approvals: number;
}

export interface SuggestionVote {
  id: string;
  suggestion_id: string;
  user_id: string;
  vote: 'approve' | 'reject';
  comment?: string;
  created_at: string;
}

interface AIAssistantConfig {
  auto_suggest: boolean;
  suggestion_threshold: number;
  required_approvals: number;
  model_provider: 'openai' | 'anthropic';
  model_name: string;
  temperature: number;
  custom_instructions?: string;
}

// Note: AI suggestion generation has been moved to Edge Function
// This function is no longer used but kept for reference
/*
async function generateAISuggestion(
  messages: ChatMessage[],
  currentDocument: JSONContent,
  config: AIAssistantConfig
): Promise<Partial<AISuggestion> | null> {
  // Analyze recent messages for travel planning decisions
  const recentMessages = messages.slice(-10); // Last 10 messages
  const messageTexts = recentMessages.map(m => m.message);
  const combinedText = messageTexts.join(' ').toLowerCase();

  // Look for travel planning keywords and patterns
  const patterns = [
    { regex: /let's add (.+) at (\d+(?::\d+)?(?:am|pm)?)/i, type: 'add' as const },
    { regex: /we should stay at (.+)/i, type: 'add' as const },
    { regex: /add (.+) to (day \d+|the itinerary)/i, type: 'add' as const },
    { regex: /remove (.+) from/i, type: 'remove' as const },
    { regex: /change (.+) to (.+)/i, type: 'modify' as const },
    { regex: /instead of (.+), let's (.+)/i, type: 'modify' as const },
    { regex: /move (.+) to (day \d+|morning|afternoon|evening)/i, type: 'reorganize' as const },
  ];

  // Check if there's a clear decision in the chat
  for (const pattern of patterns) {
    const match = combinedText.match(pattern.regex);
    if (match) {
      // Generate a suggestion based on the pattern
      const newContent = { ...currentDocument };

      // For demo, we'll add a simple paragraph
      if (!newContent.content) {
        newContent.content = [];
      }

      // Create a suggestion
      return {
        suggestion_type: pattern.type,
        title: `${pattern.type === 'add' ? 'Add' : pattern.type === 'modify' ? 'Modify' : pattern.type === 'remove' ? 'Remove' : 'Reorganize'}: ${match[1]}`,
        description: `Based on the team discussion, I suggest ${pattern.type === 'add' ? 'adding' : pattern.type === 'modify' ? 'modifying' : pattern.type === 'remove' ? 'removing' : 'reorganizing'} ${match[1]}`,
        current_content: currentDocument,
        proposed_content: {
          ...currentDocument,
          content: [
            ...(currentDocument.content || []),
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `[AI Suggested: ${match[0]}]`,
                },
              ],
            },
          ],
        },
        chat_context: messageTexts,
        ai_reasoning: `The team discussed ${pattern.type === 'add' ? 'adding' : pattern.type === 'modify' ? 'changing' : pattern.type === 'remove' ? 'removing' : 'moving'} this item. Multiple participants seemed to agree on this change.`,
      };
    }
  }

  return null;
}
*/

export function useAIAssistant(tripId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch AI config for this trip
  const { data: config } = useQuery({
    queryKey: ['ai-config', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_agent_config')
        .select('*')
        .eq('trip_id', tripId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      // Return default config if none exists
      return data || {
        auto_suggest: true,
        suggestion_threshold: 2,
        required_approvals: 1,
        model_provider: 'openai',
        model_name: 'gpt-4',
        temperature: 0.7,
        custom_instructions: null,
      } as AIAssistantConfig;
    },
    enabled: !!tripId,
  });

  // Fetch pending suggestions
  const { data: suggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['ai-suggestions', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_suggestions')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AISuggestion[];
    },
    enabled: !!tripId,
  });

  // Fetch votes for suggestions
  const { data: votes } = useQuery({
    queryKey: ['suggestion-votes', tripId],
    queryFn: async () => {
      if (!suggestions?.length) return [];

      const suggestionIds = suggestions.map(s => s.id);
      const { data, error } = await supabase
        .from('suggestion_votes')
        .select('*')
        .in('suggestion_id', suggestionIds);

      if (error) throw error;
      return data as SuggestionVote[];
    },
    enabled: !!suggestions?.length,
  });

  // Note: processMessages is now handled server-side via Edge Function
  // triggered by database webhook on message insert

  // Vote on a suggestion
  const voteSuggestion = useMutation({
    mutationFn: async ({
      suggestionId,
      vote,
      comment,
    }: {
      suggestionId: string;
      vote: 'approve' | 'reject';
      comment?: string;
    }) => {
      console.log('voteSuggestion mutation received:', { suggestionId, vote, comment });
      console.log('suggestionId is:', suggestionId);
      console.log('suggestionId type:', typeof suggestionId);

      if (!user) throw new Error('User not authenticated');

      if (!suggestionId) {
        throw new Error('suggestionId is required but was: ' + suggestionId);
      }

      const insertData = {
        suggestion_id: suggestionId,
        user_id: user.id,
        vote,
        comment: comment || null,
      };

      console.log('insertData being sent to Supabase:', insertData);

      // First, check if a vote already exists
      const { data: existingVote } = await supabase
        .from('suggestion_votes')
        .select('id')
        .eq('suggestion_id', suggestionId)
        .eq('user_id', user.id)
        .single();

      let data, error;

      if (existingVote) {
        // Update existing vote
        const result = await supabase
          .from('suggestion_votes')
          .update({ vote, comment: comment || null })
          .eq('id', existingVote.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Insert new vote
        const result = await supabase
          .from('suggestion_votes')
          .insert(insertData)
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      // Call the apply-suggestion Edge Function to update counts and potentially apply
      const response = await fetch('http://localhost:54321/functions/v1/apply-suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ suggestionId })
      });

      if (!response.ok) {
        console.error('Failed to process suggestion after vote:', await response.text());
      } else {
        const result = await response.json();
        console.log('Apply suggestion result:', result);
      }

      return data;
    },
    onSuccess: () => {
      // Refresh votes and suggestions (triggers may have updated status)
      queryClient.invalidateQueries({ queryKey: ['suggestion-votes', tripId] });
      queryClient.invalidateQueries({ queryKey: ['ai-suggestions', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] }); // Also refresh trip data
    },
    onError: (error) => {
      console.error('Error voting on suggestion:', error);
    },
  });

  // Manually apply a suggestion
  const applySuggestion = useMutation({
    mutationFn: async (suggestionId: string) => {
      const suggestion = suggestions?.find(s => s.id === suggestionId);
      if (!suggestion) throw new Error('Suggestion not found');

      // Update the trip document
      const { error: updateError } = await supabase
        .from('trips')
        .update({ itinerary_document: suggestion.proposed_content })
        .eq('id', tripId);

      if (updateError) throw updateError;

      // Mark suggestion as applied
      const { error: suggestionError } = await supabase
        .from('ai_suggestions')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
        })
        .eq('id', suggestionId);

      if (suggestionError) throw suggestionError;

      return suggestion;
    },
    onSuccess: () => {
      // Refresh everything
      queryClient.invalidateQueries({ queryKey: ['ai-suggestions', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] });
    },
  });

  // Update AI config
  const updateConfig = useMutation({
    mutationFn: async (newConfig: Partial<AIAssistantConfig>) => {
      const { data, error } = await supabase
        .from('ai_agent_config')
        .upsert({
          trip_id: tripId,
          ...config,
          ...newConfig,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config', tripId] });
    },
  });

  // Set up real-time subscription for new suggestions
  useEffect(() => {
    if (!tripId || !user) return;

    const channel = supabase
      .channel(`ai-suggestions:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_suggestions',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['ai-suggestions', tripId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'suggestion_votes',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['suggestion-votes', tripId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, user, queryClient]);

  // Get user's vote for a suggestion
  const getUserVote = useCallback((suggestionId: string) => {
    if (!user || !votes) return null;
    return votes.find(v => v.suggestion_id === suggestionId && v.user_id === user.id);
  }, [user, votes]);

  // Filter suggestions by status
  const pendingSuggestions = suggestions?.filter(s => s.status === 'pending') || [];
  const approvedSuggestions = suggestions?.filter(s => s.status === 'approved') || [];
  const appliedSuggestions = suggestions?.filter(s => s.status === 'applied') || [];

  return {
    // Config
    config,
    updateConfig: updateConfig.mutate,

    // Suggestions
    suggestions: suggestions || [],
    pendingSuggestions,
    approvedSuggestions,
    appliedSuggestions,
    suggestionsLoading,

    // Voting
    votes,
    getUserVote,
    voteSuggestion: voteSuggestion.mutate,
    isVoting: voteSuggestion.isPending,

    // Note: Processing now happens server-side via Edge Function

    // Applying
    applySuggestion: applySuggestion.mutate,
    isApplying: applySuggestion.isPending,
  };
}
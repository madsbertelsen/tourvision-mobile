import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-context';
import { JSONContent } from '@tiptap/react';
import { ChatMessage } from './useTripChat';

export interface Proposal {
  id: string;
  trip_id: string;
  created_by: string;
  created_at: string;
  proposal_type: 'add' | 'modify' | 'remove' | 'reorganize';
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
  // Enriched data fields
  enriched_data?: {
    quick_facts?: string[];
    highlights?: string[];
    why_visit?: string;
    best_for?: string[];
    historical_context?: string;
  };
  practical_info?: {
    duration?: string;
    best_time?: string;
    admission?: {
      adults?: string;
      children?: string;
      notes?: string;
    };
    opening_hours?: string;
    location_details?: {
      address?: string;
      distance_from_city?: string;
      transport_options?: string[];
    };
    accessibility?: {
      wheelchair?: string;
      facilities?: string[];
    };
  };
  external_resources?: {
    official_website?: string;
    wikipedia_url?: string;
    booking_link?: string;
  };
}

export interface ProposalVote {
  id: string;
  proposal_id: string;
  user_id: string;
  vote: 'approve' | 'reject';
  comment?: string;
  created_at: string;
}

interface AIAssistantConfig {
  auto_suggest: boolean;
  proposal_threshold: number;
  required_approvals: number;
  model_provider: 'openai' | 'anthropic';
  model_name: string;
  temperature: number;
  custom_instructions?: string;
}

// Note: AI proposal generation has been moved to Edge Function
// This function is no longer used but kept for reference
/*
async function generateProposal(
  messages: ChatMessage[],
  currentDocument: JSONContent,
  config: AIAssistantConfig
): Promise<Partial<Proposal> | null> {
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
      // Generate a proposal based on the pattern
      const newContent = { ...currentDocument };

      // For demo, we'll add a simple paragraph
      if (!newContent.content) {
        newContent.content = [];
      }

      // Create a proposal
      return {
        proposal_type: pattern.type,
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
        proposal_threshold: 2,
        required_approvals: 1,
        model_provider: 'openai',
        model_name: 'gpt-4',
        temperature: 0.7,
        custom_instructions: null,
      } as AIAssistantConfig;
    },
    enabled: !!tripId,
  });

  // Fetch pending proposals
  const { data: proposals, isLoading: proposalsLoading } = useQuery({
    queryKey: ['ai-proposals', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Proposal[];
    },
    enabled: !!tripId,
  });

  // Fetch votes for proposals
  const { data: votes } = useQuery({
    queryKey: ['proposal-votes', tripId],
    queryFn: async () => {
      if (!proposals?.length) return [];

      const proposalIds = proposals.map(s => s.id);
      const { data, error } = await supabase
        .from('proposal_votes')
        .select('*')
        .in('proposal_id', proposalIds);

      if (error) throw error;
      return data as ProposalVote[];
    },
    enabled: !!proposals?.length,
  });

  // Note: processMessages is now handled server-side via Edge Function
  // triggered by database webhook on message insert

  // Vote on a proposal
  const voteProposal = useMutation({
    mutationFn: async ({
      proposalId,
      vote,
      comment,
    }: {
      proposalId: string;
      vote: 'approve' | 'reject';
      comment?: string;
    }) => {
      console.log('voteProposal mutation received:', { proposalId, vote, comment });
      console.log('proposalId is:', proposalId);
      console.log('proposalId type:', typeof proposalId);

      if (!user) throw new Error('User not authenticated');

      if (!proposalId) {
        throw new Error('proposalId is required but was: ' + proposalId);
      }

      const insertData = {
        proposal_id: proposalId,
        user_id: user.id,
        vote,
        comment: comment || null,
      };

      console.log('insertData being sent to Supabase:', insertData);

      // First, check if a vote already exists
      const { data: existingVote } = await supabase
        .from('proposal_votes')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('user_id', user.id)
        .single();

      let data, error;

      if (existingVote) {
        // Update existing vote
        const result = await supabase
          .from('proposal_votes')
          .update({ vote, comment: comment || null })
          .eq('id', existingVote.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Insert new vote
        const result = await supabase
          .from('proposal_votes')
          .insert(insertData)
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      // Call the apply-proposal Edge Function to update counts and potentially apply
      const response = await fetch('http://localhost:54321/functions/v1/apply-proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ proposalId })
      });

      if (!response.ok) {
        console.error('Failed to process proposal after vote:', await response.text());
      } else {
        const result = await response.json();
        console.log('Apply proposal result:', result);
      }

      return data;
    },
    onSuccess: () => {
      // Refresh votes and proposals (triggers may have updated status)
      queryClient.invalidateQueries({ queryKey: ['proposal-votes', tripId] });
      queryClient.invalidateQueries({ queryKey: ['ai-proposals', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] }); // Also refresh trip data
    },
    onError: (error) => {
      console.error('Error voting on proposal:', error);
    },
  });

  // Manually apply a proposal
  const applyProposal = useMutation({
    mutationFn: async (proposalId: string) => {
      const proposal = proposals?.find(s => s.id === proposalId);
      if (!proposal) throw new Error('Proposal not found');

      // Update the trip document
      const { error: updateError } = await supabase
        .from('trips')
        .update({ itinerary_document: proposal.proposed_content })
        .eq('id', tripId);

      if (updateError) throw updateError;

      // Mark proposal as applied
      const { error: proposalError } = await supabase
        .from('proposals')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
        })
        .eq('id', proposalId);

      if (proposalError) throw proposalError;

      return proposal;
    },
    onSuccess: () => {
      // Refresh everything
      queryClient.invalidateQueries({ queryKey: ['ai-proposals', tripId] });
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

  // Set up real-time subscription for new proposals
  useEffect(() => {
    if (!tripId || !user) return;

    const channel = supabase
      .channel(`ai-proposals:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposals',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['ai-proposals', tripId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposal_votes',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['proposal-votes', tripId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, user, queryClient]);

  // Get user's vote for a proposal
  const getUserVote = useCallback((proposalId: string) => {
    if (!user || !votes) return null;
    return votes.find(v => v.proposal_id === proposalId && v.user_id === user.id);
  }, [user, votes]);

  // Filter proposals by status
  const pendingProposals = proposals?.filter(s => s.status === 'pending') || [];
  const approvedProposals = proposals?.filter(s => s.status === 'approved') || [];
  const appliedProposals = proposals?.filter(s => s.status === 'applied') || [];

  return {
    // Config
    config,
    updateConfig: updateConfig.mutate,

    // Proposals
    proposals: proposals || [],
    pendingProposals,
    approvedProposals,
    appliedProposals,
    proposalsLoading,

    // Voting
    votes,
    getUserVote,
    voteProposal: voteProposal.mutate,
    isVoting: voteProposal.isPending,

    // Note: Processing now happens server-side via Edge Function

    // Applying
    applyProposal: applyProposal.mutate,
    isApplying: applyProposal.isPending,
  };
}
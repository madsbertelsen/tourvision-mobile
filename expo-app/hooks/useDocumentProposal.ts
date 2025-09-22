import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { JSONContent } from '@tiptap/react';

interface ProposalResult {
  success: boolean;
  modifiedHtml?: string;
  changes?: Array<{
    type: string;
    elementIds: string[];
    description: string;
  }>;
  description?: string;
  reasoning?: string;
  error?: string;
}

export function useDocumentProposal() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateProposal = useCallback(async (
    htmlDocument: string,
    prompt: string
  ): Promise<ProposalResult | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      console.log('[useDocumentProposal] Calling Edge Function with:', {
        htmlLength: htmlDocument.length,
        prompt
      });

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-prosemirror-proposal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            htmlDocument,
            prompt
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate proposal: ${errorText}`);
      }

      const result = await response.json();
      console.log('[useDocumentProposal] Received result:', result);

      return result;
    } catch (err) {
      console.error('[useDocumentProposal] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate proposal');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const saveProposalToDatabase = useCallback(async (
    tripId: string,
    userId: string,
    messageId: string | null,
    proposalResult: ProposalResult,
    originalHtml: string
  ) => {
    try {
      // Create proposal record with the HTML-based changes
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
          trip_id: tripId,
          created_by: userId,
          source_message_id: messageId,
          proposal_type: 'modify', // Will be determined by the changes
          title: proposalResult.description || 'Document Update',
          description: proposalResult.reasoning,
          current_content: { html: originalHtml },
          proposed_content: { html: proposalResult.modifiedHtml },
          // Store the changes for visualization
          diff_decorations: proposalResult.changes?.map(change => ({
            type: change.type,
            elementIds: change.elementIds,
            description: change.description
          })),
          ai_reasoning: proposalResult.reasoning,
          status: 'pending',
          required_approvals: 1
        })
        .select()
        .single();

      if (proposalError) {
        console.error('[useDocumentProposal] Error saving proposal:', proposalError);
        throw proposalError;
      }

      console.log('[useDocumentProposal] Saved proposal:', proposal);
      return proposal;
    } catch (err) {
      console.error('[useDocumentProposal] Error saving to database:', err);
      throw err;
    }
  }, []);

  return {
    generateProposal,
    saveProposalToDatabase,
    isGenerating,
    error
  };
}
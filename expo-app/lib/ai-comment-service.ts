import { supabase } from './supabase/client';

export interface AICommentReplyRequest {
  documentId: string;
  commentId: string;
  from: number;
  to: number;
  instruction: string;
  selectedText: string;
  userId: string;
  userName: string;
}

export interface AICommentReplyResponse {
  success: boolean;
  commentId: string;
  aiReply?: string;
  error?: string;
}

/**
 * Request an AI reply for a comment using Supabase Edge Function
 */
export async function requestAICommentReply(
  request: AICommentReplyRequest
): Promise<AICommentReplyResponse> {
  console.log('[AICommentService] Requesting AI comment reply:', {
    documentId: request.documentId,
    commentId: request.commentId,
    instruction: request.instruction.substring(0, 50) + '...',
  });

  try {
    // Get Supabase URL from environment
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL not configured');
    }

    // Call the Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-comment-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[AICommentService] Edge Function error:', error);
      throw new Error(`Edge Function error: ${response.status}`);
    }

    const data: AICommentReplyResponse = await response.json();

    console.log('[AICommentService] AI reply received:', {
      success: data.success,
      replyLength: data.aiReply?.length,
    });

    return data;
  } catch (error) {
    console.error('[AICommentService] Error requesting AI reply:', error);
    return {
      success: false,
      commentId: request.commentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Subscribe to AI comment replies via Supabase Realtime
 */
export function subscribeToAIReplies(
  documentId: string,
  onReply: (data: { commentId: string; aiReply: string; userId: string; userName: string; timestamp: string }) => void
): () => void {
  console.log('[AICommentService] Subscribing to AI replies for document:', documentId);

  const channel = supabase.channel(`doc:${documentId}`);

  channel
    .on('broadcast', { event: 'ai-comment-reply' }, ({ payload }) => {
      console.log('[AICommentService] Received AI reply broadcast:', payload);
      onReply(payload);
    })
    .subscribe((status) => {
      console.log('[AICommentService] Subscription status:', status);
    });

  // Return unsubscribe function
  return () => {
    console.log('[AICommentService] Unsubscribing from AI replies');
    supabase.removeChannel(channel);
  };
}

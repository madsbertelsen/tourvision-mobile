import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CommentReplyRequest {
  documentId: string;
  commentId: string;
  from: number;
  to: number;
  instruction: string;
  selectedText: string;
  userId: string;
  userName: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { documentId, commentId, from, to, instruction, selectedText, userId, userName }: CommentReplyRequest = await req.json();

    console.log('[AI Comment Reply] Processing request:', {
      documentId,
      commentId,
      instruction: instruction.substring(0, 50) + '...',
    });

    // Get Mistral API key from environment
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }

    // Build the system prompt
    const systemPrompt = `You are an AI travel planning assistant helping with trip itinerary comments.

When a user comments on selected text in their trip document, provide a helpful, concise reply.

Selected text: "${selectedText}"

Guidelines:
- Be concise and actionable
- Focus on practical travel advice
- Consider local insights, timing, costs, and logistics
- If suggesting changes, be specific
- Keep responses under 150 words unless more detail is requested`;

    // Call Mistral API for completion
    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: instruction },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!mistralResponse.ok) {
      const error = await mistralResponse.text();
      console.error('[AI Comment Reply] Mistral API error:', error);
      throw new Error(`Mistral API error: ${mistralResponse.status}`);
    }

    const mistralData = await mistralResponse.json();
    const aiReply = mistralData.choices[0]?.message?.content;

    if (!aiReply) {
      throw new Error('No AI response generated');
    }

    console.log('[AI Comment Reply] Generated reply:', aiReply.substring(0, 100) + '...');

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Store the AI reply in the database
    // You could add a table for comment_replies or update the comment directly
    // For now, we'll just return the reply to be handled by the client

    // Broadcast the reply via Realtime
    const channel = supabase.channel(`doc:${documentId}`);
    const broadcastTimestamp = new Date().toISOString();

    await channel.send({
      type: 'broadcast',
      event: 'ai-comment-reply',
      payload: {
        commentId,
        aiReply,
        userId,
        userName,
        timestamp: broadcastTimestamp,
      },
    });

    // Return the AI reply with event log for testing
    return new Response(
      JSON.stringify({
        success: true,
        commentId,
        aiReply,
        realtimeChannel: `doc:${documentId}`,
        eventBroadcast: {
          event: 'ai-comment-reply',
          timestamp: broadcastTimestamp,
          payload: {
            commentId,
            aiReplyPreview: aiReply.substring(0, 100) + (aiReply.length > 100 ? '...' : ''),
          },
        },
        request: {
          documentId,
          selectedText: selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''),
          instruction: instruction.substring(0, 100) + (instruction.length > 100 ? '...' : ''),
        },
        note: 'This response includes the AI reply and broadcast info for testing. In production, clients subscribe to the Realtime channel to receive the reply.',
      }, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[AI Comment Reply] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

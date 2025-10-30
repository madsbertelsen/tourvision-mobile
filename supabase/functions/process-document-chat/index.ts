import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  message_id: string;
  document_id: string;
  user_id: string;
  content: string;
  metadata?: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message_id, document_id, user_id, content, metadata } = await req.json() as ChatMessage;

    console.log(`[ProcessDocumentChat] Processing message ${message_id} for document ${document_id}`);

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is an initial prompt (first message in chat)
    const isInitialPrompt = metadata?.initial_prompt === true;

    if (isInitialPrompt) {
      console.log('[ProcessDocumentChat] Processing initial prompt for document generation');

      // Generate document content using the existing generate-document-stream function
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-document-stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: content,
          useTypingMode: false, // Generate complete document at once
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate document: ${response.statusText}`);
      }

      // Read the streamed response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Parse the SSE format
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                }
              } catch (e) {
                console.error('[ProcessDocumentChat] Error parsing SSE data:', e);
              }
            }
          }
        }
      }

      console.log('[ProcessDocumentChat] Document generated, updating document table');

      // Parse the generated document content
      let documentData;
      try {
        documentData = JSON.parse(fullContent);
      } catch (e) {
        console.error('[ProcessDocumentChat] Error parsing generated document:', e);
        documentData = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: fullContent }
              ]
            }
          ]
        };
      }

      // Update the document with generated content
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          document: documentData,
          updated_at: new Date().toISOString()
        })
        .eq('id', document_id);

      if (updateError) {
        throw updateError;
      }

      // Insert assistant response into chat
      const { error: chatError } = await supabase
        .from('document_chats')
        .insert({
          document_id,
          user_id,
          role: 'assistant',
          content: 'I\'ve generated your travel document based on your prompt. The document has been updated with the itinerary.',
          metadata: {
            source: 'process_document_chat',
            document_generated: true,
          }
        });

      if (chatError) {
        console.error('[ProcessDocumentChat] Error inserting assistant message:', chatError);
      }

      console.log('[ProcessDocumentChat] Document generation complete');

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For non-initial messages, we can add more sophisticated chat handling later
    // For now, just acknowledge the message
    console.log('[ProcessDocumentChat] Received chat message (not initial prompt)');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ProcessDocumentChat] Error:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
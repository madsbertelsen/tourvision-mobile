import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { generateObject } from 'https://esm.sh/ai@4.0.20'
import { createMistral } from 'https://esm.sh/@ai-sdk/mistral@1.0.7'
import { z } from 'https://esm.sh/zod@3.21.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_USER_ID = '00000000-0000-0000-0000-000000000001'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message_id, trip_id, message, user_id } = await req.json()
    console.log('[Info] Processing chat message:', { message_id, trip_id, message })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Skip processing if this is an AI message
    if (user_id === AI_USER_ID) {
      console.log('[Info] Skipping AI message')
      return new Response(JSON.stringify({ processed: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get trip details and recent messages for context
    const { data: trip } = await supabase
      .from('trips')
      .select('*, trip_members(user_id)')
      .eq('id', trip_id)
      .single()

    const { data: messages } = await supabase
      .from('trip_chat_messages')
      .select('*, user:profiles!user_id(*)')
      .eq('trip_id', trip_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const messageTexts = messages?.map(m => m.message) || []
    const document = trip?.itinerary_document || { type: 'doc', content: [{ type: 'paragraph' }] }

    // ALWAYS analyze and respond using AI
    const mistralKey = Deno.env.get('MISTRAL_API_KEY')
    if (!mistralKey) {
      console.error('[Error] MISTRAL_API_KEY not configured')
      // Still create a response even without AI
      await createSimpleResponse(supabase, trip_id, message_id, message)
      return new Response(
        JSON.stringify({ success: true, processed: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mistral = createMistral({ apiKey: mistralKey })

    // Schema for AI response - simplified
    const responseSchema = z.object({
      response_type: z.enum(['proposal', 'information', 'greeting', 'clarification']),
      should_create_proposal: z.boolean(),
      proposal_type: z.enum(['add', 'modify', 'remove', 'reorganize']).optional(),
      title: z.string(),
      description: z.string(),
      message_response: z.string(),
      proposed_content: z.any().optional(),
      enriched_data: z.object({
        quick_facts: z.array(z.string()).optional(),
        highlights: z.array(z.string()).optional(),
        why_visit: z.string().optional(),
        practical_info: z.any().optional(),
      }).optional(),
    })

    console.log('[Info] Analyzing with Mistral AI')

    const { object } = await generateObject({
      model: mistral('mistral-small-latest'),
      schema: responseSchema,
      system: `You are a helpful and proactive travel planning assistant. ALWAYS respond helpfully to every message.

CORE PRINCIPLE: Always be helpful and create proposals for any travel-related content.

Response Types:
1. proposal - Create when user mentions ANY destination, activity, or travel plan
2. information - When user asks questions about existing plans
3. greeting - For greetings, but still offer to help plan
4. clarification - When you need more information

IMPORTANT RULES:
- Set should_create_proposal=true for ANY actionable travel content
- Be proactive - if someone mentions a place, create a proposal to add it
- Don't wait for consensus or agreement - single user suggestions are valid
- Always provide enriched data when creating proposals about places

Examples:
- "I want to fly to Copenhagen" → Create proposal (type: add) for Copenhagen trip
- "Let's visit the Louvre" → Create proposal (type: add) for Louvre visit
- "Hello" → Greeting + "What destinations are you considering for your trip?"
- "What time does it open?" → Information response about opening hours
- "Add museum visit" → Create proposal (type: add) for museum visits

For proposals, always include:
- Clear title (e.g., "Visit Copenhagen", "Fly to Copenhagen", "Museum Tour")
- Helpful description with details
- Enriched data with practical information when relevant`,
      prompt: `User message: "${message}"

Recent conversation (newest first):
${messageTexts.slice(0, 5).map((m, i) => `${i + 1}. ${m}`).join('\n')}

Current trip document summary:
${JSON.stringify(document, null, 2).slice(0, 500)}

Analyze this message and create an appropriate response.
Remember: Be proactive! If they mention ANY destination or activity, create a proposal for it.
Don't wait for group consensus - this is for single users planning their trips.`,
      temperature: 0.7,
    })

    console.log('[Info] AI response:', object)

    // Create AI response
    let aiMessageText = object.message_response
    let metadata: any = { type: 'ai_response' }
    let proposalCreated = false

    // Create proposal if needed
    if (object.should_create_proposal && object.proposal_type) {
      // Validate message_id is a valid UUID before using it as source_message_id
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message_id)

      const proposalData: any = {
        trip_id,
        created_by: AI_USER_ID,
        proposal_type: object.proposal_type,
        title: object.title,
        description: object.description,
        current_content: document,
        proposed_content: createProposedContent(document, object),
        chat_context: messageTexts.slice(0, 5),
        ai_reasoning: `User suggested: "${message}"`,
        status: 'pending',
        required_approvals: 1,
        enriched_data: object.enriched_data,
      }

      // Only add source_message_id if it's a valid UUID
      if (isValidUUID) {
        proposalData.source_message_id = message_id
      }

      const { data: proposal, error } = await supabase
        .from('proposals')
        .insert(proposalData)
        .select()
        .single()

      if (!error && proposal) {
        console.log('[Info] Created proposal:', proposal.id)
        proposalCreated = true

        // Format message with proposal details
        aiMessageText = `🤖 **${object.title}**\n\n${object.description}`

        if (object.enriched_data?.quick_facts?.length) {
          aiMessageText += '\n\n**Quick Facts:**\n' +
            object.enriched_data.quick_facts.map(f => `• ${f}`).join('\n')
        }

        if (object.enriched_data?.highlights?.length) {
          aiMessageText += '\n\n**Highlights:**\n' +
            object.enriched_data.highlights.map(h => `• ${h}`).join('\n')
        }

        if (object.enriched_data?.why_visit) {
          aiMessageText += `\n\n**Why Visit:** ${object.enriched_data.why_visit}`
        }

        aiMessageText += '\n\n💡 *View proposal details above to vote*'

        metadata = {
          type: 'ai_proposal',
          proposal_id: proposal.id,
          proposal_type: object.proposal_type,
        }
      } else if (error) {
        console.error('[Error] Failed to create proposal:', error)
      }
    }

    // Always create an AI message response
    // Include reply_to in metadata since the column doesn't exist in the table
    const aiMessageMetadata = {
      ...metadata,
      reply_to: message_id
    }

    const { data: aiMessage, error: msgError } = await supabase
      .from('trip_chat_messages')
      .insert({
        trip_id,
        user_id: AI_USER_ID,
        message: aiMessageText,
        metadata: aiMessageMetadata,
      })
      .select()
      .single()

    if (msgError) {
      console.error('[Error] Failed to create AI message:', msgError)
    } else {
      console.log('[Info] Created AI response message:', aiMessage?.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: true,
        ai_message: aiMessage,
        proposal_created: proposalCreated
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Error] Processing failed:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Helper function to create proposed content
function createProposedContent(document: any, aiResponse: any): any {
  const newDoc = document ? JSON.parse(JSON.stringify(document)) : { type: 'doc', content: [] }

  if (!newDoc.content || !Array.isArray(newDoc.content)) {
    newDoc.content = []
  }

  // Add a simple section for the proposal
  const newSection = {
    type: 'section',
    attrs: { id: `section-${Date.now()}` },
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: aiResponse.title }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: aiResponse.description }]
      }
    ]
  }

  // Add enriched data as a list if available
  if (aiResponse.enriched_data?.quick_facts?.length) {
    newSection.content.push({
      type: 'bulletList',
      content: aiResponse.enriched_data.quick_facts.map((fact: string) => ({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: fact }]
        }]
      }))
    })
  }

  // Add the new section to the document
  if (aiResponse.proposal_type === 'add') {
    newDoc.content.push(newSection)
  } else if (aiResponse.proposal_type === 'modify' || aiResponse.proposal_type === 'remove') {
    // For modify/remove, we'd need more complex logic
    // For now, just add a note about the change
    newDoc.content.push(newSection)
  }

  return newDoc
}

// Simple response for when AI is not available
async function createSimpleResponse(supabase: any, trip_id: string, message_id: string, message: string) {
  const responses: { [key: string]: string } = {
    'hello': "Hi! I'm here to help plan your trip. What destinations are you interested in?",
    'hi': "Hello! Ready to plan an amazing trip. Where would you like to go?",
    'help': "I can help you plan your trip! Just tell me about places you'd like to visit or activities you want to do.",
  }

  const lowerMessage = message.toLowerCase()
  let responseText = responses[lowerMessage]

  if (!responseText) {
    if (lowerMessage.includes('visit') || lowerMessage.includes('go to') || lowerMessage.includes('fly')) {
      responseText = "That sounds interesting! I'll make a note of that for your trip."
    } else {
      responseText = "I understand. Tell me more about what you'd like to do on your trip!"
    }
  }

  await supabase
    .from('trip_chat_messages')
    .insert({
      trip_id,
      user_id: AI_USER_ID,
      message: responseText,
      metadata: { type: 'ai_response', reply_to: message_id }
    })
}
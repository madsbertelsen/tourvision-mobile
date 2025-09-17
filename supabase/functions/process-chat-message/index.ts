import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createMistral } from 'https://esm.sh/@ai-sdk/mistral@0.0.22'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateObject } from 'https://esm.sh/ai@3.2.0'
import { z } from 'https://esm.sh/zod@3.23.8'

// Define types
interface ChatMessage {
  id: string
  trip_id: string
  user_id: string
  message: string
  created_at: string
}

interface AISuggestion {
  suggestion_type: 'add' | 'modify' | 'remove' | 'reorganize'
  title: string
  description?: string
  current_content?: any
  proposed_content: any
  chat_context: string[]
  ai_reasoning: string
  required_approvals: number
}

serve(async (req) => {
  try {
    // Parse request body
    const { message_id, trip_id, user_id, message } = await req.json()

    console.log('Processing chat message:', { message_id, trip_id, message })

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get AI agent config for this trip
    const { data: aiConfig } = await supabase
      .from('ai_agent_config')
      .select('*')
      .eq('trip_id', trip_id)
      .single()

    // Use default config if none exists
    const config = aiConfig || {
      auto_suggest: true,
      suggestion_threshold: 2,
      required_approvals: 1,
      model_provider: 'mistral',
      model_name: 'mistral-small-latest',
      temperature: 0.7,
      custom_instructions: null,
    }

    // Skip if auto-suggest is disabled
    if (!config.auto_suggest) {
      return new Response(
        JSON.stringify({ success: true, message: 'Auto-suggest disabled' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get recent messages for context
    const { data: recentMessages, error: messagesError } = await supabase
      .from('trip_chat_messages')
      .select('*')
      .eq('trip_id', trip_id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (messagesError) {
      throw new Error(`Failed to fetch messages: ${messagesError.message}`)
    }

    // Check if we have enough messages to analyze (based on threshold)
    if (!recentMessages || recentMessages.length < config.suggestion_threshold) {
      return new Response(
        JSON.stringify({ success: true, message: 'Not enough messages for analysis' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get current trip document
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('itinerary_document')
      .eq('id', trip_id)
      .single()

    if (tripError) {
      throw new Error(`Failed to fetch trip: ${tripError.message}`)
    }

    // Analyze messages with AI
    const suggestion = await analyzeWithAI(
      recentMessages as ChatMessage[],
      trip.itinerary_document,
      message,
      config
    )

    console.log('Suggestion:', suggestion)

    if (suggestion) {
      // Get AI agent user ID (using a fixed service account ID)
      const AI_AGENT_USER_ID = '00000000-0000-0000-0000-000000000001'

      // Create AI suggestion in database with source message reference
      const { data: createdSuggestion, error: suggestionError } = await supabase
        .from('ai_suggestions')
        .insert({
          trip_id,
          created_by: AI_AGENT_USER_ID,
          source_message_id: message_id, // Link to the message that triggered this suggestion
          ...suggestion,
          required_approvals: config.required_approvals,
        })
        .select()
        .single()

      if (suggestionError) {
        console.error('Failed to create suggestion:', suggestionError)
        throw new Error(`Failed to create suggestion: ${suggestionError.message}`)
      }

      console.log('Created suggestion:', createdSuggestion)

      // Create a chat message from the AI agent as a reply to the triggering message
      const aiMessageText = formatAISuggestionMessage(suggestion)

      const { data: aiChatMessage, error: chatError } = await supabase
        .from('trip_chat_messages')
        .insert({
          trip_id,
          user_id: AI_AGENT_USER_ID,
          message: aiMessageText,
          reply_to: message_id, // Thread this as a reply to the original message
          metadata: {
            type: 'ai_suggestion',
            suggestion_id: createdSuggestion.id,
            suggestion_type: suggestion.suggestion_type,
          },
        })
        .select()
        .single()

      if (chatError) {
        console.error('Failed to create AI chat message:', chatError)
        // Don't throw here - the suggestion was created successfully
      } else {
        console.log('Created AI chat message:', aiChatMessage)
      }

      return new Response(
        JSON.stringify({
          success: true,
          suggestion_created: true,
          suggestion_id: createdSuggestion.id
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, suggestion_created: false }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error processing chat message:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})

async function analyzeWithAI(
  messages: ChatMessage[],
  document: any,
  newMessage: string,
  config: any
): Promise<AISuggestion | null> {
  try {
    console.log('Analyzing with AI')
    // Prepare message context
    const messageTexts = messages.map(m => m.message)
    const combinedText = messageTexts.join(' ').toLowerCase()

    // Pattern matching for travel planning decisions
    const patterns = [
      { regex: /let's add (.+?) at (\d+(?::\d+)?(?:am|pm)?)/i, type: 'add' as const },
      { regex: /we should (?:stay|book|reserve) (?:at )?(.+)/i, type: 'add' as const },
      { regex: /add (.+?) to (?:the )?(?:itinerary|trip|day \d+)/i, type: 'add' as const },
      { regex: /remove (.+?) from/i, type: 'remove' as const },
      { regex: /(?:change|update|modify) (.+?) to (.+)/i, type: 'modify' as const },
      { regex: /instead of (.+?), (?:let's|we should) (.+)/i, type: 'modify' as const },
      { regex: /move (.+?) to (?:day \d+|morning|afternoon|evening)/i, type: 'reorganize' as const },
    ]

    // Check for consensus indicators
    const consensusIndicators = [
      /(?:yes|yeah|sure|agreed|sounds good|perfect|let's do it|great idea)/i,
      /(?:i agree|good idea|that works|works for me)/i,
      /(?:\+1|👍|✅)/,
    ]

    // Check if there's consensus in recent messages
    const hasConsensus = messages.slice(0, 3).some(msg =>
      consensusIndicators.some(indicator => indicator.test(msg.message))
    )

    // If using Mistral API with Vercel AI SDK
    const mistralKey = Deno.env.get('MISTRAL_API_KEY')

    if (mistralKey && config.model_provider === 'mistral') {
      console.log('Making Mistral API call using Vercel AI SDK')

      // Initialize Mistral provider
      const mistral = createMistral({
        apiKey: mistralKey,
      })

      // Define the schema for the suggestion with enriched data
      const suggestionSchema = z.object({
        should_suggest: z.boolean().describe('Whether a suggestion should be created'),
        suggestion_type: z.enum(['add', 'modify', 'remove', 'reorganize']).optional().describe('Type of change to make'),
        title: z.string().optional().describe('Short title for the suggestion'),
        description: z.string().optional().describe('Detailed description of the change'),
        proposed_content: z.any().optional().describe('The proposed new document structure'),
        ai_reasoning: z.string().optional().describe('Explanation of why this change was suggested'),
        // Enriched data fields
        enriched_data: z.object({
          quick_facts: z.array(z.string()).optional().describe('Key facts about the place or activity'),
          highlights: z.array(z.string()).optional().describe('Main attractions or features'),
          why_visit: z.string().optional().describe('Compelling reasons to visit'),
          best_for: z.array(z.string()).optional().describe('Types of travelers who would enjoy this'),
          historical_context: z.string().optional().describe('Historical significance if applicable'),
        }).optional().describe('Rich contextual information about the suggestion'),
        practical_info: z.object({
          duration: z.string().optional().describe('Typical visit duration'),
          best_time: z.string().optional().describe('Best time to visit'),
          admission: z.object({
            adults: z.string().optional(),
            children: z.string().optional(),
            notes: z.string().optional()
          }).optional().describe('Admission costs'),
          opening_hours: z.string().optional().describe('Operating hours'),
          location_details: z.object({
            address: z.string().optional(),
            distance_from_city: z.string().optional(),
            transport_options: z.array(z.string()).optional()
          }).optional(),
          accessibility: z.object({
            wheelchair: z.string().optional(),
            facilities: z.array(z.string()).optional()
          }).optional()
        }).optional().describe('Practical travel information'),
        external_resources: z.object({
          official_website: z.string().optional(),
          wikipedia_url: z.string().optional(),
          booking_link: z.string().optional()
        }).optional().describe('External links for more information')
      })

      try {
        const { object } = await generateObject({
          model: mistral(config.model_name || 'mistral-small-latest'),
          schema: suggestionSchema,
          system: `You are a knowledgeable travel planning assistant analyzing chat messages for actionable trip planning decisions.
${config.custom_instructions || ''}

Your role is to:
1. Analyze conversations for clear decisions or suggestions about trip planning
2. When specific places, attractions, or activities are mentioned, provide comprehensive information to help the team make informed decisions
3. Include practical details that travelers need (costs, hours, duration, accessibility)
4. Explain why something is worth visiting and what makes it special
5. Consider the context of the trip and suggest how it fits into the overall itinerary

Look for:
- Specific destinations or activities being suggested or agreed upon
- Times and schedules being set
- Accommodations being chosen
- Transportation being planned
- Activities being added, modified, or removed

When a specific place or attraction is mentioned (like "Kronborg Castle", "Sagrada Familia", etc.):
- Provide educational context so all team members understand what it is
- Include practical information for planning (opening hours, costs, duration)
- Explain its significance and why it might be worth visiting
- Suggest optimal timing and any booking requirements
- Consider accessibility and facilities available

Only create suggestions when there's a clear request or consensus from participants.`,
          prompt: `Recent messages (newest first):
${messages.map((m, i) => `${i + 1}. "${m.message}"`).join('\n')}

Current document structure:
${JSON.stringify(document, null, 2).slice(0, 1000)}

Analyze the conversation:
1. Is there a specific place, attraction, or activity being discussed?
2. If yes, provide comprehensive information about it to help the team make an informed decision
3. Include practical details like location, cost, duration, and best time to visit
4. Explain what makes it special or worth visiting
5. Should this trigger a document change? If yes, what specific change with rich context?

For any specific places mentioned, act as a knowledgeable guide providing context that helps team members who might not be familiar with the suggestion.`,
          temperature: config.temperature || 0.7,
        })

        console.log('Mistral AI SDK response:', object)

        if (object.should_suggest && object.suggestion_type) {
          return {
            suggestion_type: object.suggestion_type,
            title: object.title || `${object.suggestion_type} suggestion`,
            description: object.description,
            current_content: document,
            proposed_content: object.proposed_content || modifyDocument(document, object),
            chat_context: messageTexts.slice(0, 5),
            ai_reasoning: object.ai_reasoning || 'Based on team discussion',
            required_approvals: config.required_approvals || 1,
            // Include enriched data fields
            enriched_data: object.enriched_data || null,
            practical_info: object.practical_info || null,
            external_resources: object.external_resources || null,
          }
        }
      } catch (error) {
        console.error('Error calling Mistral via AI SDK:', error)
        return null
      }
    } else {
      // Fallback to pattern matching if no API key
      for (const pattern of patterns) {
        const match = combinedText.match(pattern.regex)
        if (match && hasConsensus) {
          // Create a simple suggestion based on pattern matching
          const suggestionTitle = match[1] ?
            `${pattern.type === 'add' ? 'Add' : pattern.type === 'modify' ? 'Modify' : pattern.type === 'remove' ? 'Remove' : 'Reorganize'}: ${match[1]}` :
            `${pattern.type} suggestion`

          return {
            suggestion_type: pattern.type,
            title: suggestionTitle,
            description: `Based on the team discussion: "${match[0]}"`,
            current_content: document,
            proposed_content: modifyDocument(document, {
              type: pattern.type,
              content: match[0]
            }),
            chat_context: messageTexts.slice(0, 5),
            ai_reasoning: `The team discussed and agreed on this change. Multiple participants showed consensus.`,
            required_approvals: config.required_approvals || 1,
          }
        }
      }
    }

    return null
  } catch (error) {
    console.error('AI analysis error:', error)
    return null
  }
}

// Helper function to format AI suggestion as a chat message
function formatAISuggestionMessage(suggestion: any): string {
  let message = `🤖 **${suggestion.title}**\n\n`

  if (suggestion.description) {
    message += `${suggestion.description}\n\n`
  }

  // Add enriched data if available
  if (suggestion.enriched_data) {
    const data = suggestion.enriched_data

    if (data.why_visit) {
      message += `**Why Visit:** ${data.why_visit}\n\n`
    }

    if (data.quick_facts && data.quick_facts.length > 0) {
      message += `**Quick Facts:**\n`
      data.quick_facts.forEach((fact: string) => {
        message += `• ${fact}\n`
      })
      message += `\n`
    }

    if (data.highlights && data.highlights.length > 0) {
      message += `**Highlights:**\n`
      data.highlights.forEach((highlight: string) => {
        message += `• ${highlight}\n`
      })
      message += `\n`
    }
  }

  // Add practical info if available
  if (suggestion.practical_info) {
    const info = suggestion.practical_info

    if (info.duration) {
      message += `⏱ **Duration:** ${info.duration}\n`
    }

    if (info.best_time) {
      message += `📅 **Best Time:** ${info.best_time}\n`
    }

    if (info.admission) {
      message += `💰 **Admission:** `
      if (info.admission.adults) message += `Adults: ${info.admission.adults}`
      if (info.admission.children) message += `, Children: ${info.admission.children}`
      message += `\n`
    }

    if (info.opening_hours) {
      message += `🕒 **Hours:** ${info.opening_hours}\n`
    }
  }

  message += `\n💡 *Click to view full suggestion details and vote*`

  return message
}

// Helper function to modify document
function modifyDocument(document: any, change: any): any {
  // Clone the document
  const newDoc = JSON.parse(JSON.stringify(document || { type: 'doc', content: [] }))

  // Ensure content array exists
  if (!newDoc.content) {
    newDoc.content = []
  }

  // Add a placeholder for the suggested change
  // In production, this would intelligently modify the document structure
  newDoc.content.push({
    type: 'paragraph',
    content: [{
      type: 'text',
      text: `[AI Suggested ${change.type || 'Change'}: ${change.content || change.title || 'New content'}]`,
      marks: [{ type: 'bold' }]
    }]
  })

  return newDoc
}
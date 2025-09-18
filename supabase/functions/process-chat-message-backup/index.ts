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
  proposal_type: 'add' | 'modify' | 'remove' | 'reorganize'
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

      // Create AI proposal in database with source message reference
      const { data: createdProposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
          trip_id,
          created_by: AI_AGENT_USER_ID,
          source_message_id: message_id, // Link to the message that triggered this proposal
          ...suggestion,
          required_approvals: config.required_approvals,
        })
        .select()
        .single()

      if (proposalError) {
        console.error('Failed to create proposal:', proposalError)
        throw new Error(`Failed to create proposal: ${proposalError.message}`)
      }

      console.log('Created proposal:', createdProposal)

      // Create a chat message from the AI agent as a reply to the triggering message
      const aiMessageText = formatAIProposalMessage(suggestion)

      // Use service role client for AI agent operations
      const { data: aiChatMessage, error: chatError } = await supabase
        .from('trip_chat_messages')
        .insert({
          trip_id,
          user_id: AI_AGENT_USER_ID,
          message: aiMessageText,
          reply_to: message_id, // Thread this as a reply to the original message
          metadata: {
            type: 'ai_proposal',
            proposal_id: createdProposal.id,
            proposal_type: suggestion.proposal_type,
          },
        })
        .select()
        .single()

      if (chatError) {
        console.error('Failed to create AI chat message:', JSON.stringify(chatError, null, 2))
        console.error('Chat message details:', {
          trip_id,
          user_id: AI_AGENT_USER_ID,
          message_length: aiMessageText.length,
          reply_to: message_id,
        })
        // Don't throw here - the proposal was created successfully
      } else {
        console.log('Created AI chat message:', aiChatMessage)
      }

      return new Response(
        JSON.stringify({
          success: true,
          proposal_created: true,
          proposal_id: createdProposal.id
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, proposal_created: false }),
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
        proposal_type: z.enum(['add', 'modify', 'remove', 'reorganize']).optional().describe('Type of change to make'),
        title: z.string().optional().describe('Short title for the suggestion'),
        description: z.string().optional().describe('Detailed description of the change'),
        proposed_content: z.any().optional().describe('The proposed new document structure'),
        ai_reasoning: z.string().optional().describe('Explanation of why this change was suggested'),
        has_timing: z.boolean().optional().describe('Whether specific timing is mentioned'),
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
1. Recognize ALL trip planning decisions and agreements
2. Understand various types of decisions: destinations, meeting points, activities, meals, accommodation
3. Detect when the team has agreed on something concrete
4. Create appropriate document entries for different decision types

Common patterns to recognize:
DESTINATIONS & ACTIVITIES:
- "We want to visit [place]" → Add to wishes/itinerary
- "Let's go to [place]" → Add to wishes/itinerary
- "Should we see [place]?" → Consider for discussion

LOGISTICS & PLANNING:
- "We've agreed to meet at [place] at [time]" → Add meeting point to itinerary
- "Let's meet at [place]" → Add meeting arrangement
- "We should stay at [hotel]" → Add accommodation
- "Dinner at [restaurant]" → Add meal plan
- "Take the train at [time]" → Add transportation

TIMING DECISIONS:
- "We have agreed to..." → Something has been decided
- "Let's do X at [time]" → Scheduled activity
- "Meet at [time]" → Time-specific arrangement

When creating suggestions:
- For logistics: Use simple, clear titles (e.g., "Meet at Copenhagen Central Station")
- For activities: Use the place/activity name
- Include timing if specified
- Mark as decision if there's clear agreement or consensus`,
          prompt: `Recent messages (newest first):
${messages.map((m, i) => `${i + 1}. "${m.message}"`).join('\n')}

Current document structure:
${JSON.stringify(document, null, 2).slice(0, 1000)}

Analyze the latest message for ANY trip planning decision:

1. MEETING ARRANGEMENTS:
   - "agreed to meet at [place] at [time]" → Create suggestion
   - "meet at [place]" → Create suggestion
   - Look for words: meet, meeting, gather, rendezvous

2. DESTINATIONS & ATTRACTIONS:
   - Any mention of visiting places
   - Tourist attractions, museums, restaurants, etc.

3. LOGISTICS:
   - Transportation arrangements
   - Accommodation decisions
   - Meal plans

4. TIMING:
   - If specific time mentioned → has_timing = true
   - Include in itinerary section with time

For meeting arrangements:
- Title: Generate the EXACT text to display (e.g., "Meet at Copenhagen Central Station")
- Do NOT add "Visit" to meeting arrangements
- For places without action verbs, add "Visit" (e.g., "Visit Kronborg Castle")

Examples of good titles:
- "Meet at Copenhagen Central Station" (has action verb)
- "Check in at Hotel Nordic" (has action verb)
- "Dinner at Restaurant Noma" (descriptive enough)
- "Visit Kronborg Castle" (needs action verb)
- "Visit Louisiana Museum" (needs action verb)

IMPORTANT:
- The title will be used as-is in the document
- Create suggestions for concrete decisions only
- Set has_timing: true if specific time is mentioned`,
          temperature: config.temperature || 0.7,
        })

        console.log('Mistral AI SDK response:', object)

        if (object.should_suggest && object.proposal_type) {
          // Always use modifyDocument to ensure proper structure
          // The AI's proposed_content is often malformed, so we'll build it properly
          const proposedDoc = modifyDocument(document, {
            type: object.proposal_type,
            title: object.title,
            description: object.description,
            content: object.description || object.title,
            enriched_data: object.enriched_data,
            practical_info: object.practical_info,
            has_timing: object.has_timing,
          })

          return {
            proposal_type: object.proposal_type,
            title: object.title || `${object.proposal_type} proposal`,
            description: object.description,
            current_content: document,
            proposed_content: proposedDoc,
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
            proposal_type: pattern.type,
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

// Helper function to format AI proposal as a chat message
function formatAIProposalMessage(suggestion: any): string {
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

  message += `\n💡 *Click to view full proposal details and vote*`

  return message
}

// Helper function to modify document
function modifyDocument(document: any, change: any): any {
  // Start with existing document or create new one
  const newDoc = document ? JSON.parse(JSON.stringify(document)) : { type: 'doc', content: [] }

  // Ensure proper document structure
  if (!newDoc.type) newDoc.type = 'doc'
  if (!newDoc.content || !Array.isArray(newDoc.content)) {
    newDoc.content = []
  }

  // Initialize document with sections if empty
  if (newDoc.content.length === 0) {
    // Main title
    newDoc.content.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{
        type: 'text',
        text: 'Trip Plan'
      }]
    })

    // Wishes & Ideas section
    newDoc.content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{
        type: 'text',
        text: 'Wishes & Ideas'
      }]
    })

    // Empty paragraph for wishes section
    newDoc.content.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Things we want to do (not yet scheduled):',
        marks: [{ type: 'italic' }]
      }]
    })

    // Itinerary section
    newDoc.content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{
        type: 'text',
        text: 'Itinerary'
      }]
    })
  }

  // Check if suggestion includes timing information
  const hasSpecificTiming = change.has_timing ||
    (change.description && /\b(day \d+|morning|afternoon|evening|\d{1,2}:\d{2}|\d{1,2}(am|pm))\b/i.test(change.description))

  if (change.type === 'add') {
    const placeName = change.title || 'New Destination'

    if (!hasSpecificTiming) {
      // Add to Wishes & Ideas section
      let wishesSection = -1
      let itinerarySection = -1

      // Find section indices
      newDoc.content.forEach((node: any, index: number) => {
        if (node.type === 'heading' && node.attrs?.level === 2) {
          const text = node.content?.[0]?.text
          if (text === 'Wishes & Ideas') wishesSection = index
          if (text === 'Itinerary') itinerarySection = index
        }
      })

      // Ensure wishes section exists
      if (wishesSection === -1) {
        // Insert before itinerary if it exists, otherwise at end
        const insertIndex = itinerarySection > -1 ? itinerarySection : newDoc.content.length

        newDoc.content.splice(insertIndex, 0, {
          type: 'heading',
          attrs: { level: 2 },
          content: [{
            type: 'text',
            text: 'Wishes & Ideas'
          }]
        })
        wishesSection = insertIndex
        if (itinerarySection > -1) itinerarySection++
      }

      // Find or create bullet list after wishes heading
      let bulletListIndex = -1
      for (let i = wishesSection + 1; i < newDoc.content.length && i < wishesSection + 3; i++) {
        if (newDoc.content[i].type === 'bulletList') {
          bulletListIndex = i
          break
        }
      }

      if (bulletListIndex === -1) {
        // Create new bullet list
        const insertAt = Math.min(wishesSection + 2,
          itinerarySection > -1 ? itinerarySection : newDoc.content.length)

        newDoc.content.splice(insertAt, 0, {
          type: 'bulletList',
          content: []
        })
        bulletListIndex = insertAt
      }

      // Add wish as bullet point - use title as-is
      newDoc.content[bulletListIndex].content.push({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: placeName
          }]
        }]
      })

    } else {
      // Add to Itinerary section with timing
      let itinerarySection = -1

      // Find itinerary section
      newDoc.content.forEach((node: any, index: number) => {
        if (node.type === 'heading' && node.attrs?.level === 2 &&
            node.content?.[0]?.text === 'Itinerary') {
          itinerarySection = index
        }
      })

      // Ensure itinerary section exists
      if (itinerarySection === -1) {
        newDoc.content.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{
            type: 'text',
            text: 'Itinerary'
          }]
        })
        itinerarySection = newDoc.content.length - 1
      }

      // Extract day/time if available
      let dayMatch = change.description?.match(/day (\d+)/i)
      let timeMatch = change.description?.match(/(\d{1,2}:\d{2}|\d{1,2}\s*(am|pm))/i)

      const dayText = dayMatch ? `Day ${dayMatch[1]}` : 'Day 1'
      const timeText = timeMatch ? timeMatch[0] : ''

      // Find or create day heading
      let dayHeadingIndex = -1
      for (let i = itinerarySection + 1; i < newDoc.content.length; i++) {
        const node = newDoc.content[i]
        if (node.type === 'heading' && node.attrs?.level === 3 &&
            node.content?.[0]?.text === dayText) {
          dayHeadingIndex = i
          break
        }
        // Stop if we hit another h2
        if (node.type === 'heading' && node.attrs?.level === 2) break
      }

      if (dayHeadingIndex === -1) {
        // Add day heading after itinerary
        newDoc.content.splice(itinerarySection + 1, 0, {
          type: 'heading',
          attrs: { level: 3 },
          content: [{
            type: 'text',
            text: dayText
          }]
        })
        dayHeadingIndex = itinerarySection + 1
      }

      // Use the title as-is - the AI should have generated the exact text
      const itemText = timeText ? `${timeText} - ${placeName}` : placeName

      // Find or create bullet list for this day
      let dayBulletListIndex = -1
      for (let i = dayHeadingIndex + 1; i < newDoc.content.length; i++) {
        if (newDoc.content[i].type === 'bulletList') {
          dayBulletListIndex = i
          break
        }
        // Stop if we hit another heading
        if (newDoc.content[i].type === 'heading') break
      }

      if (dayBulletListIndex === -1) {
        // Create bullet list after day heading
        newDoc.content.splice(dayHeadingIndex + 1, 0, {
          type: 'bulletList',
          content: []
        })
        dayBulletListIndex = dayHeadingIndex + 1
      }

      // Add to bullet list
      newDoc.content[dayBulletListIndex].content.push({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: itemText
          }]
        }]
      })
    }

  } else if (change.type === 'modify') {
    // Handle modifications
    const modifyText = change.description || change.title || 'item'
    newDoc.content.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: `Modified: ${modifyText}`,
        marks: [{ type: 'italic' }]
      }]
    })
  } else if (change.type === 'remove') {
    // Handle removals
    const removeText = change.description || change.title || 'item'
    newDoc.content.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: `Removed: ${removeText}`,
        marks: [{ type: 'strike' }]
      }]
    })
  }

  return newDoc
}
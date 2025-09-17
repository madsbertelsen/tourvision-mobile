import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create admin client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })

    const { suggestionId } = await req.json()

    if (!suggestionId) {
      throw new Error('suggestionId is required')
    }

    console.log('Applying suggestion:', suggestionId)

    // First, update the approval count manually
    const { data: votes, error: votesError } = await supabase
      .from('suggestion_votes')
      .select('vote')
      .eq('suggestion_id', suggestionId)

    if (votesError) {
      throw votesError
    }

    const approvalCount = votes.filter(v => v.vote === 'approve').length
    const rejectionCount = votes.filter(v => v.vote === 'reject').length

    console.log('Vote counts:', { approvalCount, rejectionCount })

    // Just update the counts first, don't change status yet
    const { error: countUpdateError } = await supabase
      .from('ai_suggestions')
      .update({
        approval_count: approvalCount,
        rejection_count: rejectionCount
      })
      .eq('id', suggestionId)

    if (countUpdateError) {
      throw countUpdateError
    }

    console.log('Updated vote counts:', { approvalCount, rejectionCount })

    // Get the suggestion with its trip info
    const { data: suggestion, error: suggestionError } = await supabase
      .from('ai_suggestions')
      .select(`
        *,
        trips!inner (
          id,
          itinerary_document
        )
      `)
      .eq('id', suggestionId)
      .single()

    if (suggestionError) {
      throw suggestionError
    }

    // Get the AI config to check required approvals
    const { data: config } = await supabase
      .from('ai_agent_config')
      .select('required_approvals')
      .eq('trip_id', suggestion.trip_id)
      .single()

    const requiredApprovals = config?.required_approvals || suggestion.required_approvals || 1

    console.log('Required approvals:', requiredApprovals, 'Current approvals:', approvalCount)
    console.log('Suggestion status before processing:', suggestion.status)

    // Check if we have enough approvals to apply (and not already applied)
    if (approvalCount >= requiredApprovals && suggestion.status !== 'applied') {
      console.log('Applying suggestion to document...')
      console.log('Current document:', suggestion.trips.itinerary_document)
      console.log('Proposed content:', suggestion.proposed_content)

      // Create new version in document history
      const { data: maxVersion } = await supabase
        .from('document_history')
        .select('version_number')
        .eq('trip_id', suggestion.trip_id)
        .order('version_number', { ascending: false })
        .limit(1)
        .single()

      const newVersionNumber = (maxVersion?.version_number || 0) + 1

      // Save current version to history
      const { error: historyError } = await supabase
        .from('document_history')
        .insert({
          trip_id: suggestion.trip_id,
          version_number: newVersionNumber,
          document_content: suggestion.trips.itinerary_document,
          changed_by: suggestion.created_by,
          change_type: 'ai_suggestion',
          suggestion_id: suggestion.id,
          change_description: suggestion.title
        })

      if (historyError) {
        console.error('Error saving to history:', historyError)
        // Continue anyway - history is not critical
      }

      // Apply the suggestion to the trip document
      const { error: tripUpdateError } = await supabase
        .from('trips')
        .update({
          itinerary_document: suggestion.proposed_content,
          updated_at: new Date().toISOString()
        })
        .eq('id', suggestion.trip_id)

      if (tripUpdateError) {
        throw tripUpdateError
      }

      // Mark suggestion as applied
      const { error: statusError } = await supabase
        .from('ai_suggestions')
        .update({
          status: 'applied',
          approved_at: new Date().toISOString(),
          applied_at: new Date().toISOString()
        })
        .eq('id', suggestionId)

      if (statusError) {
        throw statusError
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Suggestion applied successfully',
          appliedAt: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    } else if (approvalCount >= requiredApprovals && suggestion.status === 'approved') {
      // Already approved, just mark as applied
      const { error: statusError } = await supabase
        .from('ai_suggestions')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString()
        })
        .eq('id', suggestionId)

      if (statusError) {
        throw statusError
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Suggestion already approved, marked as applied'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    } else {
      // Mark as approved but don't apply yet
      if (suggestion.status === 'pending') {
        const { error: statusError } = await supabase
          .from('ai_suggestions')
          .update({
            status: 'approved',
            approved_at: new Date().toISOString()
          })
          .eq('id', suggestionId)

        if (statusError) {
          throw statusError
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Suggestion needs ${requiredApprovals - approvalCount} more approvals`,
          approvalCount,
          requiredApprovals
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }
  } catch (error) {
    console.error('Error applying suggestion:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
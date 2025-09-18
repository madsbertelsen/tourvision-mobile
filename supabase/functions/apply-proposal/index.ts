import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { proposalId } = await req.json()
    console.log('[Info] Applying proposal:', proposalId)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Begin a transaction-like operation
    // 1. Get the proposal with its operations
    const { data: proposal, error: fetchError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single()

    if (fetchError) throw fetchError
    if (!proposal) throw new Error('Proposal not found')

    // Check if already applied
    if (proposal.status === 'applied') {
      return new Response(
        JSON.stringify({ success: true, message: 'Proposal already applied' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Count approval votes from proposal_votes table
    const { count: approvalCount, error: countError } = await supabase
      .from('proposal_votes')
      .select('*', { count: 'exact', head: true })
      .eq('proposal_id', proposalId)
      .eq('vote_type', 'approve')

    if (countError) throw countError

    const currentApprovals = approvalCount || 0

    // Check if approved (has enough votes)
    if (currentApprovals < proposal.required_approvals && proposal.status !== 'approved') {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Proposal needs ${proposal.required_approvals - currentApprovals} more approvals`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Get the current trip document
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('itinerary_document')
      .eq('id', proposal.trip_id)
      .single()

    if (tripError) throw tripError
    if (!trip) throw new Error('Trip not found')

    let updatedDocument = trip.itinerary_document || { type: 'doc', content: [] }

    // 3. Apply the transaction or diff operations to create the final document
    if (proposal.transaction_steps) {
      // New ProseMirror transaction approach
      console.log('[Info] Applying ProseMirror transaction steps')

      // The proposed_content should contain the already transformed document from process-document-with-ai
      if (proposal.proposed_content) {
        updatedDocument = proposal.proposed_content
      } else {
        throw new Error('No proposed_content found with transaction steps')
      }
    } else if (proposal.proposal_operations && Array.isArray(proposal.proposal_operations)) {
      // Legacy diff operations approach
      console.log('[Info] Applying diff operations:', proposal.proposal_operations.length)

      // Apply operations to document
      updatedDocument = applyDiffOperations(updatedDocument, proposal.proposal_operations)
    } else if (proposal.proposed_content) {
      // Fallback to direct replacement if no operations
      console.log('[Info] Using direct document replacement (legacy)')
      updatedDocument = proposal.proposed_content
    } else {
      throw new Error('No operations or proposed content found')
    }

    // 4. Update the trip document
    const { error: updateError } = await supabase
      .from('trips')
      .update({
        itinerary_document: updatedDocument,
        updated_at: new Date().toISOString()
      })
      .eq('id', proposal.trip_id)

    if (updateError) throw updateError

    // 5. Mark the proposal as approved (since 'applied' is not a valid status)
    // We use the applied_at field to track that it has been applied to the document
    const { error: proposalUpdateError } = await supabase
      .from('proposals')
      .update({
        status: 'approved',
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', proposalId)

    if (proposalUpdateError) throw proposalUpdateError

    console.log('[Info] Successfully applied proposal:', proposalId)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Proposal applied successfully',
        proposalId,
        operations: proposal.proposal_operations?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Error] Failed to apply proposal:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Apply diff operations to a document
function applyDiffOperations(doc: any, operations: any[]): any {
  // Clone the document to avoid mutations
  const newDoc = JSON.parse(JSON.stringify(doc))

  // Sort operations by path index (apply from end to start to maintain positions)
  const sortedOps = [...operations].sort((a, b) => {
    const aIndex = a.path && a.path[0] ? a.path[0] : 0
    const bIndex = b.path && b.path[0] ? b.path[0] : 0
    return bIndex - aIndex
  })

  for (const op of sortedOps) {
    console.log('[Info] Applying operation:', op.type, 'at path', op.path)

    switch (op.type) {
      case 'insert': {
        // For path-based operations, insert at the specified index in content array
        if (op.path && op.path.length > 0 && op.newValue) {
          const index = op.path[0]
          if (!newDoc.content) {
            newDoc.content = []
          }
          // Insert at the specified index
          newDoc.content.splice(index, 0, op.newValue)
        }
        break
      }

      case 'delete': {
        // Remove content at path
        if (op.path && op.path.length > 0) {
          const index = op.path[0]
          if (newDoc.content && index < newDoc.content.length) {
            newDoc.content.splice(index, 1)
          }
        }
        break
      }

      case 'replace': {
        // Replace content at path
        if (op.path && op.path.length > 0 && op.newValue) {
          const index = op.path[0]
          if (!newDoc.content) {
            newDoc.content = []
          }
          if (index < newDoc.content.length) {
            newDoc.content[index] = op.newValue
          } else {
            newDoc.content.push(op.newValue)
          }
        }
        break
      }
    }
  }

  return newDoc
}

// Helper to find a position in the document tree
function findPositionInDoc(doc: any, offset: number): any {
  let currentPos = 0

  function traverse(node: any, parent: any = null, index: number = 0): any {
    // Count text length
    if (node.type === 'text') {
      const len = node.text?.length || 0
      if (currentPos + len >= offset) {
        return { node, parent, index, offset: offset - currentPos }
      }
      currentPos += len
    }

    // Traverse children
    if (node.content && Array.isArray(node.content)) {
      for (let i = 0; i < node.content.length; i++) {
        const result = traverse(node.content[i], node, i)
        if (result) return result
      }
    }

    return null
  }

  return traverse(doc)
}

// Helper to insert content
function insertContent(parent: any, index: number, content: any) {
  if (!parent || !parent.content) return

  if (typeof content === 'string') {
    // Insert text
    const textNode = { type: 'text', text: content }
    parent.content.splice(index, 0, textNode)
  } else if (Array.isArray(content)) {
    // Insert multiple nodes
    parent.content.splice(index, 0, ...content)
  } else {
    // Insert single node
    parent.content.splice(index, 0, content)
  }
}

// Helper to delete content
function deleteContent(doc: any, start: any, end: any) {
  if (!start.parent || !start.parent.content) return

  if (start.parent === end.parent) {
    // Simple case: deletion within same parent
    const deleteCount = end.index - start.index + 1
    start.parent.content.splice(start.index, deleteCount)
  } else {
    // Complex case: deletion across multiple parents
    // For now, just delete from start parent
    start.parent.content.splice(start.index, 1)
  }
}
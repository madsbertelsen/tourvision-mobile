import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createMistral } from 'https://esm.sh/@ai-sdk/mistral@1.0.7'
import { generateObject } from 'https://esm.sh/ai@4.0.20'
import { z } from 'https://esm.sh/zod@3.21.4'
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Schema for AI to generate document operations using HTML IDs
const operationSchema = z.object({
  operation: z.enum(['insert_before', 'insert_after', 'replace', 'delete']),
  target_id: z.string().describe('The ID of the target element (e.g., "node-3")'),
  html_content: z.string().optional().describe('HTML content to insert/replace (with id attributes for new elements)'),
  description: z.string().describe('Brief description of the change'),
  reasoning: z.string().describe('Why this change makes sense'),
})

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  try {
    const { htmlDocument, prompt } = await req.json()
    console.log('[Info] Processing HTML modification request:', { prompt })

    if (!htmlDocument || !prompt) {
      throw new Error('htmlDocument and prompt are required')
    }

    // Get Mistral API key
    const mistralKey = Deno.env.get('MISTRAL_API_KEY')
    if (!mistralKey) {
      throw new Error('MISTRAL_API_KEY not configured')
    }

    const mistral = createMistral({ apiKey: mistralKey })

    console.log('[Info] HTML document length:', htmlDocument.length)

    // Use AI to determine what operation to perform
    const { object: operation } = await generateObject({
      model: mistral('mistral-small-latest'),
      schema: operationSchema,
      messages: [
        { role: 'system', content: `You are a document editor. Analyze the HTML document and user request to determine how to modify it.

Guidelines:
- Each element has an id attribute (e.g., id="node-0", id="node-1", etc.)
- When creating new elements, use 'node-new-X' format for IDs
- Maintain proper HTML structure
- For multi-element insertions, provide complete HTML

Examples:
- "Add Day 2" → insert_after the Day 1 content
- "Remove Day 3" → delete the Day 3 heading and its content
- "Change title" → replace the main heading` },
        { role: 'user', content: `Current HTML document:
${htmlDocument}

User request: "${prompt}"

Determine the operation to perform and provide the necessary details.` }
      ],
      temperature: 0.3,
    })

    console.log('[Info] AI operation:', operation)

    // Parse the HTML document
    const doc = new DOMParser().parseFromString(htmlDocument, 'text/html')
    if (!doc) {
      throw new Error('Failed to parse HTML document')
    }

    // Track changes for the response
    const changes: Array<{ type: string; elementIds: string[]; description: string }> = []

    // Apply the operation to the DOM
    switch (operation.operation) {
      case 'insert_before': {
        const targetElement = doc.getElementById(operation.target_id)
        if (!targetElement) {
          console.warn(`[Warning] Target element not found: ${operation.target_id}`)
          // For empty documents, insert at the beginning of body
          const body = doc.body
          if (body && operation.html_content) {
            const tempDoc = new DOMParser().parseFromString(operation.html_content, 'text/html')
            const newElements = Array.from(tempDoc.body?.childNodes || [])
            const addedIds: string[] = []

            newElements.forEach(node => {
              if (node.nodeType === 1) { // Element node
                const element = node as Element
                element.setAttribute('data-change-type', 'added')
                const id = element.getAttribute('id')
                if (id) addedIds.push(id)
                body.appendChild(node.cloneNode(true))
              }
            })

            changes.push({
              type: 'added',
              elementIds: addedIds,
              description: operation.description
            })
          }
        } else if (operation.html_content) {
          const tempDoc = new DOMParser().parseFromString(operation.html_content, 'text/html')
          const newElements = Array.from(tempDoc.body?.childNodes || [])
          const addedIds: string[] = []

          newElements.forEach(node => {
            if (node.nodeType === 1) { // Element node
              const element = node as Element
              element.setAttribute('data-change-type', 'added')
              const id = element.getAttribute('id')
              if (id) addedIds.push(id)
              targetElement.parentNode?.insertBefore(node.cloneNode(true), targetElement)
            }
          })

          changes.push({
            type: 'added',
            elementIds: addedIds,
            description: operation.description
          })
        }
        break
      }

      case 'insert_after': {
        const targetElement = doc.getElementById(operation.target_id)
        if (targetElement && operation.html_content) {
          const tempDoc = new DOMParser().parseFromString(operation.html_content, 'text/html')
          const newElements = Array.from(tempDoc.body?.childNodes || [])
          const addedIds: string[] = []

          newElements.forEach(node => {
            if (node.nodeType === 1) { // Element node
              const element = node as Element
              element.setAttribute('data-change-type', 'added')
              const id = element.getAttribute('id')
              if (id) addedIds.push(id)

              if (targetElement.nextSibling) {
                targetElement.parentNode?.insertBefore(node.cloneNode(true), targetElement.nextSibling)
              } else {
                targetElement.parentNode?.appendChild(node.cloneNode(true))
              }
            }
          })

          changes.push({
            type: 'added',
            elementIds: addedIds,
            description: operation.description
          })
        }
        break
      }

      case 'replace': {
        const targetElement = doc.getElementById(operation.target_id)
        if (targetElement && operation.html_content) {
          const tempDoc = new DOMParser().parseFromString(operation.html_content, 'text/html')
          const newElement = tempDoc.body?.firstElementChild

          if (newElement) {
            newElement.setAttribute('data-change-type', 'modified')
            targetElement.parentNode?.replaceChild(newElement.cloneNode(true), targetElement)

            changes.push({
              type: 'modified',
              elementIds: [operation.target_id],
              description: operation.description
            })
          }
        }
        break
      }

      case 'delete': {
        const targetElement = doc.getElementById(operation.target_id)
        if (targetElement) {
          targetElement.parentNode?.removeChild(targetElement)

          changes.push({
            type: 'deleted',
            elementIds: [operation.target_id],
            description: operation.description
          })
        }
        break
      }
    }

    // Get the modified HTML
    const modifiedHtml = doc.body?.innerHTML || ''

    console.log('[Info] Changes applied:', changes.length)

    return new Response(
      JSON.stringify({
        success: true,
        modifiedHtml,
        changes,
        description: operation.description,
        reasoning: operation.reasoning,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[Error] Processing failed:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
import { NextRequest, NextResponse } from 'next/server';
import { createMistral } from '@ai-sdk/mistral';
import { generateObject } from 'ai';
import { z } from 'zod';
import * as cheerio from 'cheerio';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Schema for AI to generate document operations using HTML IDs
const operationSchema = z.object({
  operation: z.enum(['insert_before', 'insert_after', 'replace', 'delete']),
  target_id: z.string().describe('The ID of the target element (e.g., "node-3")'),
  html_content: z.string().optional().describe('HTML content to insert/replace (with id attributes for new elements)'),
  description: z.string().describe('Brief description of the change'),
  reasoning: z.string().describe('Why this change makes sense'),
});

export async function POST(req: NextRequest) {
  try {
    const { htmlDocument, prompt } = await req.json();
    console.log('[Info] Processing HTML modification request:', { prompt });

    if (!htmlDocument || !prompt) {
      return NextResponse.json(
        { success: false, error: 'htmlDocument and prompt are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get Mistral API key
    const mistralKey = process.env.MISTRAL_API_KEY;
    if (!mistralKey) {
      return NextResponse.json(
        { success: false, error: 'MISTRAL_API_KEY not configured' },
        { status: 500, headers: corsHeaders }
      );
    }

    const mistral = createMistral({ apiKey: mistralKey });

    console.log('[Info] HTML document length:', htmlDocument.length);

    // Use AI to determine what operation to perform
    const { object: operation } = await generateObject({
      model: mistral('mistral-small-latest'),
      schema: operationSchema,
      messages: [
        {
          role: 'system',
          content: `You are a document editor. Analyze the HTML document and user request to determine how to modify it.

Guidelines:
- Each element has an id attribute (e.g., id="node-0", id="node-1", etc.)
- When creating new elements, use 'node-new-X' format for IDs
- Maintain proper HTML structure
- For multi-element insertions, provide complete HTML
- IMPORTANT: When adding known locations (like Eiffel Tower, Louvre, etc.), wrap them in geo-location marks using this format:
  <span class="geo-mark" data-geo="true" data-lat="LATITUDE" data-lng="LONGITUDE" data-place-name="PLACE NAME" title="📍 PLACE NAME">PLACE NAME</span>

Known locations with coordinates:
- Eiffel Tower: lat="48.8584" lng="2.2945"
- Louvre Museum: lat="48.8606" lng="2.3376"
- Arc de Triomphe: lat="48.8738" lng="2.2950"
- Notre-Dame: lat="48.8530" lng="2.3499"
- Sacré-Cœur: lat="48.8867" lng="2.3431"
- Montmartre: lat="48.8867" lng="2.3431"
- Versailles: lat="48.8049" lng="2.1204"
- Champs-Élysées: lat="48.8698" lng="2.3078"

Examples:
- "Add visit to Eiffel Tower" → Create content with: Visit the <span class="geo-mark" data-geo="true" data-lat="48.8584" data-lng="2.2945" data-place-name="Eiffel Tower" title="📍 Eiffel Tower">Eiffel Tower</span>
- "Add Day 2" → insert_after the Day 1 content
- "Remove Day 3" → delete the Day 3 heading and its content`
        },
        {
          role: 'user',
          content: `Current HTML document:
${htmlDocument}

User request: "${prompt}"

Determine the operation to perform and provide the necessary details. Remember to add geo-location marks for any known places.`
        }
      ],
      temperature: 0.3,
    });

    console.log('[Info] AI operation:', operation);

    // Parse the HTML document using cheerio
    const $ = cheerio.load(htmlDocument);

    // Track changes for the response
    const changes: Array<{ type: string; elementIds: string[]; description: string }> = [];

    // Apply the operation to the DOM
    switch (operation.operation) {
      case 'insert_before': {
        const targetElement = $(`#${operation.target_id}`);
        if (targetElement.length === 0) {
          console.warn(`[Warning] Target element not found: ${operation.target_id}`);
          // For empty documents, insert at the beginning of body
          if (operation.html_content) {
            const newContent = cheerio.load(operation.html_content);
            const addedIds: string[] = [];

            newContent('body').children().each((_, elem) => {
              const $elem = $(elem);
              $elem.attr('data-change-type', 'added');
              const id = $elem.attr('id');
              if (id) addedIds.push(id);
              $('body').append($.html($elem));
            });

            changes.push({
              type: 'added',
              elementIds: addedIds,
              description: operation.description
            });
          }
        } else if (operation.html_content) {
          const newContent = cheerio.load(operation.html_content);
          const addedIds: string[] = [];

          newContent('body').children().each((_, elem) => {
            const $elem = $(elem);
            $elem.attr('data-change-type', 'added');
            const id = $elem.attr('id');
            if (id) addedIds.push(id);
            targetElement.before($.html($elem));
          });

          changes.push({
            type: 'added',
            elementIds: addedIds,
            description: operation.description
          });
        }
        break;
      }

      case 'insert_after': {
        const targetElement = $(`#${operation.target_id}`);
        if (targetElement.length > 0 && operation.html_content) {
          const newContent = cheerio.load(operation.html_content);
          const addedIds: string[] = [];

          newContent('body').children().each((_, elem) => {
            const $elem = $(elem);
            $elem.attr('data-change-type', 'added');
            const id = $elem.attr('id');
            if (id) addedIds.push(id);
            targetElement.after($.html($elem));
          });

          changes.push({
            type: 'added',
            elementIds: addedIds,
            description: operation.description
          });
        }
        break;
      }

      case 'replace': {
        const targetElement = $(`#${operation.target_id}`);
        if (targetElement.length > 0 && operation.html_content) {
          const newContent = cheerio.load(operation.html_content);
          const newElement = newContent('body').children().first();

          if (newElement.length > 0) {
            newElement.attr('data-change-type', 'modified');
            targetElement.replaceWith($.html(newElement));

            changes.push({
              type: 'modified',
              elementIds: [operation.target_id],
              description: operation.description
            });
          }
        }
        break;
      }

      case 'delete': {
        const targetElement = $(`#${operation.target_id}`);
        if (targetElement.length > 0) {
          targetElement.remove();

          changes.push({
            type: 'deleted',
            elementIds: [operation.target_id],
            description: operation.description
          });
        }
        break;
      }
    }

    // Get the modified HTML
    const modifiedHtml = $('body').html() || '';

    console.log('[Info] Changes applied:', changes.length);

    return NextResponse.json({
      success: true,
      modifiedHtml,
      changes,
      description: operation.description,
      reasoning: operation.reasoning,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[Error] Processing failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An error occurred'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}
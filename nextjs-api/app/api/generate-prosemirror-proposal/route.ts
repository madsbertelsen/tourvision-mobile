import { generateObject } from 'ai';
import * as cheerio from 'cheerio';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// CORS headers - allow both localhost ports
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// Cache for geocoding results
const geocodeCache = new Map<string, { lat: string; lng: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Function to assign consistent color indices to geo marks
function assignColorIndicesToGeoMarks(html: string): string {
  const $ = cheerio.load(`<body>${html}</body>`);
  const geoMarks = $('.geo-mark');

  // Track existing color assignments and location keys
  const locationColorMap = new Map<string, number>();
  const existingColorIndices = new Set<number>();
  let nextColorIndex = 0;

  // First pass: collect existing color indices
  geoMarks.each((_, elem) => {
    const mark = $(elem);
    const existingIndex = mark.attr('data-color-index');
    if (existingIndex) {
      existingColorIndices.add(parseInt(existingIndex));
    }
  });

  // Second pass: assign color indices
  geoMarks.each((_, elem) => {
    const mark = $(elem);
    const existingIndex = mark.attr('data-color-index');

    // If already has a color index, preserve it
    if (existingIndex) {
      return;
    }

    // Create a unique key for this location
    const placeName = mark.attr('data-place-name') || mark.text();
    const lat = mark.attr('data-lat');
    const lng = mark.attr('data-lng');
    const locationKey = `${placeName}-${lat}-${lng}`;

    // Check if we've already assigned a color to this location
    if (locationColorMap.has(locationKey)) {
      mark.attr('data-color-index', locationColorMap.get(locationKey)!.toString());
    } else {
      // Find next available color index (cycle through 0-9)
      while (existingColorIndices.has(nextColorIndex % 10)) {
        nextColorIndex++;
        if (nextColorIndex >= 10) {
          // If all colors are taken, just use the next one in sequence
          nextColorIndex = locationColorMap.size % 10;
          break;
        }
      }

      const colorIndex = nextColorIndex % 10;
      locationColorMap.set(locationKey, colorIndex);
      existingColorIndices.add(colorIndex);
      mark.attr('data-color-index', colorIndex.toString());
      mark.attr('data-location-index', colorIndex.toString()); // For backward compatibility
      nextColorIndex++;
    }
  });

  return $('body').html() || '';
}

async function enrichCoordinates(html: string, apiKey: string): Promise<string> {
  const $ = cheerio.load(`<body>${html}</body>`);
  // Always enrich ALL geo-marks to ensure accurate coordinates from Google Places API
  const geoMarks = $('.geo-mark[data-geo="true"]');

  console.log(`[Info] Found ${geoMarks.length} geo-marks to enrich with Google Places API`);

  // Process each geo-mark to get accurate coordinates from Google Places API
  for (let i = 0; i < geoMarks.length; i++) {
    const mark = $(geoMarks[i]);
    const placeName = mark.attr('data-place-name');

    if (!placeName) continue;

    // Check cache first
    const cacheKey = placeName;
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[Cache] Using cached coordinates for: ${placeName}`);
      mark.attr('data-lat', cached.lat);
      mark.attr('data-lng', cached.lng);
      continue;
    }

    try {
      console.log(`[Places API] Searching for: ${placeName}`);

      // Build the API URL - search purely by name for accuracy
      // Not using location bias since we want real-world coordinates from Google Places
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(placeName)}&key=${apiKey}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[Places API] Error for ${placeName}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const place = data.results[0];
        const lat = place.geometry.location.lat.toString();
        const lng = place.geometry.location.lng.toString();

        console.log(`[Places API] Found coordinates for ${placeName}: ${lat}, ${lng}`);

        // Update the mark with precise coordinates
        mark.attr('data-lat', lat);
        mark.attr('data-lng', lng);

        // Cache the result
        geocodeCache.set(cacheKey, { lat, lng, timestamp: Date.now() });
      } else {
        console.warn(`[Places API] No results for: ${placeName}`);
        // Keep as PENDING if we can't find coordinates
        // This ensures we don't use unreliable LLM-generated coordinates
        mark.attr('data-lat', 'PENDING');
        mark.attr('data-lng', 'PENDING');
      }

      // Add a small delay to avoid hitting rate limits
      if (i < geoMarks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`[Places API] Error enriching ${placeName}:`, error);
      // Keep as PENDING on error to avoid using unreliable coordinates
      mark.attr('data-lat', 'PENDING');
      mark.attr('data-lng', 'PENDING');
    }
  }

  return $('body').html() || html;
}

// Schema for AI to generate document operations using HTML IDs
const operationSchema = z.object({
  from_id: z.string().nullable().describe('ID of element AFTER which to start replacing/inserting. Use null to insert at the beginning.'),
  to_id: z.string().nullable().describe('ID of element BEFORE which to stop replacing. Use null to insert at the end. Content BETWEEN from_id and to_id will be replaced.'),
  html_content: z.string().describe('HTML content to insert between from_id and to_id (can be empty to delete)'),
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

    // Configure Mistral with Vercel AI Gateway
    // The gateway will handle caching, rate limiting, and observability
    const gatewayUrl = process.env.VERCEL_AI_GATEWAY_URL;
    const gatewayApiKey = process.env.AI_GATEWAY_API_KEY;

    const useGateway = gatewayUrl && gatewayApiKey;

    // When using gateway, only the gateway API key is needed
    // When not using gateway, the Mistral API key is required
    if (!useGateway && !process.env.MISTRAL_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'MISTRAL_API_KEY not configured (required when not using AI Gateway)' },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('[Info] Using AI provider:', useGateway ? 'Vercel AI Gateway' : 'Direct Mistral API');
    console.log('[Info] HTML document length:', htmlDocument.length);

    // When not using gateway, we need to create the Mistral provider
    let aiModel: any;
    if (!useGateway) {
      const { createMistral } = await import('@ai-sdk/mistral');
      const mistral = createMistral({
        apiKey: process.env.MISTRAL_API_KEY!,
      });
      aiModel = mistral('mistral-small-latest');
    }

    // Use AI to determine what operation to perform
    const { object: operation } = await generateObject({
      model: useGateway ? "mistral/mistral-small" : aiModel,
      schema: operationSchema,
      messages: [
        {
          role: 'system',
          content: `You are a document editor. Analyze the HTML document and user request to determine how to modify it.

Core Guidelines:
- EXISTING elements in the provided HTML have IDs (e.g., id="h1-1", id="p-1", id="h2-1", etc.)
- These IDs are used to identify elements for from_id and to_id references
- DO NOT add id attributes to NEW elements you create - the system will assign IDs automatically
- Generate clean HTML without any id attributes for new content
- Maintain proper HTML structure and semantic meaning

How the from_id/to_id system works:
- Content BETWEEN from_id and to_id (exclusive) will be replaced with html_content
- from_id: The element AFTER which to insert/replace (this element stays)
- to_id: The element BEFORE which to stop replacing (this element stays)
- Use null for from_id to insert at the beginning of the document
- Use null for to_id to insert/replace to the end of the document
- If elements are consecutive (nothing between them), new content is inserted between them

General Examples:

To INSERT content at a specific position:
- from_id="p-2" (insert after this element)
- to_id="h2-3" (insert before this element)
- html_content: Your new content without id attributes

To REPLACE a section:
- from_id="h2-1" (keep this, replace what comes after)
- to_id="h2-5" (keep this, replace what comes before)
- Everything between these boundaries is replaced with html_content

To ADD to the end:
- from_id="p-10" (after the last element you want to keep)
- to_id=null (continue to the end)
- html_content: New content to append

Context-Aware Modifications:
- First understand the document's structure and purpose
- Adapt your approach based on what makes sense for the content
- If the document has a clear pattern (e.g., numbered days, chapters, sections), respect and maintain it
- If adding new content, match the style and structure of existing content
- When modifying existing content, preserve important information unless explicitly asked to remove it

Special Cases to Consider:
- If a section is marked as "Departure", "Final", "Conclusion", etc., and you're adding content after it:
  * This section likely needs to remain at the end
  * You should insert new content BEFORE this final section
  * The final section may need renumbering if it's part of a numbered sequence
  * Set boundaries to replace/renumber the final section along with adding new content

Examples for specific document types (adapt as needed):

For travel itineraries with days:
- Maintain chronological order
- When adding a day, consider if there's a departure/final day that needs renumbering
- Example: Document has "Day 3 - Departure" and user says "add one more day":
  * from_id="p-3" (after Day 2 content)
  * to_id=null (replace to end, including the departure section)
  * html_content="<h2>Day 3 - New Activities</h2><p>...</p><h2>Day 4 - Departure</h2><p>Morning visit to a local café. Departure from airport.</p>"
- Preserve existing activities unless replacing them

For other document types:
- Respect the existing organizational structure
- Maintain consistency in formatting and hierarchy
- Consider the logical flow of information

Key principle: Understand the user's intent and the document's structure, then choose the most appropriate boundaries to achieve the desired result.

IMPORTANT: When adding locations, wrap them in geo-location marks:
  <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="PLACE NAME" title="📍 PLACE NAME">PLACE NAME</span>

Location Guidelines:
- ALWAYS use "PENDING" for both data-lat and data-lng attributes
- DO NOT provide any coordinate values - the system will enrich all locations with accurate coordinates from Google Places API
- Only provide the place name in data-place-name attribute

Location Examples (note: no id attributes on generated elements):
- "Add visit to Eiffel Tower" → <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Eiffel Tower" title="📍 Eiffel Tower">Eiffel Tower</span>
- "Add restaurant in Barcelona" → <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Restaurant Name" title="📍 Restaurant Name">Restaurant Name</span>
- "Visit Sagrada Familia" → <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Sagrada Familia" title="📍 Sagrada Familia">Sagrada Familia</span>`
        },
        {
          role: 'user',
          content: `Current HTML document:
${htmlDocument}

User request: "${prompt}"

Determine the from_id and to_id boundaries for the operation. Remember:
- Use the IDs from the EXISTING HTML elements for from_id and to_id
- Content BETWEEN these boundaries will be replaced
- The boundary elements themselves remain unchanged
- DO NOT add id attributes to any new HTML elements you generate
- Add geo-location marks for any known places in the html_content`
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
    // The logic: replace everything BETWEEN from_id and to_id with html_content

    // Find the elements to use as boundaries
    const fromElement = operation.from_id ? $(`#${operation.from_id}`) : null;
    const toElement = operation.to_id ? $(`#${operation.to_id}`) : null;

    // Validate boundary elements exist if specified
    if (operation.from_id && fromElement?.length === 0) {
      console.error(`[Error] 'from' element not found: ${operation.from_id}`);
      return NextResponse.json(
        {
          success: false,
          error: `Element not found: ${operation.from_id}`,
          details: `The 'from_id' element doesn't exist in the document`
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (operation.to_id && toElement?.length === 0) {
      console.error(`[Error] 'to' element not found: ${operation.to_id}`);
      return NextResponse.json(
        {
          success: false,
          error: `Element not found: ${operation.to_id}`,
          details: `The 'to_id' element doesn't exist in the document`
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Collect elements to remove (everything between from_id and to_id)
    const elementsToRemove: cheerio.Cheerio<any>[] = [];
    const removedIds: string[] = [];

    if (fromElement && toElement) {
      // Remove everything between from and to
      let current = fromElement.next();
      while (current.length > 0 && current[0] !== toElement[0]) {
        const id = current.attr('id');
        if (id) removedIds.push(id);
        elementsToRemove.push(current);
        current = current.next();
      }
    } else if (fromElement && !toElement) {
      // Remove everything after from
      let current = fromElement.next();
      while (current.length > 0) {
        const id = current.attr('id');
        if (id) removedIds.push(id);
        elementsToRemove.push(current);
        current = current.next();
      }
    } else if (!fromElement && toElement) {
      // Remove everything before to
      let current = $('body').children().first();
      while (current.length > 0 && current[0] !== toElement[0]) {
        const id = current.attr('id');
        if (id) removedIds.push(id);
        elementsToRemove.push(current);
        current = current.next();
      }
    }

    // Parse new content
    const newElements: string[] = [];
    // Note: New elements won't have IDs - they're assigned by the system later

    if (operation.html_content) {
      const newContent = cheerio.load(`<body>${operation.html_content}</body>`);
      newContent('body').children().each((_, elem) => {
        const $elem = $(elem);
        const changeType = removedIds.length > 0 ? 'modified' : 'added';
        $elem.attr('data-change-type', changeType);
        // Don't expect or track IDs on new elements
        newElements.push($.html($elem));
      });
    }

    // Determine insertion point
    let insertionPoint: cheerio.Cheerio<any> | null = null;

    if (fromElement) {
      // Insert after the from element
      insertionPoint = fromElement;
    } else if (toElement) {
      // Insert before the to element (will use .before())
      insertionPoint = toElement;
    } else {
      // Insert at beginning of body
      insertionPoint = null;
    }

    // Remove old elements
    elementsToRemove.forEach(elem => elem.remove());

    // Insert new content
    if (newElements.length > 0) {
      const combinedHtml = newElements.join('');

      if (insertionPoint === null) {
        // Insert at beginning of body
        $('body').prepend(combinedHtml);
      } else if (insertionPoint === toElement) {
        // Insert before the to element
        insertionPoint.before(combinedHtml);
      } else {
        // Insert after the from element
        insertionPoint.after(combinedHtml);
      }
    }

    // Track changes
    if (removedIds.length > 0 && newElements.length > 0) {
      changes.push({
        type: 'modified',
        elementIds: removedIds, // Only track removed IDs since new elements don't have IDs yet
        description: operation.description
      });
    } else if (removedIds.length > 0) {
      changes.push({
        type: 'deleted',
        elementIds: removedIds,
        description: operation.description
      });
    } else if (newElements.length > 0) {
      changes.push({
        type: 'added',
        elementIds: [], // New elements don't have IDs yet - they'll be assigned by the system
        description: operation.description
      });
    }

    // Get the modified HTML
    let modifiedHtml = $('body').html() || '';

    // Enrich geo-marks with precise coordinates using Google Places API
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (googleApiKey) {
      console.log('[Info] Enriching coordinates with Google Places API');
      modifiedHtml = await enrichCoordinates(modifiedHtml, googleApiKey);
    } else {
      console.log('[Info] Skipping coordinate enrichment - no Google Places API key');
    }

    // Assign color indices to geo marks for consistent visualization
    modifiedHtml = assignColorIndicesToGeoMarks(modifiedHtml);

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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}
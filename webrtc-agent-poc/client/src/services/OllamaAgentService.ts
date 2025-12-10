/**
 * Ollama Agent Service
 * Integrates with local Ollama LLM for intelligent voice input analysis
 */

import ollama from 'ollama';
import type { AgentPlan, ClarifiedIntent, OllamaMessage, OllamaResponse, ToolCall, ToolDefinition } from '../types/agent';
import { geocodingService } from './GeocodingService';
import { getToolDefinitions, validateToolCall } from './ToolRegistry';

// Temporary type until we extract to shared types
interface DetectedLocation {
  locationName: string;
  geoId?: string;
  lat?: number;
  lng?: number;
  colorIndex?: number;
  status: 'detecting' | 'found' | 'error';
  ranges: Array<{ from: number; to: number }>;
  errorMessage?: string;
}

// Configuration
const OLLAMA_URL = (import.meta as any).env?.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = (import.meta as any).env?.VITE_OLLAMA_MODEL || 'ministral-3:8b';
const OLLAMA_TIMEOUT = Number((import.meta as any).env?.VITE_OLLAMA_TIMEOUT) || 30000;

/**
 * Check if Ollama is available and responsive
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    // Use the SDK's list method to check if Ollama is available
    await ollama.list();
    return true;
  } catch (error) {
    console.warn('[OllamaAgentService] Ollama not available:', error);
    return false;
  }
}

/**
 * Map country names to ISO 3166-1 alpha-2 codes for Nominatim filtering
 */
const COUNTRY_CODE_MAP: { [key: string]: string } = {
  // Nordic countries
  'denmark': 'dk',
  'sweden': 'se',
  'norway': 'no',
  'finland': 'fi',
  'iceland': 'is',

  // Western Europe
  'france': 'fr',
  'germany': 'de',
  'netherlands': 'nl',
  'belgium': 'be',
  'luxembourg': 'lu',
  'switzerland': 'ch',
  'austria': 'at',

  // Southern Europe
  'spain': 'es',
  'portugal': 'pt',
  'italy': 'it',
  'greece': 'gr',

  // British Isles
  'united kingdom': 'gb',
  'uk': 'gb',
  'great britain': 'gb',
  'england': 'gb',
  'scotland': 'gb',
  'wales': 'gb',
  'ireland': 'ie',

  // Eastern Europe
  'poland': 'pl',
  'czech republic': 'cz',
  'czechia': 'cz',
  'slovakia': 'sk',
  'hungary': 'hu',
  'romania': 'ro',
  'bulgaria': 'bg',

  // Americas
  'united states': 'us',
  'usa': 'us',
  'us': 'us',
  'america': 'us',
  'canada': 'ca',
  'mexico': 'mx',
  'brazil': 'br',
  'argentina': 'ar',

  // Asia
  'china': 'cn',
  'japan': 'jp',
  'south korea': 'kr',
  'india': 'in',
  'thailand': 'th',
  'vietnam': 'vn',
  'singapore': 'sg',

  // Oceania
  'australia': 'au',
  'new zealand': 'nz'
};

/**
 * Execute geocode tool during planning and return coordinates
 * Uses qualification parameters (country, proximity) to resolve locations
 */
async function executeGeocodeTool(args: {
  placeName: string;
  country?: string;
  proximity?: { lat: number; lng: number };
  zoom?: number;
}): Promise<string> {
  const { placeName, country, proximity } = args;

  console.log('[OllamaAgentService] Geocoding:', placeName, 'with params:', { country, proximity });

  try {
    // Strategy 1: Use structured geocoding if we have country (most accurate)
    if (country) {
      console.log('[OllamaAgentService] Using structured geocoding for', placeName, 'in', country);

      const result = await geocodingService.geocodeStructured({
        city: placeName,
        country: country
      });

      if (result) {
        const coords: any = {
          placeName: result.placeName,
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lng)
        };

        // Include boundingbox if present (for accurate map focusing)
        if (result.boundingbox) {
          coords.boundingbox = result.boundingbox;
          console.log('[OllamaAgentService] ✅ Including boundingbox:', result.boundingbox);
        }

        console.log('[OllamaAgentService] Structured geocoding resolved to', coords);
        return JSON.stringify(coords);
      } else {
        console.warn('[OllamaAgentService] Structured geocoding failed - falling back to prefix search');
      }
    }

    // Strategy 2: Fallback to prefix search with country codes
    let countryCodes: string[] | undefined;
    if (country) {
      const countryLower = country.toLowerCase().trim();
      const code = COUNTRY_CODE_MAP[countryLower];

      if (code) {
        countryCodes = [code];
        console.log('[OllamaAgentService] Using prefix search with country code:', code);
      }
    }

    const results = await geocodingService.searchByPrefix(
      placeName,
      proximity ? { lat: proximity.lat, lng: proximity.lng } : undefined,
      countryCodes
    );

    if (results.length === 0) {
      console.warn('[OllamaAgentService] No results found for:', placeName);
      return JSON.stringify({ error: 'Location not found' });
    }

    // Return top result
    const selected = results[0];
    const coords = {
      placeName: selected.name,
      lat: selected.lat,
      lng: selected.lng
    };
    console.log('[OllamaAgentService] Prefix search resolved to', coords);
    return JSON.stringify(coords);
  } catch (error) {
    console.error('[OllamaAgentService] Geocoding error:', error);
    return JSON.stringify({ error: 'Geocoding failed' });
  }
}

/**
 * Execute a tool call during planning and return result as string for LLM
 */
async function executeToolForPlanning(
  toolCall: { name: string; arguments: Record<string, any> }
): Promise<string> {
  console.log('[OllamaAgentService] Executing tool during planning:', toolCall.name);

  switch (toolCall.name) {
    case 'geocode':
      return await executeGeocodeTool(toolCall.arguments as any);

    case 'insertText':
    case 'insertMap':
    case 'replaceText':
    case 'setTransportation':
    case 'createGeoMark':
    case 'openFullscreenMap':
      // These are action tools, not information tools
      // Return success - they will be executed later by ToolExecutor
      console.log('[OllamaAgentService] Action tool queued for execution:', toolCall.name);
      return JSON.stringify({
        status: 'success',
        message: `${toolCall.name} will be executed. Task is now complete.`
      });

    default:
      console.warn('[OllamaAgentService] Unknown tool:', toolCall.name);
      return JSON.stringify({ error: 'Unknown tool' });
  }
}

/**
 * Extract action tools from conversation messages
 * Action tools are the ones we execute in the document (insertText, insertMap, etc.)
 * Information tools (geocode) were executed during planning and are not included
 */
function extractActionTools(messages: OllamaMessage[]): ToolCall[] {
  const actionTools: ToolCall[] = [];
  const seen = new Set<string>();

  console.log('[OllamaAgentService] Extracting action tools from', messages.length, 'messages');

  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls) {
      for (const call of message.tool_calls) {
        // Only include action tools, not information tools
        if (call.function.name !== 'geocode') {
          const tool: ToolCall = {
            name: call.function.name as any,
            parameters: call.function.arguments,
            status: 'pending'
          };

          // Create a unique key for deduplication
          const key = JSON.stringify({ name: tool.name, parameters: tool.parameters });

          // Skip if we've already seen this exact tool call
          if (seen.has(key)) {
            console.log('[OllamaAgentService] Skipping duplicate tool:', tool.name);
            continue;
          }

          // Validate
          if (validateToolCall(tool)) {
            actionTools.push(tool);
            seen.add(key);
            console.log('[OllamaAgentService] Extracted action tool:', tool.name);
          } else {
            console.warn('[OllamaAgentService] Invalid action tool, skipping:', tool);
          }
        }
      }
    }
  }

  console.log('[OllamaAgentService] Extracted', actionTools.length, 'action tools (after deduplication)');
  return actionTools;
}

/**
 * Generate execution plan based on clarified user intent
 * Single-turn approach: LLM outputs JSON plan, we execute geocoding, then build tool calls
 * (Phase 2: After intent clarification is complete)
 */
export async function generatePlan(
  intent: ClarifiedIntent,
  detectedLocations: DetectedLocation[]
): Promise<AgentPlan | null> {
  console.log('[OllamaAgentService] Generating plan from clarified intent (single-turn)');

  try {
    // Build prompt asking for JSON plan
    const prompt = buildSingleTurnPlanPrompt(intent);

    console.log('[OllamaAgentService] Plan generation prompt:');
    console.log(prompt);

    // Single LLM call (no tool calling, just JSON output)
    const response = await callOllama([{ role: 'user', content: prompt }]);

    console.log('[OllamaAgentService] LLM response:', response.message.content);

    // Parse JSON response
    let planJson: any;
    try {
      // Strip markdown code blocks if present
      let jsonContent = response.message.content.trim();
      const codeBlockMatch = jsonContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1].trim();
      }

      planJson = JSON.parse(jsonContent);
      console.log('[OllamaAgentService] Parsed plan:', planJson);
    } catch (error) {
      console.error('[OllamaAgentService] Failed to parse plan JSON:', error);
      return null;
    }

    // Execute geocoding for all locations
    const geocodedLocations: Map<string, { placeName: string; lat: number; lng: number }> = new Map();

    if (planJson.locations && planJson.locations.length > 0) {
      console.log('[OllamaAgentService] Geocoding locations:', planJson.locations);

      for (const locationName of planJson.locations) {
        const result = await geocodingService.geocode(locationName);
        if (result) {
          geocodedLocations.set(locationName, {
            placeName: result.placeName,
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lng)
          });
          console.log(`[OllamaAgentService] Geocoded ${locationName}:`, geocodedLocations.get(locationName));
        } else {
          console.warn(`[OllamaAgentService] Failed to geocode ${locationName}`);
        }
      }
    }

    // Phase 2: Have LLM generate HTML content with geocoded coordinates
    console.log('[OllamaAgentService] Phase 2: LLM generating HTML with geo-marks');

    const contentPrompt = buildContentGenerationPrompt(intent, planJson, geocodedLocations);
    const contentResponse = await callOllama([{ role: 'user', content: contentPrompt }]);

    // Parse LLM response for HTML content
    let generatedHtml = contentResponse.message.content.trim();

    // Strip markdown code blocks if present
    const htmlCodeBlockMatch = generatedHtml.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
    if (htmlCodeBlockMatch) {
      generatedHtml = htmlCodeBlockMatch[1].trim();
    }

    console.log('[OllamaAgentService] LLM generated HTML:', generatedHtml);

    // Build tool calls based on plan type
    const tools: ToolCall[] = [];

    if (planJson.planType === 'travel' && planJson.fromLocation && planJson.toLocation) {
      // Get geocoded coordinates for setTransportation
      const fromCoords = geocodedLocations.get(planJson.fromLocation);
      const toCoords = geocodedLocations.get(planJson.toLocation);

      if (!fromCoords || !toCoords) {
        console.error('[OllamaAgentService] Missing geocoded coordinates for travel');
        return null;
      }

      // Use LLM-generated HTML
      tools.push({
        name: 'insertText',
        parameters: { html: generatedHtml },
        status: 'pending'
      });

      tools.push({
        name: 'setTransportation',
        parameters: {
          fromLocation: fromCoords.placeName,
          toLocation: toCoords.placeName,
          mode: planJson.transportMode
        },
        status: 'pending'
      });
    } else if (planJson.planType === 'location') {
      // Use LLM-generated HTML
      tools.push({
        name: 'insertText',
        parameters: { html: generatedHtml },
        status: 'pending'
      });
    } else if (planJson.planType === 'map' && planJson.focusLocation) {
      // Open fullscreen map
      tools.push({
        name: 'openFullscreenMap',
        parameters: {
          focusLocation: planJson.focusLocation,
          zoom: 12
        },
        status: 'pending'
      });
    }

    // Build final plan
    const plan: AgentPlan = {
      status: 'ready',
      reasoning: intent.reasoning,
      tools,
      executionResults: []
    };

    console.log('[OllamaAgentService] Plan generation complete:', plan);
    console.log('[OllamaAgentService] Tools to execute:', tools.length);
    return plan;

  } catch (error) {
    console.error('[OllamaAgentService] Plan generation failed:', error);
    return null;
  }
}

/**
 * Build single-turn plan generation prompt
 * Asks LLM to output JSON plan with locations and metadata
 */
function buildSingleTurnPlanPrompt(intent: ClarifiedIntent): string {
  return `Analyze this user intent and output a JSON plan.

USER INTENT: ${intent.intent}

Determine the plan type and extract relevant information:
- If user wants to TRAVEL between locations (mentions "drive", "cycle", "walk", "fly", "from X to Y"): planType = "travel"
- If user wants to MENTION a location (e.g., "I want to visit X"): planType = "location"
- If user wants to OPEN/VIEW the map (e.g., "show me the map", "zoom on X"): planType = "map"

Output JSON format:
{
  "locations": ["location1", "location2"],  // All location names to geocode
  "planType": "travel" | "location" | "map",
  "transportMode": "driving" | "cycling" | "walking" | "flying" | null,  // Only for travel
  "fromLocation": "..." | null,  // Only for travel
  "toLocation": "..." | null,  // Only for travel
  "focusLocation": "..." | null  // Only for map
}

Examples:

Input: "I want to drive from Copenhagen to Stockholm"
Output: {"locations": ["Copenhagen", "Stockholm"], "planType": "travel", "transportMode": "driving", "fromLocation": "Copenhagen", "toLocation": "Stockholm", "focusLocation": null}

Input: "I want to visit Paris"
Output: {"locations": ["Paris"], "planType": "location", "transportMode": null, "fromLocation": null, "toLocation": null, "focusLocation": null}

Input: "Show me the map of London"
Output: {"locations": ["London"], "planType": "map", "transportMode": null, "fromLocation": null, "toLocation": null, "focusLocation": "London"}

ONLY output valid JSON, no other text.`;
}

/**
 * Build prompt for LLM to generate HTML content with geo-marks
 * Phase 2: After geocoding, ask LLM to create rich text based on intent
 */
function buildContentGenerationPrompt(
  intent: ClarifiedIntent,
  planJson: any,
  geocodedLocations: Map<string, { placeName: string; lat: number; lng: number }>
): string {
  // Build location coordinates reference
  const coordsReference = Array.from(geocodedLocations.entries())
    .map(([name, coords]) => `${name}: lat=${coords.lat}, lng=${coords.lng}`)
    .join('\n');

  return `Generate HTML content based on the user's intent. Wrap location names in geo-mark spans.

USER INTENT: ${intent.intent}

GEOCODED LOCATIONS:
${coordsReference}

INSTRUCTIONS:
1. Generate natural text that reflects the user's original phrasing
2. Wrap each location name in a geo-mark span with this exact format:
   <span class="geo-mark" data-place-name="LocationName" data-lat="12.34" data-lng="56.78">LocationName</span>
3. Use the ORIGINAL location names (e.g., "Copenhagen", not "København, Københavns Kommune...")
4. Use the geocoded coordinates provided above for data-lat and data-lng
5. Do NOT add data-geo-id, data-color-index, data-transport-from, or data-transport-profile
6. Output ONLY the HTML content, no explanations or markdown code blocks

EXAMPLE:
User intent: "I want to drive from Copenhagen to Stockholm"
Locations: Copenhagen (lat=55.6761, lng=12.5683), Stockholm (lat=59.3293, lng=18.0686)

Output: I want to drive from <span class="geo-mark" data-place-name="Copenhagen" data-lat="55.6761" data-lng="12.5683">Copenhagen</span> to <span class="geo-mark" data-place-name="Stockholm" data-lat="59.3293" data-lng="18.0686">Stockholm</span>

Now generate HTML for the user's intent above:`;
}

/**
 * Build the plan generation prompt for Ollama (OLD - multi-turn approach)
 * DEPRECATED: Use buildSingleTurnPlanPrompt instead
 */
function buildPlanPrompt(
  intent: ClarifiedIntent
): string {
  // Check if fullscreen map is currently open
  const fullscreenMapView = (window as any).fullscreenMapView;
  const isMapAlreadyOpen = fullscreenMapView &&
                           fullscreenMapView.map &&
                           typeof fullscreenMapView.map.isStyleLoaded === 'function' &&
                           fullscreenMapView.map.isStyleLoaded();

  // Parse intent to extract command vs content
  let intentInstruction = intent.intent;
  if (intent.intent.startsWith('Execute command: insert map')) {
    intentInstruction = 'Call insertMap() to insert a map block';
  } else if (intent.intent.startsWith('Execute command: open map') ||
             intent.intent.startsWith('Execute command: open fullscreen map') ||
             intent.intent.toLowerCase().includes('show me the map') ||
             intent.intent.toLowerCase().includes('zoom in on') ||
             intent.intent.toLowerCase().includes('focus map')) {
    // Extract location if present (supports Unicode characters like ö, å, ä)
    const locationMatch = intent.intent.match(/(?:on|to|at|around|near)\s+([\p{L}\s]+)/u);
    if (locationMatch) {
      const location = locationMatch[1].trim();

      // If map is already open, use focus action instead of opening
      if (isMapAlreadyOpen) {
        intentInstruction = `Call geocode("${location}") first, then call openFullscreenMap(focusLocation: "${location}", zoom: 12, action: "focus")`;
        console.log('[OllamaAgentService] Map already open, using focus action for:', location);
      } else {
        intentInstruction = `Call geocode("${location}") first, then call openFullscreenMap(focusLocation: "${location}", zoom: 12)`;
      }
    } else {
      // No location specified - open map if not already open
      if (isMapAlreadyOpen) {
        intentInstruction = 'The fullscreen map is already open. No action needed.';
      } else {
        intentInstruction = 'Call openFullscreenMap() to open the fullscreen map view';
      }
    }
  } else if (intent.intent.startsWith('Execute command:')) {
    // Extract the command (e.g., "Execute command: insert map" -> "insert map")
    const command = intent.intent.replace('Execute command:', '').trim();
    intentInstruction = `Execute the command: "${command}"`;
  }

  return `You are executing a plan. This is a MULTI-TURN conversation: call tools, get results, continue until complete.

USER INTENT: ${intentInstruction}

TOOLS:
1. geocode(placeName, country?) - Get coordinates (info only, no visible action)
2. insertText(html) - Insert text with geo-marks: <span class="geo-mark" data-place-name="Place" data-lat="12.34" data-lng="56.78">Place</span>
3. openFullscreenMap(focusLocation?, zoom?) - Open map, optionally focus on location
4. replaceText(targetText, replacementText) - Replace text
5. insertMap() - Add map block (rarely needed, document has default map)

WORKFLOW:
- For text with locations: geocode() → insertText(html with geo-marks)
- For map focus: geocode() → openFullscreenMap(focusLocation)
- geocode alone does NOTHING visible - you must call an action tool after

RULES:
1. Use exact location names from USER INTENT, not other locations
2. Always geocode locations mentioned in the intent before using them
3. insertText must include FULL sentence, not just location: "I want to visit <span...>Place</span>"
4. Use exact coordinates from geocode results, don't guess
5. Stop when action tool returns {"status": "success"}

EXAMPLES:

"Show me Paris"
→ geocode("Paris", "France") → openFullscreenMap("Paris", 12)

"I want to visit Tokyo"
→ geocode("Tokyo", "Japan") → insertText("I want to visit <span class='geo-mark' data-place-name='Tokyo' data-lat='...' data-lng='...'>Tokyo</span>")

"Travel from London to Rome"
→ geocode("London") + geocode("Rome") → insertText("Travel from <span...>London</span> to <span... data-transport-from='London' data-transport-profile='flying'>Rome</span>")

Execute the plan now. Use locations from USER INTENT only.`;
}

/**
 * Call Ollama API with timeout using the JavaScript SDK
 */
async function callOllama(
  messages: OllamaMessage[],
  tools?: ToolDefinition[]
): Promise<OllamaResponse> {
  try {
    const options: any = {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      keep_alive: 60  // Keep model loaded for 60s (enough for one agent loop, prevents reload crashes)
      // Note: think: true is only supported by some models (deepseek-r1, qwen2.5, etc.)
      // ministral-3:8b does not support it
    };

    // Add tools for native function calling
    if (tools && tools.length > 0) {
      options.tools = tools;
      console.log('[OllamaAgentService] Calling Ollama with', tools.length, 'tool definitions');
    } else {
      // Only force JSON format if not using tool calling
      options.format = 'json';
      console.log('[OllamaAgentService] Calling Ollama with JSON format (no tools)');
    }

    // Use fetch directly instead of SDK to get better error messages
    const fetchResponse = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      console.error('[OllamaAgentService] HTTP error response:', errorText);
      throw new Error(`Ollama HTTP ${fetchResponse.status}: ${errorText}`);
    }

    const responseText = await fetchResponse.text();
    console.log('[OllamaAgentService] Raw response text length:', responseText.length);

    try {
      const response = JSON.parse(responseText);
      return response as OllamaResponse;
    } catch (parseError) {
      console.error('[OllamaAgentService] Failed to parse response:', responseText.substring(0, 500));
      throw new Error(`Failed to parse Ollama response: ${parseError}`);
    }
  } catch (error) {
    // Log the full error for debugging
    console.error('[OllamaAgentService] Full error object:', error);
    console.error('[OllamaAgentService] Error stack:', error instanceof Error ? error.stack : 'No stack');

    if (error instanceof Error) {
      throw new Error(`Ollama error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse tool calls from Ollama response (supports both native tool calling and JSON format)
 * Note: Currently unused - kept for future reference
 */
function _parseToolCalls(response: OllamaResponse): ToolCall[] {
  const tools: ToolCall[] = [];

  console.log('[OllamaAgentService] Parsing tool calls from response');
  console.log('[OllamaAgentService] Has tool_calls:', !!response.message.tool_calls);
  console.log('[OllamaAgentService] Content:', response.message.content);

  // Method 1: Native Ollama tool calling (preferred)
  if (response.message.tool_calls && response.message.tool_calls.length > 0) {
    console.log('[OllamaAgentService] Using native Ollama tool calls');

    for (const toolCall of response.message.tool_calls) {
      if (toolCall.type !== 'function') continue;

      const tool: ToolCall = {
        name: toolCall.function.name as any,
        parameters: toolCall.function.arguments,
        status: 'pending'
      };

      // Validate tool call
      if (!validateToolCall(tool)) {
        console.warn('[OllamaAgentService] Invalid tool call, skipping:', tool);
        continue;
      }

      tools.push(tool);
      console.log('[OllamaAgentService] Parsed tool:', tool.name, tool.parameters);
    }

    return tools;
  }

  // Method 2: JSON format fallback (for models that don't support native tool calling)
  const content = response.message.content;
  if (!content || content.trim().length === 0) {
    console.warn('[OllamaAgentService] Empty content, no tools to parse');
    return [];
  }

  try {
    console.log('[OllamaAgentService] Trying JSON format fallback');

    // Strip markdown code blocks if present (```json ... ```)
    let jsonContent = content.trim();
    const codeBlockMatch = jsonContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1].trim();
      console.log('[OllamaAgentService] Stripped markdown code blocks');
    }

    const parsed = JSON.parse(jsonContent);

    if (!parsed.tools || !Array.isArray(parsed.tools)) {
      console.warn('[OllamaAgentService] No tools array in JSON response');
      console.warn('[OllamaAgentService] Parsed object keys:', Object.keys(parsed));
      return [];
    }

    // Parse each tool call
    for (const toolCall of parsed.tools) {
      if (!toolCall.name || !toolCall.parameters) {
        console.warn('[OllamaAgentService] Invalid tool call format:', toolCall);
        continue;
      }

      const tool: ToolCall = {
        name: toolCall.name as any,
        parameters: toolCall.parameters,
        status: 'pending'
      };

      // Validate tool call
      if (!validateToolCall(tool)) {
        console.warn('[OllamaAgentService] Invalid tool call, skipping:', tool);
        continue;
      }

      tools.push(tool);
      console.log('[OllamaAgentService] Parsed tool:', tool.name, tool.parameters);
    }

    return tools;
  } catch (error) {
    console.error('[OllamaAgentService] Failed to parse JSON response:', error);
    console.error('[OllamaAgentService] Raw content:', content);
    return [];
  }
}

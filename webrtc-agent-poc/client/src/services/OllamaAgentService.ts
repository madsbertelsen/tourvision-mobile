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
 * Implements proper agent loop pattern following Ollama SDK best practices
 * (Phase 2: After intent clarification is complete)
 */
export async function generatePlan(
  intent: ClarifiedIntent,
  detectedLocations: DetectedLocation[]
): Promise<AgentPlan | null> {
  console.log('[OllamaAgentService] Generating plan from clarified intent');

  try {
    // Build initial prompt
    const prompt = buildPlanPrompt(intent, detectedLocations);

    console.log('[OllamaAgentService] Plan generation prompt:');
    console.log(prompt);

    // Initialize messages for agent loop
    const messages: OllamaMessage[] = [
      { role: 'user', content: prompt }
    ];

    // Get tool definitions
    const tools = getToolDefinitions();
    console.log('[OllamaAgentService] Tool definitions:', tools.map(t => t.function.name));

    // Agent loop - iterate until LLM has no more tool calls
    let maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`[OllamaAgentService] Agent loop iteration ${iteration}`);

      // Call LLM with current conversation history and tools
      const response = await callOllama(messages, tools);

      console.log('[OllamaAgentService] LLM response:', {
        content: response.message.content,
        tool_calls: response.message.tool_calls?.length ?? 0
      });

      // Add LLM response to conversation
      messages.push(response.message);

      // Check for tool calls
      const toolCalls = response.message.tool_calls ?? [];

      if (toolCalls.length === 0) {
        console.log('[OllamaAgentService] No more tool calls - agent loop complete');
        break;
      }

      console.log(`[OllamaAgentService] LLM called ${toolCalls.length} tool(s)`);

      // Execute each tool call and add results to conversation
      for (const call of toolCalls) {
        console.log(`[OllamaAgentService] Executing tool: ${call.function.name}`);

        const result = await executeToolForPlanning({
          name: call.function.name,
          arguments: call.function.arguments
        });

        console.log(`[OllamaAgentService] Tool result:`, result);

        // Add tool result to messages
        messages.push({
          role: 'tool',
          tool_name: call.function.name,
          content: result
        });
      }
    }

    if (iteration >= maxIterations) {
      console.warn('[OllamaAgentService] Agent loop max iterations reached');
    }

    // Extract action tools from conversation history
    // Action tools (insertText, insertMap, etc.) will be executed by ToolExecutor
    // Information tools (geocode) were executed during planning and are not included
    const actionTools = extractActionTools(messages);

    // Build final plan
    const plan: AgentPlan = {
      status: 'ready',
      reasoning: intent.reasoning,
      tools: actionTools,
      executionResults: []
    };

    console.log('[OllamaAgentService] Plan generation complete:', plan);
    console.log('[OllamaAgentService] Action tools to execute:', actionTools.length);
    return plan;

  } catch (error) {
    console.error('[OllamaAgentService] Plan generation failed:', error);
    return null;
  }
}

/**
 * Build the plan generation prompt for Ollama
 * Updated to guide LLM through agent loop pattern
 */
function buildPlanPrompt(
  intent: ClarifiedIntent,
  locations: DetectedLocation[]
): string {
  const locationNames = locations.map(loc => loc.locationName).join(', ');

  // Parse intent to extract command vs content
  let intentInstruction = intent.intent;
  if (intent.intent.startsWith('Execute command: insert map')) {
    intentInstruction = 'Call insertMap() to insert a map block';
  } else if (intent.intent.startsWith('Execute command: open map') ||
             intent.intent.startsWith('Execute command: open fullscreen map') ||
             intent.intent.toLowerCase().includes('show me the map') ||
             intent.intent.toLowerCase().includes('zoom in on')) {
    // Extract location if present
    const locationMatch = intent.intent.match(/(?:on|to|at|around|near)\s+([A-Z][a-zA-Z\s]+)/);
    if (locationMatch) {
      const location = locationMatch[1].trim();
      intentInstruction = `Call geocode("${location}") first, then call openFullscreenMap(focusLocation: "${location}", zoom: 12)`;
    } else {
      intentInstruction = 'Call openFullscreenMap() to open the fullscreen map view';
    }
  } else if (intent.intent.startsWith('Execute command:')) {
    // Extract the command (e.g., "Execute command: insert map" -> "insert map")
    const command = intent.intent.replace('Execute command:', '').trim();
    intentInstruction = `Execute the command: "${command}"`;
  }

  return `You are executing a plan to fulfill the user's intent. This is a MULTI-TURN conversation where you call tools, receive results, and continue until the task is COMPLETE.

USER INTENT: ${intentInstruction}

DETECTED LOCATIONS: ${locationNames || 'None'}

AVAILABLE TOOLS:
1. replaceText(targetText, replacementText) - Replace existing text in the document
2. insertText(html) - Insert HTML with embedded geo-marks and optional map blocks
   - Geo-marks: <span class="geo-mark" data-place-name="Location" data-lat="12.34" data-lng="56.78">Location</span>
   - Transport: data-transport-from="Origin" data-transport-profile="driving|cycling|walking|flying"
   - Map block: <div class="prosemirror-map" data-height="400"></div> (include AFTER text with locations)
3. insertMap() - Insert a standalone map block (only use if you forgot to include map in insertText)
4. geocode(placeName, country?, proximity?, zoom?) - Geocode a location to get coordinates (information gathering only)
5. openFullscreenMap(focusLocation?, zoom?, action?) - Open fullscreen map and optionally pan/zoom to a location

CRITICAL WORKFLOW FOR LOCATIONS:
If the user wants to insert text with locations, you MUST:

Step 1: Call geocode for EACH location mentioned
Step 2: After receiving ALL geocode results, call insertText with:
  - The FULL user sentence as HTML
  - Geo-marks for each location with coordinates
  - If travel is mentioned, add transport attributes to the DESTINATION geo-mark

EXAMPLE: "I will drive my car from Copenhagen to Stockholm"
Turn 1: Call geocode(placeName: "Copenhagen", country: "Denmark") AND geocode(placeName: "Stockholm", country: "Sweden")
Turn 2: After receiving coordinates, call insertText with HTML:
  "I will drive my car from <span class='geo-mark' data-place-name='Copenhagen' data-lat='55.6867' data-lng='12.5701'>Copenhagen</span> to <span class='geo-mark' data-place-name='Stockholm' data-lat='59.33' data-lng='18.06' data-transport-from='Copenhagen' data-transport-profile='driving'>Stockholm</span>"
STATUS: COMPLETE ✓ (insertText includes both locations AND transport config in Stockholm's geo-mark)

IMPORTANT RULES:
- The geocode tool only gathers information - it does NOT insert anything into the document
- You MUST call insertText after geocoding to actually insert the text
- If you've called geocode but not insertText, the task is INCOMPLETE
- insertText must contain the FULL user sentence, not just the location name!
- WRONG: "<span class='geo-mark' ...>Copenhagen</span>"
- CORRECT: "I want to visit <span class='geo-mark' ...>Copenhagen</span>"
- Do NOT guess coordinates! Always use the exact coordinates returned by geocode.
- When insertText returns {"status": "success"}, STOP - the task is complete
- For travel statements, embed transport attributes in the destination geo-mark (do NOT use separate setTransportation tool)
- Do NOT call the same action tool twice with identical parameters

EXAMPLE CONVERSATION FLOWS:

Example 1: "I want to visit Copenhagen" (location-based)
Turn 1 - YOU: Call geocode(placeName: "Copenhagen", country: "Denmark")
Turn 2 - SYSTEM: Returns {"placeName": "København", "lat": 55.6867, "lng": 12.5701}
Turn 3 - YOU: Call insertText with html: "I want to visit <span class='geo-mark' data-place-name='København' data-lat='55.6867' data-lng='12.5701'>Copenhagen</span>"
STATUS: TASK COMPLETE ✓ (both geocode AND insertText called)

Example 2: "I also want to visit Stockholm" (location-based)
Turn 1 - YOU: Call geocode(placeName: "Stockholm", country: "Sweden")
Turn 2 - SYSTEM: Returns {"placeName": "Stockholm", "lat": 59.33, "lng": 18.06}
Turn 3 - YOU: Call insertText with html: "I also want to visit <span class='geo-mark' data-place-name='Stockholm' data-lat='59.33' data-lng='18.06'>Stockholm</span>"
STATUS: TASK COMPLETE ✓

WRONG Example (INCOMPLETE):
Turn 1 - YOU: Call geocode(placeName: "Stockholm", country: "Sweden")
Turn 2 - SYSTEM: Returns coordinates
Turn 3 - YOU: [stops without calling insertText]
STATUS: TASK INCOMPLETE ✗ (geocode was called but insertText was NOT - the text was never inserted!)

Example 3: "I want to go shopping" (no location)
Turn 1 - YOU: Call insertText with html: "I want to go shopping"
STATUS: TASK COMPLETE ✓ (no geocoding needed)

Example 4: "Insert map"
Turn 1 - YOU: Call insertMap()
STATUS: TASK COMPLETE ✓

Example 5: "Open the map and zoom in on Jönköping"
Turn 1 - YOU: Call geocode(placeName: "Jönköping", country: "Sweden")
Turn 2 - SYSTEM: Returns {"placeName": "Jönköping", "lat": 57.78, "lng": 14.16}
Turn 3 - YOU: Call openFullscreenMap(focusLocation: "Jönköping", zoom: 12)
STATUS: TASK COMPLETE ✓

Example 6: "Show me the map"
Turn 1 - YOU: Call openFullscreenMap()
STATUS: TASK COMPLETE ✓

Example 7: "I want to travel from Copenhagen to Stockholm" (multiple locations - insert text AND map)
Turn 1 - YOU: Call geocode(placeName: "Copenhagen", country: "Denmark") AND geocode(placeName: "Stockholm", country: "Sweden")
Turn 2 - SYSTEM: Returns coordinates for both locations
Turn 3 - YOU: Call insertText with HTML: "I want to travel from <span class='geo-mark' ...>Copenhagen</span> to <span class='geo-mark' ... data-transport-from='Copenhagen' data-transport-profile='flying'>Stockholm</span><div class='prosemirror-map' data-height='400'></div>"
STATUS: TASK COMPLETE ✓ (text with geo-marks AND map block inserted in single operation)

BEST PRACTICE:
- When inserting text with locations (geo-marks), INCLUDE a map block in the HTML: <div class='prosemirror-map' data-height='400'></div>
- Place the map block AFTER the paragraph with locations
- This provides a better user experience by visualizing locations automatically in a single operation
- NO need to call insertMap() separately - just include the div in the HTML!

QUALIFICATION PARAMETERS for geocode:
- country: Use when you know the country from context
- proximity: Use when you have nearby locations to bias results
- zoom: Higher values = stronger proximity bias (default: 10)

WHAT TO GEOCODE:
✓ Geocode: cities, countries, regions, landmarks, museums, monuments, parks
✗ Do NOT geocode: abstract events, activities without specific places

HTML GEO-MARK FORMAT:
<span class="geo-mark" data-place-name="LocationName" data-lat="12.34" data-lng="56.78">LocationName</span>

NOTE: Do NOT include data-geo-id or data-color-index - these will be generated automatically!

Now select the appropriate tool(s) to fulfill the user's intent. Remember: call geocode first for locations, then wait for the result before calling insertText!`;
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
      stream: false
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

    // Use the SDK's chat method
    const response = await ollama.chat(options);

    // The SDK returns the response directly, convert to our type
    return response as any as OllamaResponse;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Ollama error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse tool calls from Ollama response (supports both native tool calling and JSON format)
 */
function parseToolCalls(response: OllamaResponse): ToolCall[] {
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

/**
 * Ollama Agent Service
 * Integrates with local Ollama LLM for intelligent voice input analysis
 */

import Ollama from 'ollama/browser';
import type { AgentPlan, ToolCall, OllamaMessage, OllamaResponse, ToolDefinition, ClarifiedIntent } from '../types/agent';
import { getToolDefinitions, validateToolCall } from './ToolRegistry';
import { geocodingService } from './GeocodingService';

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

// Initialize Ollama client
const ollama = new Ollama({ host: OLLAMA_URL });

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
 * Generate execution plan based on clarified user intent
 * (Phase 2: After intent clarification is complete)
 */
export async function generatePlan(
  intent: ClarifiedIntent,
  detectedLocations: DetectedLocation[]
): Promise<AgentPlan | null> {
  console.log('[OllamaAgentService] Generating plan from clarified intent');

  try {
    // Build plan generation prompt (simplified - intent is already clear)
    const prompt = buildPlanPrompt(intent, detectedLocations);

    // Create messages
    const messages: OllamaMessage[] = [
      {
        role: 'user',
        content: prompt
      }
    ];

    // Get tool definitions for Ollama function calling
    const toolDefinitions = getToolDefinitions();

    // Call Ollama with native tool calling
    const response = await callOllama(messages, toolDefinitions);

    // Parse tool calls from response
    const tools = parseToolCalls(response);

    // Execute geocode tools during planning and resolve coordinates
    const geocodeResults = new Map<string, { lat: number; lng: number }>();

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];

      if (tool.name === 'geocode') {
        // Execute geocode tool during planning
        const result = await executeGeocodeToolForPlanning(tool.parameters);

        if (result) {
          // Store result for later createGeoMark tools
          geocodeResults.set(tool.parameters.placeName, {
            lat: result.lat,
            lng: result.lng
          });

          console.log('[OllamaAgentService] Geocoded', tool.parameters.placeName, '→', result);
        } else {
          console.warn('[OllamaAgentService] Failed to geocode:', tool.parameters.placeName);
        }

        // Remove geocode tool from final plan (it's only for planning)
        tools.splice(i, 1);
        i--;
      } else if (tool.name === 'createGeoMark') {
        // Check if we have resolved coordinates for this location
        const placeName = tool.parameters.placeName;
        const coords = geocodeResults.get(placeName);

        if (coords) {
          // Update createGeoMark with resolved coordinates
          tool.parameters.lat = coords.lat;
          tool.parameters.lng = coords.lng;
          console.log('[OllamaAgentService] Updated createGeoMark for', placeName, 'with coords:', coords);
        } else {
          console.warn('[OllamaAgentService] No geocode result for createGeoMark:', placeName);
        }
      }
    }

    // Use intent reasoning as plan reasoning
    const reasoning = intent.reasoning;

    // Build agent plan
    const plan: AgentPlan = {
      status: 'ready',
      reasoning,
      tools,
      executionResults: []
    };

    console.log('[OllamaAgentService] Plan generation complete:', plan);
    return plan;
  } catch (error) {
    console.error('[OllamaAgentService] Plan generation failed:', error);
    return null;
  }
}

/**
 * Build the plan generation prompt for Ollama
 * (Simplified - intent has already been clarified in Phase 1)
 */
function buildPlanPrompt(
  intent: ClarifiedIntent,
  locations: DetectedLocation[]
): string {
  const locationNames = locations.map(loc => loc.locationName).join(', ');

  return `Based on the user's clarified intent, generate an execution plan using available tools.

USER INTENT: ${intent.intent}

DETECTED LOCATIONS: ${locationNames || 'None'}

AVAILABLE TOOLS:
1. replaceText(targetText, replacementText) - Replace existing text in the document
2. insertText(html) - Insert HTML with embedded geo-marks: <span class="geo-mark" data-place-name="Location" data-lat="12.34" data-lng="56.78">Location</span>
3. insertMap() - Insert a map that auto-discovers geo-marks from surrounding context
4. geocode(placeName, country?, proximity?, zoom?) - Geocode a location to get coordinates (call this FIRST to get lat/lng)
5. setTransportation(toLocation, fromLocation, mode) - Set transportation between locations (mode: cycling/driving/walking/flying)

WORKFLOW FOR LOCATIONS (REQUIRED):
1. If user mentions a location, FIRST call geocode with qualification parameters to get coordinates
2. Use document context to provide hints: country, proximity to other locations, etc.
3. Then ALWAYS call insertText with HTML containing geo-mark spans with the resolved coordinates

CRITICAL: You MUST generate BOTH geocode AND insertText tools for any location-based input!

QUALIFICATION PARAMETERS:
- country: Use when you know the country from context (e.g., document mentions "Denmark")
- proximity: Use when you have nearby locations to bias results (e.g., document already has "Paris")
- zoom: Higher values = stronger proximity bias (default: 10)

IMPORTANT RULES:
- Geocode geographic locations: cities, countries, regions
- Geocode physical landmarks with specific locations: The Little Mermaid statue, Eiffel Tower, Statue of Liberty, etc.
- Geocode named attractions with fixed locations: museums, monuments, parks, buildings
- Do NOT geocode abstract events: concerts, shows, festivals (unless they mention a venue)
- Do NOT geocode activities without a specific place: "shopping", "dining", "sightseeing"
- ALWAYS provide qualification parameters (country, proximity) when you have context hints

Examples (ALWAYS generate BOTH tools for locations):
- "I want to visit Copenhagen" → MUST generate: geocode tool + insertText tool with HTML geo-mark
- "I want to see The Little Mermaid" → MUST generate: geocode tool + insertText tool with HTML geo-mark
- "I want to visit the Louvre Museum" → MUST generate: geocode tool + insertText tool with HTML geo-mark
- "I want to go shopping" → insertText only (no specific location, so no geocode needed)
- "I want to attend a concert" → insertText only (no venue specified, so no geocode needed)

You must respond with valid JSON in this exact format:
{
  "tools": [
    {
      "name": "toolName",
      "parameters": { /* tool parameters */ }
    }
  ]
}

IMPORTANT: Embed geo-marks DIRECTLY in the HTML - ONE insertText call with all locations marked.

HTML GEO-MARK FORMAT:
<span class="geo-mark" data-place-name="LocationName" data-lat="12.34" data-lng="56.78">LocationName</span>

Examples (NOTICE: TWO tools are generated for each location!):
- "I want to visit Copenhagen" (document mentions Denmark):
  CORRECT RESPONSE - TWO TOOLS:
  {"tools": [
    {"name": "geocode", "parameters": {"placeName": "Copenhagen", "country": "Denmark"}},
    {"name": "insertText", "parameters": {"html": "I want to visit <span class=\"geo-mark\" data-place-name=\"Copenhagen\" data-lat=\"55.6867\" data-lng=\"12.5701\">Copenhagen</span>"}}
  ]}

  WRONG RESPONSE - Only geocode (MISSING insertText!):
  {"tools": [{"name": "geocode", "parameters": {"placeName": "Copenhagen", "country": "Denmark"}}]}

- "I want to drive from Copenhagen to Stockholm" (European context):
  {"tools": [
    {"name": "geocode", "parameters": {"placeName": "Copenhagen", "country": "Denmark"}},
    {"name": "geocode", "parameters": {"placeName": "Stockholm", "country": "Sweden"}},
    {"name": "insertText", "parameters": {"html": "I want to drive from <span class=\"geo-mark\" data-place-name=\"Copenhagen\" data-lat=\"55.6867\" data-lng=\"12.5701\">Copenhagen</span> to <span class=\"geo-mark\" data-place-name=\"Stockholm\" data-lat=\"59.3333\" data-lng=\"18.0271\">Stockholm</span>"}},
    {"name": "setTransportation", "parameters": {"fromLocation": "Copenhagen", "toLocation": "Stockholm", "mode": "driving"}}
  ]}

- "then to Paris" (document has Berlin at 52.52, 13.40):
  {"tools": [
    {"name": "geocode", "parameters": {"placeName": "Paris", "country": "France", "proximity": {"lat": 52.52, "lng": 13.40}}},
    {"name": "insertText", "parameters": {"html": "then to <span class=\"geo-mark\" data-place-name=\"Paris\" data-lat=\"48.8566\" data-lng=\"2.3522\">Paris</span>"}}
  ]}

- "I want to go shopping" (no specific location):
  {"tools": [{"name": "insertText", "parameters": {"html": "I want to go shopping"}}]}

- Execute command "insert map": {"tools": [{"name": "insertMap", "parameters": {}}]}
- Replace text: {"tools": [{"name": "replaceText", "parameters": {"targetText": "old", "replacementText": "new"}}]}

NOTE: Do NOT include data-geo-id or data-color-index - these will be generated automatically!

Select appropriate tools and parameters to fulfill the user's intent.`;
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

    // The SDK returns the response directly, no need to parse JSON
    return response as OllamaResponse;
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
    const parsed = JSON.parse(content);

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
 * Execute geocode tool during plan generation
 * Uses qualification parameters (country, proximity) to resolve locations upfront
 * Prefers structured geocoding when country is provided for better accuracy
 */
async function executeGeocodeToolForPlanning(
  params: {
    placeName: string;
    country?: string;
    proximity?: { lat: number; lng: number };
    zoom?: number;
  }
): Promise<{ placeName: string; lat: number; lng: number } | null> {
  const { placeName, country, proximity, zoom } = params;

  console.log('[OllamaAgentService] Geocoding during planning:', placeName, 'with params:', { country, proximity });

  try {
    // Strategy 1: Use structured geocoding if we have country (most accurate)
    if (country) {
      console.log('[OllamaAgentService] Using structured geocoding for', placeName, 'in', country);

      const result = await geocodingService.geocodeStructured({
        city: placeName,
        country: country
      });

      if (result) {
        console.log('[OllamaAgentService] Structured geocoding resolved', placeName, 'to', result.placeName, `(${result.lat}, ${result.lng})`);
        return {
          placeName: result.placeName,
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lng)
        };
      } else {
        console.warn('[OllamaAgentService] Structured geocoding failed for', placeName, '- falling back to prefix search');
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

    let results = await geocodingService.searchByPrefix(
      placeName,
      proximity ? { lat: proximity.lat, lng: proximity.lng } : undefined,
      countryCodes
    );

    if (results.length === 0) {
      console.warn('[OllamaAgentService] No results found for:', placeName);
      return null;
    }

    // Return top result
    const selected = results[0];
    console.log('[OllamaAgentService] Prefix search resolved', placeName, 'to', selected.name, `(${selected.lat}, ${selected.lng})`);

    return {
      placeName: selected.name,
      lat: selected.lat,
      lng: selected.lng
    };
  } catch (error) {
    console.error('[OllamaAgentService] Geocoding error:', error);
    return null;
  }
}

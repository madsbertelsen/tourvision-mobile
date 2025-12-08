/**
 * Ollama Agent Service
 * Integrates with local Ollama LLM for intelligent voice input analysis
 */

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

/**
 * Check if Ollama is available and responsive
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response.ok;
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

    // Call Ollama with JSON format (not function calling)
    const response = await callOllama(messages);

    // Parse tool calls from JSON response
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
2. insertText(text) - Insert new text at cursor (does NOT auto-create geo-marks)
3. insertMap() - Insert a map that auto-discovers geo-marks from surrounding context
4. geocode(placeName, country?, proximity?, zoom?) - Geocode a location to get coordinates (call this FIRST for locations)
5. createGeoMark(text, placeName, lat, lng) - Mark text with coordinates (requires geocode first)
6. setTransportation(toLocation, fromLocation, mode) - Set transportation between locations (mode: cycling/driving/walking/flying)

WORKFLOW FOR LOCATIONS:
1. If user mentions a location (e.g., "Copenhagen"), first call geocode with qualification parameters
2. Use document context to provide hints: country, proximity to other locations, etc.
3. Then call createGeoMark with the resolved coordinates

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

Examples:
- "I want to visit Copenhagen" → geocode (city) → createGeoMark
- "I want to see The Little Mermaid" → geocode (landmark in Copenhagen) → createGeoMark
- "I want to visit the Louvre Museum" → geocode (museum in Paris) → createGeoMark
- "I want to go shopping" → insertText only (no specific location)
- "I want to attend a concert" → insertText only (no venue specified)

You must respond with valid JSON in this exact format:
{
  "tools": [
    {
      "name": "toolName",
      "parameters": { /* tool parameters */ }
    }
  ]
}

IMPORTANT: ALWAYS insert the COMPLETE text first in ONE insertText call, then create geo-marks afterward.
NEVER break up text into fragments like "from " + location + " to " + location.

Examples:
- "I want to visit Copenhagen" (document mentions Denmark):
  {"tools": [
    {"name": "insertText", "parameters": {"text": "I want to visit Copenhagen"}},
    {"name": "geocode", "parameters": {"placeName": "Copenhagen", "country": "Denmark"}},
    {"name": "createGeoMark", "parameters": {"text": "Copenhagen", "placeName": "Copenhagen"}}
  ]}

- "I might also go to visit The Little Mermaid" (document has Copenhagen at 55.68, 12.57):
  {"tools": [
    {"name": "insertText", "parameters": {"text": "I might also go to visit The Little Mermaid"}},
    {"name": "geocode", "parameters": {"placeName": "The Little Mermaid", "country": "Denmark", "proximity": {"lat": 55.68, "lng": 12.57}}},
    {"name": "createGeoMark", "parameters": {"text": "The Little Mermaid", "placeName": "The Little Mermaid"}}
  ]}

- "I want to drive my car from Copenhagen to Stockholm" (European context):
  {"tools": [
    {"name": "insertText", "parameters": {"text": "I want to drive my car from Copenhagen to Stockholm"}},
    {"name": "geocode", "parameters": {"placeName": "Copenhagen", "country": "Denmark"}},
    {"name": "createGeoMark", "parameters": {"text": "Copenhagen", "placeName": "Copenhagen"}},
    {"name": "geocode", "parameters": {"placeName": "Stockholm", "country": "Sweden"}},
    {"name": "createGeoMark", "parameters": {"text": "Stockholm", "placeName": "Stockholm"}},
    {"name": "setTransportation", "parameters": {"fromLocation": "Copenhagen", "toLocation": "Stockholm", "mode": "driving"}}
  ]}

- "then to Paris by train" (document already has Berlin at 52.52, 13.40):
  {"tools": [
    {"name": "insertText", "parameters": {"text": "then to Paris by train"}},
    {"name": "geocode", "parameters": {"placeName": "Paris", "country": "France", "proximity": {"lat": 52.52, "lng": 13.40}}},
    {"name": "createGeoMark", "parameters": {"text": "Paris", "placeName": "Paris"}}
  ]}

- Execute command "insert map": {"tools": [{"name": "insertMap", "parameters": {}}]}
- Replace text: {"tools": [{"name": "replaceText", "parameters": {"targetText": "old", "replacementText": "new"}}]}

NOTE: Do NOT include lat/lng in createGeoMark - they will be automatically populated from the geocode results!

Select appropriate tools and parameters to fulfill the user's intent.`;
}

/**
 * Call Ollama API with timeout
 */
async function callOllama(
  messages: OllamaMessage[],
  tools?: ToolDefinition[]
): Promise<OllamaResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

  try {
    const requestBody: any = {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      format: 'json'
    };

    // Only add tools if provided (for function calling mode)
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data: OllamaResponse = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Ollama request timed out');
    }

    throw error;
  }
}

/**
 * Parse tool calls from Ollama response (expects JSON format)
 */
function parseToolCalls(response: OllamaResponse): ToolCall[] {
  const tools: ToolCall[] = [];
  const content = response.message.content;

  try {
    // Parse JSON response
    const parsed = JSON.parse(content);

    if (!parsed.tools || !Array.isArray(parsed.tools)) {
      console.warn('[OllamaAgentService] No tools array in JSON response');
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

/**
 * Ollama Agent Service
 * Integrates with local Ollama LLM for intelligent voice input analysis
 */

import type { AgentPlan, ToolCall, OllamaMessage, OllamaResponse, ToolDefinition, ClarifiedIntent } from '../types/agent';
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
2. insertText(text) - Insert new text at cursor (automatically applies geo-marks to detected locations)
3. insertMap() - Insert a map that auto-discovers geo-marks from surrounding context
4. createGeoMark(text, placeName) - ONLY use to mark text that is ALREADY in the document but not yet marked

You must respond with valid JSON in this exact format:
{
  "tools": [
    {
      "name": "toolName",
      "parameters": { /* tool parameters */ }
    }
  ]
}

Examples:
- Execute command "insert map": {"tools": [{"name": "insertMap", "parameters": {}}]}
- Insert text: {"tools": [{"name": "insertText", "parameters": {"text": "I want to visit Copenhagen"}}]}
- Insert text + map: {"tools": [{"name": "insertText", "parameters": {"text": "I want to visit Copenhagen"}}, {"name": "insertMap", "parameters": {}}]}
- Replace text: {"tools": [{"name": "replaceText", "parameters": {"targetText": "old", "replacementText": "new"}}]}
- Mark existing text: {"tools": [{"name": "createGeoMark", "parameters": {"text": "Copenhagen", "placeName": "Copenhagen"}}]}

IMPORTANT RULES:
- If intent starts with "Execute command:", just execute the requested action - DO NOT insert text
- insertText automatically applies geo-marks to detected locations - DO NOT call createGeoMark after insertText
- Only use createGeoMark for text that is ALREADY in the document
- When adding text with locations, just use insertText (optionally followed by insertMap)

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

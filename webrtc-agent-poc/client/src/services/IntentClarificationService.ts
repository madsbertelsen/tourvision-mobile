/**
 * Intent Clarification Service
 * Multi-turn loop to understand user's true intent before generating execution plan
 */

import ollama from 'ollama/browser';
import type { EditorView } from 'prosemirror-view';
import type {
  IntentResult,
  ClarifiedIntent,
  AmbiguityQuestion,
  ToolDefinition,
  OllamaMessage,
  OllamaResponse
} from '../types/agent';

// Configuration
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'ministral-3:8b';
const OLLAMA_TIMEOUT = Number(import.meta.env.VITE_OLLAMA_TIMEOUT) || 30000;
const MAX_TURNS = 3;

/**
 * Main entry point: Clarify user intent through multi-turn LLM loop
 */
export async function clarifyIntent(
  transcript: string,
  documentContext: string,
  editorView: EditorView
): Promise<IntentResult> {
  console.log('[IntentClarificationService] Starting intent clarification');

  // Check if document already has a map
  const hasMap = checkForMapInDocument(editorView);
  console.log('[IntentClarificationService] Document has map:', hasMap);

  // Check if fullscreen map is currently open
  const isFullscreenMapOpen = checkForFullscreenMap();
  console.log('[IntentClarificationService] Fullscreen map open:', isFullscreenMapOpen);

  const messages: OllamaMessage[] = [
    {
      role: 'user',
      content: buildIntentPrompt(transcript, documentContext, hasMap, isFullscreenMapOpen)
    }
  ];

  // Define clarification tools
  const tools = [getMoreContextToolDefinition()];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    console.log(`[IntentClarificationService] Turn ${turn + 1}/${MAX_TURNS}`);

    try {
      const response = await callOllama(messages, tools);
      messages.push(response.message);

      // If LLM called tools, execute them
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        console.log('[IntentClarificationService] LLM called tools:', response.message.tool_calls);

        for (const toolCall of response.message.tool_calls) {
          if (toolCall.function.name === 'getMoreContext') {
            const result = executeGetMoreContext(
              toolCall.function.arguments,
              editorView
            );

            // Add tool result to messages
            messages.push({
              role: 'tool',
              content: JSON.stringify(result)
            });

            console.log('[IntentClarificationService] Tool result:', result);
          }
        }

        continue;  // LLM will respond to tool results in next turn
      }

      // No tool calls - check if intent is clear
      const intent = parseIntentFromResponse(response);
      if (intent && intent.confidence === 'high') {
        console.log('[IntentClarificationService] Intent is clear:', intent);
        return { type: 'clear', intent };
      }

      // Check if LLM needs user input
      const ambiguity = detectAmbiguity(response);
      if (ambiguity) {
        console.log('[IntentClarificationService] Ambiguity detected:', ambiguity);
        return { type: 'ambiguous', question: ambiguity };
      }

      // Continue reasoning in next turn
      console.log('[IntentClarificationService] Continuing reasoning...');

    } catch (error) {
      console.error('[IntentClarificationService] Error in turn:', error);
      break;
    }
  }

  // Max turns reached - return best guess
  console.warn('[IntentClarificationService] Max turns reached, using fallback');
  const lastMessage = messages[messages.length - 1];
  const intent = parseIntentFromResponse({ message: lastMessage } as OllamaResponse);

  if (intent) {
    return { type: 'clear', intent };
  }

  // Ultimate fallback - simple insert plan
  return {
    type: 'clear',
    intent: {
      intent: `1. Insert text: "${transcript}"`,  // Simple one-line plan
      confidence: 'low',
      reasoning: `User wants to insert text: "${transcript}"\n\nReasoning: Fallback - Max turns reached without clear intent`
    }
  };
}

/**
 * Check if document contains a map node
 */
function checkForMapInDocument(editorView: EditorView): boolean {
  let hasMap = false;
  editorView.state.doc.descendants((node) => {
    if (node.type.name === 'map') {
      hasMap = true;
      return false; // Stop searching
    }
  });
  return hasMap;
}

/**
 * Check if fullscreen map is currently open
 */
function checkForFullscreenMap(): boolean {
  // Check if the fullscreen overlay is visible (correct check used throughout codebase)
  return document.getElementById('fullscreen-overlay')?.classList.contains('visible') ?? false;
}

/**
 * Build the initial plan generation prompt
 */
function buildIntentPrompt(transcript: string, context: string, hasMap: boolean, isFullscreenMapOpen: boolean): string {
  const mapStatus = hasMap ? 'YES - A map already exists in the document' : 'NO - No map in the document yet';
  const fullscreenMapStatus = isFullscreenMapOpen ? 'OPEN - Fullscreen map is currently displayed' : 'CLOSED - Fullscreen map is not open';

  return `You are analyzing voice input to understand user intent and generate an execution plan.

DOCUMENT CONTEXT (for reference only - already in document):
"${context}"

MAP IN DOCUMENT: ${mapStatus}
FULLSCREEN MAP: ${fullscreenMapStatus}

VOICE INPUT (what the user just said):
"${transcript}"

YOUR TASK:
1. Understand what the user wants (user intent)
2. Generate a step-by-step action plan to fulfill that intent

STEP 1 - VALIDATE TRANSCRIPT:
Check if the transcript makes sense or if there are likely mistranscriptions.

If you detect a mistranscription:
- Set confidence='low'
- In ambiguity field, ask user to clarify
- Example: "ambiguity": "Could not understand 'Russ killed'. Could you spell that location name?"

STEP 2 - CLARIFICATION:
If you need more context to understand the intent, use the getMoreContext tool.
DO NOT generate a plan until you have enough information.

STEP 3 - GENERATE INTENT & PLAN (only when you have enough info):

USER INTENT: Natural language description of what the user wants
PLAN: Step-by-step actions to execute

LOCATION REFERENCING (CRITICAL):
- Check the DOCUMENT CONTEXT above for existing location mentions
- If a location is already mentioned in the document context, you can reference it directly in setTransportation
- Only use "Geocode" + "Insert text" if the location is NOT already in the document
- Example: Document contains "I visited Stockholm" → You can use "Set transportation from Stockholm to..." directly

Action format (each line is one action):
1. Geocode <location> - for extracting coordinates (only if location NOT in document)
2. Insert text: "<content with geo-marks>" - for adding content with location markers (only if location NOT in document)
3. Set transportation from <location1> to <location2> (<mode>) - for travel routes (can reference existing locations in document)
4. Insert map - for adding a map visualization (only if MAP IN DOCUMENT is NO)
5. Open fullscreen map - for opening fullscreen map (only if FULLSCREEN MAP is CLOSED)
6. Center map on <location> - for focusing map on a location (only if FULLSCREEN MAP is OPEN)
7. Replace "<old>" with "<new>" - for corrections

EXAMPLES:

Example 0a - NEW locations (locations NOT in document):
Input: "I want to drive from Stockholm to Oslo"
DOCUMENT CONTEXT: "" (empty - no existing locations)
Output:
{
  "userIntent": "User wants to document a driving trip from Stockholm to Oslo",
  "plan": "1. Geocode Stockholm\\n2. Geocode Oslo\\n3. Insert text: \\"I want to drive from Stockholm to Oslo\\" (with geo-marks)\\n4. Set transportation from Stockholm to Oslo (driving)"
}
Reasoning: Stockholm and Oslo are NOT in the document, so we need to geocode them and insert them as geo-marks before setting transportation.

Example 0b - EXISTING locations (locations already in document):
Input: "set transportation from Stockholm to Oslo to driving"
DOCUMENT CONTEXT: "I visited Stockholm yesterday. Then I went to Oslo."
Output:
{
  "userIntent": "User wants to set transportation mode between existing locations",
  "plan": "1. Set transportation from Stockholm to Oslo (driving)"
}
Reasoning: Stockholm and Oslo are ALREADY in the document context, so we can reference them directly. No need to geocode or insert text again.

Example 1 - Travel intent (map already exists):
Input: "I want to drive from Copenhagen to Stockholm"
MAP IN DOCUMENT: YES
Output:
{
  "userIntent": "User wants to document a driving trip from Copenhagen to Stockholm",
  "plan": "1. Geocode Copenhagen\n2. Geocode Stockholm\n3. Insert text: \"I want to drive from Copenhagen to Stockholm\" (with geo-marks)\n4. Set transportation from Copenhagen to Stockholm (driving)"
}
Note: No "Insert map" because map already exists

Example 2 - Simple location:
Input: "I want to visit Paris"
Output:
{
  "userIntent": "User wants to mention visiting Paris",
  "plan": "1. Geocode Paris\n2. Insert text: \"I want to visit Paris\" (with geo-marks)"
}

Example 3 - Open map (fullscreen map closed, no location):
Input: "open the map"
FULLSCREEN MAP: CLOSED
Output:
{
  "userIntent": "User wants to open the fullscreen map",
  "plan": "1. Open fullscreen map"
}

Example 3b - Open map with focus (fullscreen map closed, with location):
Input: "focus map on Copenhagen"
FULLSCREEN MAP: CLOSED
Output:
{
  "userIntent": "User wants to open the fullscreen map and focus on Copenhagen",
  "plan": "1. Geocode Copenhagen\n2. Open fullscreen map\n3. Center map on Copenhagen"
}

Example 3c - Focus map (fullscreen map already open):
Input: "focus map on Copenhagen"
FULLSCREEN MAP: OPEN
Output:
{
  "userIntent": "User wants to center the fullscreen map on Copenhagen",
  "plan": "1. Geocode Copenhagen\n2. Center map on Copenhagen"
}

Example 4 - Correction:
Input: "Stockholm" (context shows "stuck on")
Output:
{
  "userIntent": "User is correcting a mistranscription from 'stuck on' to 'Stockholm'",
  "plan": "1. Replace \"stuck on\" with \"Stockholm\""
}

IMPORTANT:
- Each plan line must be a single, clear action
- Use simple, imperative statements
- Include location names exactly as user said them
- ALWAYS check DOCUMENT CONTEXT first before deciding to geocode/insert locations
- For travel with NEW locations: include geocode + insert + set transportation
- For travel with EXISTING locations (in document): only include set transportation
- DO NOT include "Insert map" if MAP IN DOCUMENT is YES - a map already exists
- Only use "Insert map" if MAP IN DOCUMENT is NO and user explicitly asks for a map
- DO NOT include "Open fullscreen map" if FULLSCREEN MAP is OPEN - use "Center map on <location>" instead
- Only use "Open fullscreen map" if FULLSCREEN MAP is CLOSED
- Use getMoreContext tool if you need more information before generating the plan

TOOLS AVAILABLE:
- getMoreContext: Request additional document context to better understand user intent

Respond with valid JSON:
{
  "reasoning": "Brief analysis (1-2 sentences)",
  "confidence": "high|medium|low",
  "userIntent": "Natural language description of what user wants",
  "plan": "Line 1\\nLine 2\\nLine 3...",
  "ambiguity": "Only if confidence is low, what to ask user? (optional)"
}`;
}

/**
 * Call Ollama API with timeout using Ollama SDK
 */
async function callOllama(
  messages: OllamaMessage[],
  tools: ToolDefinition[]
): Promise<OllamaResponse> {
  try {
    const response = await Promise.race([
      ollama.chat({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        format: 'json',
        tools,
        keep_alive: 60  // Keep model loaded for 60s (enough for clarification loop)
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Ollama request timed out')), OLLAMA_TIMEOUT)
      )
    ]);

    return response as any as OllamaResponse;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Ollama error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Define getMoreContext tool for Ollama
 */
function getMoreContextToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'getMoreContext',
      description: 'Request additional document context beyond the initial 300 characters to better understand user intent',
      parameters: {
        type: 'object',
        required: ['direction'],
        properties: {
          direction: {
            type: 'string',
            enum: ['before', 'after', 'both'],
            description: 'Which direction to expand context: before cursor, after cursor, or both'
          },
          additionalChars: {
            type: 'number',
            description: 'Number of additional characters to retrieve (default: 200)'
          }
        }
      }
    }
  };
}

/**
 * Execute getMoreContext tool
 */
function executeGetMoreContext(
  params: { direction: string; additionalChars?: number },
  editorView: EditorView
): { context: string } {
  const { state } = editorView;
  const cursorPos = state.selection.from;
  const additionalChars = params.additionalChars || 200;

  let start = cursorPos;
  let end = cursorPos;

  if (params.direction === 'before' || params.direction === 'both') {
    start = Math.max(0, cursorPos - 300 - additionalChars);
  }

  if (params.direction === 'after' || params.direction === 'both') {
    end = Math.min(state.doc.content.size, cursorPos + additionalChars);
  }

  const context = state.doc.textBetween(start, end, ' ');

  console.log(`[IntentClarificationService] getMoreContext(${params.direction}, ${additionalChars}):`, context.substring(0, 100) + '...');

  return { context };
}

/**
 * Parse plan from LLM response (expects JSON format with userIntent and plan fields)
 */
function parseIntentFromResponse(response: OllamaResponse): ClarifiedIntent | null {
  const content = response.message.content;

  try {
    // Parse JSON response
    const parsed = JSON.parse(content);

    // Check for required fields
    if (!parsed.plan || !parsed.userIntent) {
      console.warn('[IntentClarificationService] Missing plan or userIntent field in JSON response');
      return null;
    }

    // Store both userIntent and plan
    const intent: ClarifiedIntent = {
      intent: parsed.plan,  // The plan text block (for execution)
      confidence: (parsed.confidence?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
      reasoning: `${parsed.userIntent}\n\nReasoning: ${parsed.reasoning || 'No reasoning provided'}`  // Combine userIntent and reasoning
    };

    console.log('[IntentClarificationService] User intent:', parsed.userIntent);
    console.log('[IntentClarificationService] Generated plan:\n', parsed.plan);
    return intent;
  } catch (error) {
    console.error('[IntentClarificationService] Failed to parse JSON response:', error);
    console.error('[IntentClarificationService] Raw content:', content);
    return null;
  }
}

/**
 * Detect if LLM identified ambiguity that requires user input
 */
function detectAmbiguity(response: OllamaResponse): AmbiguityQuestion | null {
  const content = response.message.content;

  try {
    // Parse JSON response
    const parsed = JSON.parse(content);

    // Check if confidence is low and ambiguity field exists
    if (parsed.confidence?.toLowerCase() !== 'low' || !parsed.ambiguity) {
      return null;
    }

    const questionText = parsed.ambiguity;

    // Parse options if present in the question text (format: "1. Option A, 2. Option B")
    const options: Array<{ label: string; value: string }> = [];
    const optionMatches = questionText.matchAll(/(\d+)\.\s*([^,\n]+)/g);

    for (const match of optionMatches) {
      const label = match[2].trim();
      options.push({
        label,
        value: label.toLowerCase().replace(/\s+/g, '_')
      });
    }

    // Detect if this is asking for spelling (mistranscription detected)
    const isSpellingRequest = questionText.toLowerCase().includes('spell') ||
                              questionText.toLowerCase().includes('could not understand');

    // If asking for spelling, provide spelling-specific options
    if (options.length === 0) {
      if (isSpellingRequest) {
        options.push(
          { label: 'Spell it', value: 'spell' },
          { label: 'Re-record', value: 're-record' }
        );
      } else {
        // Generic fallback options (should rarely be used)
        options.push(
          { label: 'Insert text only', value: 'insert' },
          { label: 'Insert with map', value: 'insert_with_map' }
        );
      }
    }

    return {
      question: questionText,
      options,
      requiresSpelling: isSpellingRequest  // Flag for voice-draft-sheet to trigger spelling mode
    };
  } catch (error) {
    console.error('[IntentClarificationService] Failed to parse JSON for ambiguity detection:', error);
    return null;
  }
}

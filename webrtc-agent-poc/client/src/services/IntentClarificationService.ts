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

  const messages: OllamaMessage[] = [
    {
      role: 'user',
      content: buildIntentPrompt(transcript, documentContext, hasMap)
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
      reasoning: 'Fallback: Max turns reached without clear intent'
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
 * Build the initial plan generation prompt
 */
function buildIntentPrompt(transcript: string, context: string, hasMap: boolean): string {
  const mapStatus = hasMap ? 'YES - A map already exists in the document' : 'NO - No map in the document yet';

  return `You are analyzing voice input to generate an execution plan for document editing.

DOCUMENT CONTEXT (for reference only - already in document):
"${context}"

MAP IN DOCUMENT: ${mapStatus}

VOICE INPUT (what the user just said):
"${transcript}"

YOUR TASK: Generate a step-by-step action plan. Each line should be one action to execute.

STEP 1 - VALIDATE TRANSCRIPT:
Check if the transcript makes sense or if there are likely mistranscriptions.

If you detect a mistranscription:
- Set confidence='low'
- In ambiguity field, ask user to clarify
- Example: "ambiguity": "Could not understand 'Russ killed'. Could you spell that location name?"

STEP 2 - GENERATE PLAN (only if transcript seems valid):

Action format (each line is one action):
1. Geocode <location> - for extracting coordinates
2. Insert text: "<content with geo-marks>" - for adding content with location markers
3. Set transportation from <location1> to <location2> (<mode>) - for travel routes
4. Insert map - for adding a map visualization
5. Open fullscreen map - for opening existing map
6. Replace "<old>" with "<new>" - for corrections

EXAMPLES:

Example 1 - Travel intent:
Input: "I want to drive from Copenhagen to Stockholm"
Plan:
1. Geocode Copenhagen
2. Geocode Stockholm
3. Insert text: "I want to drive from Copenhagen to Stockholm" (with geo-marks)
4. Set transportation from Copenhagen to Stockholm (driving)

Example 2 - Simple location:
Input: "I want to visit Paris"
Plan:
1. Geocode Paris
2. Insert text: "I want to visit Paris" (with geo-marks)

Example 3 - Map command:
Input: "open the map"
Plan:
1. Open fullscreen map

Example 4 - Correction:
Input: "Stockholm" (context shows "stuck on")
Plan:
1. Replace "stuck on" with "Stockholm"

IMPORTANT:
- Each line must be a single, clear action
- Use simple, imperative statements
- Include location names exactly as user said them
- For travel, always include both geocode + insert + set transportation

Respond with valid JSON:
{
  "reasoning": "Brief analysis (1-2 sentences)",
  "confidence": "high|medium|low",
  "plan": "Line 1\nLine 2\nLine 3...",
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
 * Parse plan from LLM response (expects JSON format with plan field)
 */
function parseIntentFromResponse(response: OllamaResponse): ClarifiedIntent | null {
  const content = response.message.content;

  try {
    // Parse JSON response
    const parsed = JSON.parse(content);

    if (!parsed.plan) {
      console.warn('[IntentClarificationService] Missing plan field in JSON response');
      return null;
    }

    // Store plan as intent for now (maintains compatibility with existing flow)
    const intent: ClarifiedIntent = {
      intent: parsed.plan,  // The plan text block
      confidence: (parsed.confidence?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
      reasoning: parsed.reasoning || 'No reasoning provided'
    };

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

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

  const messages: OllamaMessage[] = [
    {
      role: 'user',
      content: buildIntentPrompt(transcript, documentContext)
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

  // Ultimate fallback
  return {
    type: 'clear',
    intent: {
      intent: `Insert the text: "${transcript}"`,
      confidence: 'low',
      reasoning: 'Fallback: Max turns reached without clear intent'
    }
  };
}

/**
 * Build the initial intent clarification prompt
 */
function buildIntentPrompt(transcript: string, context: string): string {
  return `You are analyzing voice input to understand user intent for document editing.

DOCUMENT CONTEXT (for reference only - already in document):
"${context}"

VOICE INPUT (what the user just said):
"${transcript}"

YOUR TASK: Analyze the VOICE INPUT only. The context is just for reference to understand corrections.

STEP 1 - VALIDATE TRANSCRIPT:
Before determining intent, check if the transcript makes sense:
- Does it follow natural grammar and sentence structure?
- Are there nonsensical word combinations? (e.g., "Russ killed" when expecting a location name)
- Could this be a speech-to-text mistranscription?

Examples of likely mistranscriptions:
- "I want to visit Russ killed" → "Russ killed" doesn't make sense as a location (likely "Roskilde")
- "oh I did not mean Oscar but Russ killed" → "Russ killed" is grammatically odd (likely "Roskilde")
- "from Copenhagen to oscula" → "oscula" is not a known place (likely a mistranscribed location)

If you detect a likely mistranscription:
- Set confidence='low'
- In ambiguity field, ask user to spell the problematic word
- Example: "ambiguity": "Could not understand 'Russ killed'. Could you spell that location name?"

STEP 2 - DETERMINE INTENT (only if transcript seems valid):

1. COMMAND/INSTRUCTION: If the voice input is a command or instruction (e.g., "insert a map", "could you add a map", "show me a map"), recognize it as an ACTION, not literal text to insert
   - Intent should be: "Execute command: insert map" (NOT "Insert text: 'insert a map'")

2. CONTENT DICTATION: If the voice input is natural speech/content (e.g., "I want to visit Copenhagen"), assume HIGH confidence to INSERT it as text
   - Intent should be: "Insert text: 'I want to visit Copenhagen'"

3. CORRECTION: Only if you see clear evidence in the CONTEXT that the voice input is correcting a mistranscription (e.g., context has "stuck on" and voice input is "Stockholm"), then it's a REPLACEMENT
   - Intent should be: "Replace 'stuck on' with 'Stockholm'"

4. AMBIGUITY: Only mark as LOW confidence if the intent is genuinely unclear (e.g., "replace that" without context showing what "that" refers to)

IMPORTANT:
- First validate the transcript makes sense
- Only analyze the VOICE INPUT, not the DOCUMENT CONTEXT
- Proactively detect mistranscriptions based on grammar, context, and common sense

TOOLS AVAILABLE:
- getMoreContext: Only call if you cannot determine intent from current context

Respond with valid JSON:
{
  "reasoning": "Brief analysis (1-2 sentences)",
  "confidence": "high|medium|low",
  "intent": "Execute command: [action] OR Insert text: '[content]' OR Replace '[old]' with '[new]'",
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
        tools
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
 * Parse intent from LLM response (expects JSON format)
 */
function parseIntentFromResponse(response: OllamaResponse): ClarifiedIntent | null {
  const content = response.message.content;

  try {
    // Parse JSON response
    const parsed = JSON.parse(content);

    if (!parsed.intent) {
      console.warn('[IntentClarificationService] Missing intent field in JSON response');
      return null;
    }

    const intent: ClarifiedIntent = {
      intent: parsed.intent,
      confidence: (parsed.confidence?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
      reasoning: parsed.reasoning || 'No reasoning provided'
    };

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

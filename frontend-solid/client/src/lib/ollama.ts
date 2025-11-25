import { Ollama } from 'ollama/browser';
import { z } from 'zod';

// Ollama client configuration
// Default: http://127.0.0.1:11434
const OLLAMA_HOST = import.meta.env.VITE_OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.2';

// Create Ollama client
const ollama = new Ollama({ host: OLLAMA_HOST });

// Zod schema for location extraction
const LocationSchema = z.object({
  name: z.string().describe('The name of the geographic location'),
  context: z.string().describe('Brief context about why this location is mentioned')
});

const LocationExtractionSchema = z.object({
  locations: z.array(LocationSchema).describe('Array of extracted locations')
});

// JSON schema for Ollama structured outputs
const locationExtractionJsonSchema = {
  type: 'object',
  properties: {
    locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the geographic location' },
          context: { type: 'string', description: 'Brief context about why this location is mentioned' }
        },
        required: ['name', 'context']
      }
    }
  },
  required: ['locations']
};

// Export TypeScript type from Zod schema
export type LocationExtraction = z.infer<typeof LocationExtractionSchema>;

// Extract locations from HTML content using Ollama with structured outputs
export async function extractLocations(html: string): Promise<LocationExtraction> {
  console.log('[Ollama] Extracting locations from HTML:', html.slice(0, 200) + '...');

  const systemPrompt = `You are a location extraction assistant. Analyze the given HTML document and identify any geographic locations mentioned (cities, countries, landmarks, addresses, etc.).

The input is HTML from a rich text editor. Parse the HTML to understand the document structure (paragraphs, headings, etc.) and extract location names from the text content.

Extract all locations with their context. If no locations are found, return an empty locations array.`;

  try {
    const response = await ollama.chat({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: html }
      ],
      format: locationExtractionJsonSchema,
      options: {
        temperature: 0 // More deterministic completions for structured output
      },
      stream: false
    });

    const content = response.message.content;
    console.log('[Ollama] Response:', content);

    // Parse and validate with Zod
    const parsed = JSON.parse(content);
    const validated = LocationExtractionSchema.parse(parsed);

    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Ollama] Schema validation failed:', error.issues);
      return {
        locations: []
      };
    }
    console.error('[Ollama] API error:', error);
    throw error;
  }
}

// Generic chat completion
export async function chat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    model?: string;
  }
): Promise<string> {
  const response = await ollama.chat({
    model: options?.model || DEFAULT_MODEL,
    messages,
    stream: false
  });

  return response.message.content;
}

// Check if Ollama is available
export async function checkOllamaConnection(): Promise<boolean> {
  try {
    // List models to verify connection
    const models = await ollama.list();
    console.log('[Ollama] Connected. Available models:', models.models.map(m => m.name));
    return true;
  } catch (error) {
    console.error('[Ollama] Connection failed:', error);
    return false;
  }
}

// List available models
export async function listModels(): Promise<string[]> {
  const response = await ollama.list();
  return response.models.map(m => m.name);
}

export { ollama, OLLAMA_HOST, DEFAULT_MODEL, LocationExtractionSchema };

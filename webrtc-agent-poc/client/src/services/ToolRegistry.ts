/**
 * Registry of available tools for the voice agent
 * Defines tool schemas in Ollama function calling format
 */

import type { ToolDefinition, ToolCall } from '../types/agent';

/**
 * Tool 1: replaceText
 * Purpose: Replace existing text in the document with new text
 */
const replaceTextTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'replaceText',
    description: 'Replace existing text in the document with new text. Use this when correcting mistranscriptions, fixing typos, or updating existing content.',
    parameters: {
      type: 'object',
      required: ['targetText', 'replacementText'],
      properties: {
        targetText: {
          type: 'string',
          description: 'The exact text to find and replace in the document'
        },
        replacementText: {
          type: 'string',
          description: 'The new text to insert in place of the target text'
        },
        reason: {
          type: 'string',
          description: 'Optional explanation for why this replacement is needed (e.g., "Correcting mistranscription")'
        }
      }
    }
  }
};

/**
 * Tool 2: insertText
 * Purpose: Insert text at the cursor position or end of document
 */
const insertTextTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'insertText',
    description: 'Insert text at the cursor position or at the end of the document. Use this when adding new content that doesn\'t replace anything.',
    parameters: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: 'The text to insert into the document'
        },
        position: {
          type: 'string',
          enum: ['cursor', 'end'],
          description: 'Where to insert the text: at cursor position (default) or at the end of the document'
        }
      }
    }
  }
};

/**
 * Tool 3: insertMap
 * Purpose: Insert a map visualization that automatically shows geo-marks from the current context
 */
const insertMapTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'insertMap',
    description: 'Insert a map block that automatically discovers and displays geo-marks from the surrounding context (current section/heading). The map will parse all geo-marked locations in the same section.',
    parameters: {
      type: 'object',
      required: [],
      properties: {
        height: {
          type: 'number',
          description: 'Optional map height in pixels (default: 400)'
        }
      }
    }
  }
};

/**
 * Tool 4: createGeoMark
 * Purpose: Mark existing text as a geographic location without modifying content
 */
const createGeoMarkTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createGeoMark',
    description: 'Mark existing text in the document as a geographic location without modifying the text. Use this when location names are already in the document but not yet marked.',
    parameters: {
      type: 'object',
      required: ['text', 'placeName'],
      properties: {
        text: {
          type: 'string',
          description: 'The exact text in the document to mark as a location'
        },
        placeName: {
          type: 'string',
          description: 'The location name for the marker (should match a detected location)'
        }
      }
    }
  }
};

/**
 * All available tool definitions
 */
const ALL_TOOLS: ToolDefinition[] = [
  replaceTextTool,
  insertTextTool,
  insertMapTool,
  createGeoMarkTool
];

/**
 * Get all tool definitions for Ollama API
 */
export function getToolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS;
}

/**
 * Get a specific tool schema by name
 */
export function getToolSchema(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(tool => tool.function.name === name);
}

/**
 * Validate a tool call has required parameters
 */
export function validateToolCall(toolCall: ToolCall): boolean {
  const schema = getToolSchema(toolCall.name);
  if (!schema) {
    console.error(`[ToolRegistry] Unknown tool: ${toolCall.name}`);
    return false;
  }

  const required = schema.function.parameters.required;
  const params = toolCall.parameters;

  // Check all required parameters are present
  for (const param of required) {
    if (!(param in params) || params[param] === undefined || params[param] === null) {
      console.error(`[ToolRegistry] Missing required parameter "${param}" for tool "${toolCall.name}"`);
      return false;
    }
  }

  // Validate enum values if specified
  for (const [key, value] of Object.entries(params)) {
    const propSchema = schema.function.parameters.properties[key];
    if (propSchema?.enum && !propSchema.enum.includes(value as string)) {
      console.error(`[ToolRegistry] Invalid value "${value}" for parameter "${key}". Expected one of: ${propSchema.enum.join(', ')}`);
      return false;
    }
  }

  return true;
}

/**
 * Get a human-readable description of a tool call
 */
export function describeToolCall(toolCall: ToolCall): string {
  switch (toolCall.name) {
    case 'replaceText':
      return `Replace "${toolCall.parameters.targetText}" with "${toolCall.parameters.replacementText}"`;

    case 'insertText':
      const pos = toolCall.parameters.position || 'cursor';
      const preview = toolCall.parameters.text.substring(0, 50);
      return `Insert text at ${pos}: "${preview}${toolCall.parameters.text.length > 50 ? '...' : ''}"`;

    case 'insertMap':
      return `Insert map (will auto-discover geo-marks from context)`;

    case 'createGeoMark':
      return `Mark "${toolCall.parameters.text}" as ${toolCall.parameters.placeName}`;

    default:
      return `Execute ${toolCall.name}`;
  }
}

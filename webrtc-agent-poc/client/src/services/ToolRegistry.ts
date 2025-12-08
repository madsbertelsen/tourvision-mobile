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
 * Tool 4: geocode
 * Purpose: Geocode a location name to get coordinates (used during plan generation)
 */
const geocodeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'geocode',
    description: 'Geocode a location name to get coordinates. Provide qualification parameters (country, proximity) to help resolve ambiguous locations. You must call this before createGeoMark.',
    parameters: {
      type: 'object',
      required: ['placeName'],
      properties: {
        placeName: {
          type: 'string',
          description: 'The location name to geocode'
        },
        country: {
          type: 'string',
          description: 'Optional country code or name to filter results (e.g., "Denmark", "US", "FR"). Use this when you know the country from context.'
        },
        proximity: {
          type: 'object',
          description: 'Optional nearby location to bias results toward (e.g., {lat: 55.6761, lng: 12.5683})',
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' }
          }
        },
        zoom: {
          type: 'number',
          description: 'Optional zoom level for proximity bias (default: 10). Higher = stronger bias toward proximity.'
        }
      }
    }
  }
};

/**
 * Tool 5: createGeoMark
 * Purpose: Mark existing text as a geographic location with pre-resolved coordinates
 */
const createGeoMarkTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createGeoMark',
    description: 'Mark text with coordinates (requires geocode first). The coordinates will be automatically populated from the geocode tool results.',
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
          description: 'The location name for the marker (should match the placeName used in geocode)'
        },
        lat: {
          type: 'number',
          description: 'Latitude coordinate (will be automatically populated from geocode results)'
        },
        lng: {
          type: 'number',
          description: 'Longitude coordinate (will be automatically populated from geocode results)'
        }
      }
    }
  }
};

/**
 * Tool 6: setTransportation
 * Purpose: Configure transportation between two locations
 */
const setTransportationTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'setTransportation',
    description: 'Set transportation configuration between two locations. Use this when the user mentions travel methods like "bicycle to", "drive to", "walk to", "fly to", etc.',
    parameters: {
      type: 'object',
      required: ['toLocation', 'fromLocation', 'mode'],
      properties: {
        toLocation: {
          type: 'string',
          description: 'The destination location name'
        },
        fromLocation: {
          type: 'string',
          description: 'The origin location name'
        },
        mode: {
          type: 'string',
          enum: ['cycling', 'driving', 'walking', 'flying'],
          description: 'The transportation mode: cycling (bike/bicycle), driving (car), walking (foot), or flying (plane)'
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
  geocodeTool,
  createGeoMarkTool,
  setTransportationTool
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

    case 'geocode':
      const country = toolCall.parameters.country ? ` in ${toolCall.parameters.country}` : '';
      return `Geocode "${toolCall.parameters.placeName}"${country}`;

    case 'createGeoMark':
      const coords = toolCall.parameters.lat && toolCall.parameters.lng
        ? ` (${toolCall.parameters.lat.toFixed(4)}, ${toolCall.parameters.lng.toFixed(4)})`
        : '';
      return `Mark "${toolCall.parameters.text}" as ${toolCall.parameters.placeName}${coords}`;

    case 'setTransportation':
      return `Set ${toolCall.parameters.mode} from ${toolCall.parameters.fromLocation} to ${toolCall.parameters.toLocation}`;

    default:
      return `Execute ${toolCall.name}`;
  }
}

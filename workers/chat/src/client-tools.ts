/**
 * Client Tool Definitions
 *
 * Defines the schema for tools that are executed on the frontend client.
 * These schemas are used by the LLM to understand what tools are available
 * and how to call them.
 */

export interface ClientTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  delegateToClient: true; // Marks this as a client-executed tool
}

/**
 * Tool schemas for LLM function calling
 */
export const CLIENT_TOOLS: ClientTool[] = [
  {
    name: 'geocode',
    description: 'Get accurate geographic coordinates (latitude, longitude) for any location name. Use this whenever the user mentions a place that should be shown on the map. Returns the full place name, coordinates, and source.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The location name to geocode. Can be a city, landmark, address, or region. Examples: "Copenhagen, Denmark", "Lejre", "Eiffel Tower, Paris", "123 Main St, New York"'
        },
        biasCoords: {
          type: 'object',
          description: '(Optional) Approximate coordinates to bias the search. Useful for disambiguating common place names. Format: {lat: number, lng: number}'
        }
      },
      required: ['location']
    },
    delegateToClient: true
  },

  {
    name: 'route',
    description: 'Calculate a route between two locations with waypoints and transportation details. Use this when the user asks about travel routes, directions, or how to get from one place to another. Returns route geometry, distance, duration, and waypoints that can be used to populate geo-mark transportation attributes.',
    parameters: {
      type: 'object',
      properties: {
        fromLocation: {
          type: 'string',
          description: 'Starting location name. Examples: "Lejre, Denmark", "Central Station, Copenhagen"'
        },
        toLocation: {
          type: 'string',
          description: 'Destination location name. Examples: "Copenhagen, Denmark", "Tivoli Gardens"'
        },
        profile: {
          type: 'string',
          description: 'Transportation mode',
          enum: ['walking', 'driving', 'car', 'cycling', 'bike', 'transit', 'bus', 'train']
        }
      },
      required: ['fromLocation', 'toLocation', 'profile']
    },
    delegateToClient: true
  }

  // Future tool schemas:
  //
  // {
  //   name: 'weather',
  //   description: 'Get weather forecast for a location on a specific date',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       location: { type: 'string', description: 'Location name' },
  //       date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' }
  //     },
  //     required: ['location', 'date']
  //   },
  //   delegateToClient: true
  // },
  //
  // {
  //   name: 'distance',
  //   description: 'Calculate travel distance and duration between two locations',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       from: { type: 'string', description: 'Starting location' },
  //       to: { type: 'string', description: 'Destination location' },
  //       mode: {
  //         type: 'string',
  //         description: 'Travel mode',
  //         enum: ['walking', 'driving', 'cycling', 'transit']
  //       }
  //     },
  //     required: ['from', 'to']
  //   },
  //   delegateToClient: true
  // }
];

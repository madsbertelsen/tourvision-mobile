/**
 * Frontend Tool Registry
 *
 * Implements client-side tools that can be invoked by the LLM via the worker.
 * Tools are executed on the frontend to avoid rate limits and leverage browser capabilities.
 */

import { geocodeWithNominatim, GeocodeResult } from './nominatim';
import { fetchRouteWithCache, Waypoint } from './transportation-api';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface GeocodeToolArgs {
  location: string;
  biasCoords?: { lat: number; lng: number };
}

export interface RouteToolArgs {
  fromLocation: string;
  toLocation: string;
  profile: 'walking' | 'driving' | 'cycling' | 'transit';
}

/**
 * Tool registry - maps tool names to their implementations
 */
export const TOOL_REGISTRY = {
  /**
   * Geocode a location name to coordinates using Nominatim
   */
  geocode: async (args: GeocodeToolArgs): Promise<ToolResult> => {
    try {
      console.log('[ToolRegistry] Executing geocode:', args.location);

      const result = await geocodeWithNominatim(args.location, {
        biasCoords: args.biasCoords
      });

      if (!result) {
        return {
          success: false,
          error: `Location not found: ${args.location}`
        };
      }

      return {
        success: true,
        data: {
          place_name: result.displayName,
          lat: result.lat,
          lng: result.lng,
          source: result.source
        }
      };
    } catch (error) {
      console.error('[ToolRegistry] Geocode error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },

  /**
   * Calculate route between two locations with waypoints
   */
  route: async (args: RouteToolArgs): Promise<ToolResult> => {
    try {
      console.log('[ToolRegistry] Executing route:', args.fromLocation, '→', args.toLocation, 'via', args.profile);

      // First, geocode both locations
      const fromResult = await geocodeWithNominatim(args.fromLocation);
      const toResult = await geocodeWithNominatim(args.toLocation);

      if (!fromResult || !toResult) {
        return {
          success: false,
          error: `Failed to geocode locations: ${!fromResult ? args.fromLocation : args.toLocation}`
        };
      }

      // Map profile to transportation API format
      const profileMap: Record<string, 'walking' | 'driving' | 'cycling' | 'transit'> = {
        'walking': 'walking',
        'driving': 'driving',
        'car': 'driving',
        'cycling': 'cycling',
        'bike': 'cycling',
        'transit': 'transit',
        'bus': 'transit',
        'train': 'transit'
      };

      const mappedProfile = profileMap[args.profile] || 'driving';

      // Fetch route with waypoints
      const waypoints: Waypoint[] = [
        { lat: fromResult.lat, lng: fromResult.lng },
        { lat: toResult.lat, lng: toResult.lng }
      ];

      const routeDetails = await fetchRouteWithCache(mappedProfile, waypoints);

      return {
        success: true,
        data: {
          from: {
            place_name: fromResult.displayName,
            lat: fromResult.lat,
            lng: fromResult.lng
          },
          to: {
            place_name: toResult.displayName,
            lat: toResult.lat,
            lng: toResult.lng
          },
          profile: mappedProfile,
          distance: routeDetails.distance,
          duration: routeDetails.duration,
          geometry: routeDetails.geometry,
          waypoints: routeDetails.geometry.coordinates.map(coord => ({
            lng: coord[0],
            lat: coord[1]
          }))
        }
      };
    } catch (error) {
      console.error('[ToolRegistry] Route error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Future tools can be added here:
  //
  // weather: async (args: { location: string; date: string }) => { ... },
  //
  // distance: async (args: { from: string; to: string; mode: string }) => { ... }
};

export type ToolName = keyof typeof TOOL_REGISTRY;

/**
 * Execute a tool by name with arguments
 */
export async function executeTool(
  toolName: string,
  args: any
): Promise<ToolResult> {
  const tool = TOOL_REGISTRY[toolName as ToolName];

  if (!tool) {
    console.error('[ToolRegistry] Unknown tool:', toolName);
    return {
      success: false,
      error: `Unknown tool: ${toolName}`
    };
  }

  try {
    return await tool(args);
  } catch (error) {
    console.error('[ToolRegistry] Tool execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

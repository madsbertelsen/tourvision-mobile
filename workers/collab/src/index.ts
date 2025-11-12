/**
 * Cloudflare Worker for Y.js collaboration with y-partyserver
 *
 * Uses PartyKit's standard routing: /parties/:server/:room
 * The YjsRoom Durable Object (YServer) handles all Y.js sync automatically.
 */

import { routePartykitRequest } from "partyserver";

export { YjsRoom } from './YjsRoom';

export interface Env extends Record<string, unknown> {
  YJS_ROOM: DurableObjectNamespace;
  JWT_SECRET?: string; // Optional: for JWT verification
  MAPBOX_TOKEN?: string; // Mapbox API token for routing
}

/**
 * Main Worker fetch handler
 * Uses PartyKit's routePartykitRequest for standard routing
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight handler
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Upgrade',
        },
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'tourvision-collab-y-partyserver',
        version: '2.0.0'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Route API endpoint
    if (url.pathname === '/api/route' && request.method === 'GET') {
      try {
        const searchParams = url.searchParams;

        // Support both old 'coordinates' param and new 'waypoints' param
        const coordinates = searchParams.get('coordinates');
        const waypoints = searchParams.get('waypoints') || coordinates;
        const profile = searchParams.get('profile') || searchParams.get('mode') || 'driving';

        if (!waypoints) {
          return new Response(JSON.stringify({ error: 'Waypoints are required' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        // Map transport profiles to Mapbox profiles
        const mapboxProfile = {
          'walking': 'walking',
          'driving': 'driving-traffic',
          'cycling': 'cycling',
          'transit': 'walking', // Use walking as approximation for transit
          'car': 'driving-traffic',
          'bike': 'cycling',
        }[profile] || profile;

        // Mapbox Directions API
        const mapboxToken = env.MAPBOX_TOKEN;

        if (!mapboxToken) {
          return new Response(JSON.stringify({ error: 'Mapbox token not configured' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${waypoints}?geometries=geojson&access_token=${mapboxToken}`;

        const mapboxResponse = await fetch(mapboxUrl);

        if (!mapboxResponse.ok) {
          throw new Error(`Mapbox API error: ${mapboxResponse.statusText}`);
        }

        const data = await mapboxResponse.json();

        if (!data.routes || data.routes.length === 0) {
          return new Response(JSON.stringify({ error: 'No route found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            }
          });
        }

        // Return the first route with cache headers
        const route = data.routes[0];

        return new Response(JSON.stringify({
          geometry: route.geometry,
          distance: route.distance, // in meters
          duration: route.duration, // in seconds
          legs: route.legs, // detailed segments if there are waypoints
          profile: profile, // Include the requested profile
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      } catch (error) {
        console.error('Route API error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch route' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }

    // Log all requests for debugging
    console.log('[Worker] Incoming request:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries())
    });

    // Use PartyKit's standard routing: /parties/:server/:room
    // This automatically routes to the correct Durable Object based on the URL pattern
    const response = await routePartykitRequest(request, env);

    if (response) {
      // Add CORS headers to PartyKit responses
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Upgrade');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
        webSocket: response.webSocket,
      });
    }

    // Fallback for non-PartyKit routes
    return new Response('Not Found', {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  },
};

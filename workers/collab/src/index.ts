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
}

/**
 * Main Worker fetch handler
 * Uses PartyKit's routePartykitRequest for standard routing
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Health check endpoint (before PartyKit routing)
    const url = new URL(request.url);
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

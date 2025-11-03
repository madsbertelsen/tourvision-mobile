/**
 * Cloudflare Worker for Y.js collaboration with PartyKit
 *
 * PartyKit simplifies routing and authentication.
 * The YjsRoom Durable Object handles all Y.js sync automatically.
 */

import type * as Party from "partyserver";

export { YjsRoom } from './YjsRoom';

export interface Env {
  YJS_ROOM: DurableObjectNamespace;
  JWT_SECRET?: string; // Optional: for JWT verification
}

/**
 * Main Worker fetch handler
 * Simplified with PartyKit - just handles routing and CORS
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Upgrade',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'tourvision-collab-partykit',
        version: '2.0.0'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // PartyKit routing: /party/:roomId
    // Extract room ID from path
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Support both /party/:roomId and /:roomId formats
    let roomId: string;
    if (pathParts[0] === 'party' && pathParts[1]) {
      roomId = pathParts[1];
    } else if (pathParts[0]) {
      roomId = pathParts[0];
    } else {
      return new Response('Invalid path. Use /party/:roomId or /:roomId', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    console.log('[Worker] Routing to room:', roomId);

    // Get Durable Object ID for this room
    const id = env.YJS_ROOM.idFromName(roomId);
    const stub = env.YJS_ROOM.get(id);

    // Forward request to Durable Object (PartyKit handles the rest)
    const response = await stub.fetch(request);

    // Add CORS headers to response
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Credentials', 'true');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
      webSocket: response.webSocket,
    });
  },
};

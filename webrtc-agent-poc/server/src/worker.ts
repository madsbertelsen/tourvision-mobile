/**
 * Cloudflare Worker - Main Entry Point
 *
 * Handles HTTP requests and WebSocket upgrades
 * Routes signaling traffic to Durable Objects
 */

import { SignalingDurableObject } from './SignalingDurableObject.js';
import type { ServerInfoResponse } from './types/signaling.js';

export { SignalingDurableObject };

export interface Env {
  SIGNALING: DurableObjectNamespace;
  ASSETS: Fetcher;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    if (pathname === '/api') {
      const info: ServerInfoResponse = {
        status: 'ok',
        service: 'WebRTC Signaling Server (Cloudflare Workers)',
        version: '2.0.0',
        protocol: 'y-webrtc',
        usage: 'WebSocket URL: wss://[host]/signaling/[documentId]'
      };
      return new Response(JSON.stringify(info), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // TURN credentials endpoint
    if (pathname === '/api/turn-credentials') {
      return handleTurnCredentials(env, corsHeaders);
    }

    // WebSocket upgrade for signaling
    const signalingMatch = pathname.match(/^\/signaling\/([^/]+)$/);
    if (signalingMatch) {
      const documentId = decodeURIComponent(signalingMatch[1]);

      // Get or create Durable Object for this document
      const id = env.SIGNALING.idFromName(documentId);
      const stub = env.SIGNALING.get(id);

      // Forward the request to the Durable Object
      return stub.fetch(request);
    }

    // Debug WebSocket endpoint
    if (pathname === '/debug-ws') {
      // Use a special debug Durable Object
      const id = env.SIGNALING.idFromName('__debug__');
      const stub = env.SIGNALING.get(id);
      return stub.fetch(request);
    }

    // Handle document URLs - rewrite to editor page
    const docMatch = pathname.match(/^\/doc\/([^/]+)$/);
    if (docMatch) {
      // Rewrite URL to /editor while preserving query string
      const editorUrl = new URL('/editor', request.url);
      editorUrl.search = url.search; // Preserve query parameters
      const rewrittenRequest = new Request(editorUrl.toString(), request);
      return env.ASSETS.fetch(rewrittenRequest);
    }

    // Redirect root to landing page
    if (pathname === '/') {
      return Response.redirect(new URL('/landing', request.url), 302);
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  }
};

/**
 * Handle TURN credentials request
 */
async function handleTurnCredentials(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const TURN_KEY_ID = env.TURN_KEY_ID;
  const TURN_KEY_API_TOKEN = env.TURN_KEY_API_TOKEN;

  if (!TURN_KEY_ID || !TURN_KEY_API_TOKEN) {
    return new Response(
      JSON.stringify({
        error: 'TURN credentials not configured',
        message: 'Set TURN_KEY_ID and TURN_KEY_API_TOKEN environment variables'
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const turnApiUrl = `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate-ice-servers`;

    const turnResponse = await fetch(turnApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }), // 24 hours
    });

    if (!turnResponse.ok) {
      const errorText = await turnResponse.text();
      console.error('[Worker] Failed to generate TURN credentials:', errorText);
      return new Response(
        JSON.stringify({
          error: 'Failed to generate TURN credentials',
          details: errorText,
          status: turnResponse.status
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const turnData: any = await turnResponse.json();

    // Filter out port 53 (blocked by browsers)
    if (turnData.iceServers && Array.isArray(turnData.iceServers)) {
      turnData.iceServers = turnData.iceServers.map((server: any) => {
        if (server.urls && Array.isArray(server.urls)) {
          server.urls = server.urls.filter((url: string) => !url.includes(':53'));
        }
        return server;
      }).filter((server: any) =>
        server.urls && (Array.isArray(server.urls) ? server.urls.length > 0 : true)
      );
    }

    return new Response(JSON.stringify(turnData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[Worker] Error fetching TURN credentials:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

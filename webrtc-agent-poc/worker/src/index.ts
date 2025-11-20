/**
 * Cloudflare Worker - WebRTC Signaling Server
 *
 * Routes requests to SignalingDurableObject instances per document.
 */

import { SignalingDurableObject } from './SignalingDO';

export { SignalingDurableObject };

export interface Env {
  SIGNALING: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // GET / - Health check
    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'WebRTC Agent POC Signaling Server',
        version: '2.0.0',
        protocol: 'WebSocket (y-webrtc compatible)',
        usage: 'Connect to ws://host/signaling/:documentId'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // /signaling/:documentId/* - Route to Durable Object
    const signalingMatch = path.match(/^\/signaling\/([^/]+)(\/.*)?$/);
    if (signalingMatch) {
      const documentId = signalingMatch[1];
      const subPath = signalingMatch[2] || '/';

      // Get Durable Object for this document
      const id = env.SIGNALING.idFromName(documentId);
      const stub = env.SIGNALING.get(id);

      // Forward request to Durable Object with modified path
      const doUrl = new URL(request.url);
      doUrl.pathname = subPath;

      const doRequest = new Request(doUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      return stub.fetch(doRequest);
    }

    // 404 for unknown routes
    return new Response('Not found. Use /signaling/:documentId/signal or /signaling/:documentId/poll', {
      status: 404,
      headers: corsHeaders
    });
  },
};

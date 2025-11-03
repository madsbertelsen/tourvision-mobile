/**
 * Cloudflare Worker for Y.js collaboration
 *
 * Handles:
 * - JWT authentication
 * - WebSocket upgrade
 * - Routing to appropriate Durable Object by document ID
 * - CORS headers
 */

export { YjsRoom } from './YjsRoom';

export interface Env {
  YJS_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
}

/**
 * Verify JWT token
 * Reuses the same JWT format as TipTap Cloud (HS256)
 */
async function verifyJWT(token: string, secret: string): Promise<any> {
  try {
    // Split token into parts
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error('Invalid token format');
    }

    // Decode payload
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    // Verify signature using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature
    const signatureBytes = Uint8Array.from(
      atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );

    // Verify
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      data
    );

    if (!valid) {
      throw new Error('Invalid signature');
    }

    return payload;
  } catch (error) {
    console.error('[Worker] JWT verification failed:', error);
    return null;
  }
}

/**
 * Main Worker fetch handler
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Extract document ID from path: /collab/:documentId
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2 || pathParts[0] !== 'collab') {
      return new Response('Invalid path. Use /collab/:documentId', { status: 400 });
    }

    const documentId = pathParts[1];
    console.log('[Worker] Request for document:', documentId);

    // Get token from query parameter or Authorization header
    const token = url.searchParams.get('token') ||
                  request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return new Response('Authentication required', {
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Verify JWT
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response('Invalid or expired token', {
        status: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Check if token allows access to this document
    const allowedDocs = payload.allowedDocumentNames || [];
    if (!allowedDocs.includes(documentId)) {
      console.warn('[Worker] Token does not allow access to document:', documentId);
      return new Response('Access denied for this document', {
        status: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    console.log('[Worker] Authentication successful for user:', payload.userId);

    // Get Durable Object ID for this document
    const id = env.YJS_ROOM.idFromName(documentId);
    const stub = env.YJS_ROOM.get(id);

    // Forward request to Durable Object
    const response = await stub.fetch(request);

    // Add CORS headers to response
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
      webSocket: response.webSocket,
    });
  },
};

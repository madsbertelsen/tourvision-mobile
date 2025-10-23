import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64url encoding helper
function encode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  const base64 = btoa(String.fromCharCode(...bytes));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate JWT token for Tiptap Cloud authentication
 *
 * According to Tiptap Cloud docs, the JWT must be signed with HS256
 * and include the following claims:
 * - iat: issued at timestamp
 * - nbf: not before timestamp
 * - exp: expiration timestamp (optional, but recommended)
 * - iss: issuer (https://cloud.tiptap.dev)
 * - aud: audience (your Tiptap app ID)
 * - sub: subject (user ID) - optional but recommended
 * - allowedDocumentNames: array of document names this token can access
 *
 * The WebSocket URL format for Tiptap Cloud is:
 * https://APP_ID.collab.tiptap.cloud (NOT wss://)
 * HocuspocusProvider handles the WebSocket upgrade internally.
 */
async function generateTiptapJWT(
  appSecret: string,
  documentName: string,
  userId: string,
  userName: string
): Promise<string> {
  // JWT Header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);

  // JWT Payload - matching the working format from tests
  const payload = {
    iat: now,
    nbf: now,  // Not before timestamp
    exp: now + (24 * 60 * 60), // 24 hours from now
    iss: 'https://cloud.tiptap.dev',  // Issuer
    aud: 'yko82w79',  // Audience (App ID)

    // Optional but recommended fields
    sub: userId, // Subject (user identifier)
    allowedDocumentNames: [documentName],
  };

  // Encode header and payload
  const encodedHeader = encode(JSON.stringify(header));
  const encodedPayload = encode(JSON.stringify(payload));

  // Create signature using HMAC-SHA256
  const message = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );

  const encodedSignature = encode(new Uint8Array(signature));

  // Combine into JWT
  return `${message}.${encodedSignature}`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Create Supabase client to verify the user's JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the user from the Supabase JWT
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }

    // Parse request body
    const { documentName } = await req.json();
    if (!documentName) {
      throw new Error('Missing documentName in request body');
    }

    // Get Tiptap App Secret from environment
    const tiptapAppSecret = Deno.env.get('TIPTAP_APP_SECRET');
    if (!tiptapAppSecret) {
      throw new Error('TIPTAP_APP_SECRET not configured');
    }

    // Generate Tiptap JWT
    const tiptapToken = await generateTiptapJWT(
      tiptapAppSecret,
      documentName,
      user.id,
      user.email?.split('@')[0] || 'Unknown User'
    );

    console.log('[TiptapToken] Generated token for user:', user.id, 'document:', documentName);

    return new Response(
      JSON.stringify({ token: tiptapToken }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[TiptapToken] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

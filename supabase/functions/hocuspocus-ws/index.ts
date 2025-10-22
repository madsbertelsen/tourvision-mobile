import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Hocuspocus } from 'npm:@hocuspocus/server@2.13.5';
import * as Y from 'npm:yjs@13.6.18';

console.log('[Hocuspocus Edge] Starting WebSocket server...');

// Initialize Supabase client for persistence
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create Hocuspocus instance
const hocuspocus = new Hocuspocus({
  name: 'Hocuspocus Edge Function',

  // Validate tokens with Supabase
  async onAuthenticate({ token, documentName, context }) {
    console.log('[Hocuspocus Edge] Auth attempt for document:', documentName);

    // Token comes from context (query param) or connection parameter
    const authToken = token || context?.token;

    if (!authToken) {
      throw new Error('Authentication required');
    }

    // Check if service role key (for AI)
    if (authToken === supabaseServiceKey) {
      console.log('[Hocuspocus Edge] Authenticated as AI Assistant');
      return {
        user: {
          id: 'ai-assistant',
          email: 'ai@system'
        }
      };
    }

    // Regular JWT token
    const { data: { user }, error } = await supabase.auth.getUser(authToken);

    if (error || !user) {
      console.error('[Hocuspocus Edge] Auth failed:', error?.message);
      throw new Error('Invalid token');
    }

    console.log('[Hocuspocus Edge] Authenticated user:', user.email);

    return {
      user: {
        id: user.id,
        email: user.email
      }
    };
  },

  // Load document from Supabase
  async onLoadDocument({ documentName }) {
    console.log('[Hocuspocus Edge] Loading document:', documentName);

    try {
      const { data, error } = await supabase
        .from('trips')
        .select('yjs_state')
        .eq('id', documentName)
        .single();

      if (error) {
        console.error('[Hocuspocus Edge] Load error:', error.message);
        return null;
      }

      if (!data?.yjs_state) {
        console.log('[Hocuspocus Edge] No existing state, creating new');
        return null;
      }

      console.log('[Hocuspocus Edge] Loaded state:', data.yjs_state.length, 'bytes');
      return data.yjs_state;
    } catch (error) {
      console.error('[Hocuspocus Edge] Error loading:', error);
      return null;
    }
  },

  // Save document to Supabase
  async onStoreDocument({ documentName, document }) {
    console.log('[Hocuspocus Edge] Storing document:', documentName);

    try {
      const binary = Y.encodeStateAsUpdate(document);

      const { error } = await supabase
        .from('trips')
        .update({
          yjs_state: binary,
          yjs_clock: Date.now(),
          updated_at: new Date().toISOString()
        })
        .eq('id', documentName);

      if (error) {
        console.error('[Hocuspocus Edge] Store error:', error.message);
        throw error;
      }

      console.log('[Hocuspocus Edge] Stored successfully');
    } catch (error) {
      console.error('[Hocuspocus Edge] Error storing:', error);
    }
  },

  async onConnect({ documentName, socketId }) {
    console.log('[Hocuspocus Edge] Client connected:', documentName, socketId);
  },

  async onDisconnect({ documentName, socketId }) {
    console.log('[Hocuspocus Edge] Client disconnected:', documentName, socketId);
  },

  // Persistence settings
  debounce: 2000,
  maxDebounce: 10000,
});

console.log('[Hocuspocus Edge] Hocuspocus instance created');

// Serve WebSocket connections
serve((req) => {
  const upgrade = req.headers.get('upgrade') || '';

  // Health check endpoint
  if (req.method === 'GET' && !upgrade) {
    return new Response(
      JSON.stringify({
        name: 'Hocuspocus Edge Function',
        status: 'running',
        version: '1.0.0',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Check for WebSocket upgrade
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response("Request isn't trying to upgrade to WebSocket", {
      status: 400,
    });
  }

  // Extract token from query params (WebSocket clients can't send custom headers)
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  console.log('[Hocuspocus Edge] WebSocket upgrade request, token:', token ? 'present' : 'missing');

  // Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req);

  // Let Hocuspocus handle the WebSocket connection
  // Pass token via context since it came from query params
  const context = {
    token: token || null,
  };

  try {
    // Hocuspocus handleConnection expects a WebSocket-like object
    // Deno's WebSocket API should be compatible
    hocuspocus.handleConnection(socket, req, context);
    console.log('[Hocuspocus Edge] Connection handed to Hocuspocus');
  } catch (error) {
    console.error('[Hocuspocus Edge] Error handling connection:', error);
    socket.close(1011, 'Internal server error');
  }

  return response;
});

console.log('[Hocuspocus Edge] Server started and listening for connections');

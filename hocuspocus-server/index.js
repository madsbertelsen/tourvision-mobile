import { Hocuspocus } from '@hocuspocus/server';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import expressWebsockets from 'express-ws';
import dotenv from 'dotenv';
import * as Y from 'yjs';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 1234;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing required environment variables');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file');
  process.exit(1);
}

// Create Supabase client with service role key for server-side operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('[Hocuspocus] Starting server...');
console.log('[Hocuspocus] Supabase URL:', SUPABASE_URL);

// Create Hocuspocus instance
const hocuspocus = new Hocuspocus({
  name: 'TourVision Collaboration Server',

  // Validate user tokens with Supabase
  async onAuthenticate({ token, documentName }) {
    console.log('[Hocuspocus] Authentication attempt for document:', documentName);

    if (!token) {
      console.warn('[Hocuspocus] No token provided');
      throw new Error('Authentication required');
    }

    try {
      // Check if this is a service role key (used by Edge Functions)
      if (token === SUPABASE_SERVICE_ROLE_KEY) {
        console.log('[Hocuspocus] Authenticated as service role (AI Assistant)');
        return {
          user: {
            id: 'ai-assistant',
            email: 'ai@system'
          }
        };
      }

      // Regular JWT token from user
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.error('[Hocuspocus] Authentication failed:', error?.message);
        throw new Error('Invalid token');
      }

      console.log('[Hocuspocus] Authenticated user:', user.email);

      // Return user data to be available in other hooks
      return {
        user: {
          id: user.id,
          email: user.email
        }
      };
    } catch (error) {
      console.error('[Hocuspocus] Authentication error:', error);
      throw new Error('Authentication failed');
    }
  },

  // Load document from Supabase
  async onLoadDocument({ documentName, context }) {
    console.log('[Hocuspocus] Loading document:', documentName);

    try {
      // Query the trips table for the Y.js state
      const { data, error } = await supabase
        .from('trips')
        .select('yjs_state')
        .eq('id', documentName)
        .single();

      if (error) {
        console.error('[Hocuspocus] Error loading document:', error.message);
        // Return null to create new empty document
        return null;
      }

      if (!data?.yjs_state) {
        console.log('[Hocuspocus] No existing Y.js state, creating new document');
        return null;
      }

      // Y.js state is stored as bytea (Uint8Array)
      console.log('[Hocuspocus] Y.js state loaded successfully, size:', data.yjs_state.length, 'bytes');
      return data.yjs_state;
    } catch (error) {
      console.error('[Hocuspocus] Error in onLoadDocument:', error);
      return null;
    }
  },

  // Save document to Supabase (debounced - called every few seconds for changed docs)
  async onStoreDocument({ documentName, document, context }) {
    console.log('[Hocuspocus] Storing document:', documentName);

    try {
      // Encode Y.Doc to binary
      const binary = Y.encodeStateAsUpdate(document);

      console.log('[Hocuspocus] Encoded document size:', binary.length, 'bytes');

      // Update the trips table with Y.js state
      // Note: yjs_clock is not needed with Hocuspocus - Y.js state binary contains all version info
      const { error } = await supabase
        .from('trips')
        .update({
          yjs_state: binary,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentName);

      if (error) {
        console.error('[Hocuspocus] Error storing document:', error.message);
        throw error;
      }

      console.log('[Hocuspocus] Document stored successfully');
    } catch (error) {
      console.error('[Hocuspocus] Error in onStoreDocument:', error);
      // Don't throw - we don't want to crash the server on storage errors
    }
  },

  // Called when a connection is established
  async onConnect({ documentName, context, socketId }) {
    console.log('[Hocuspocus] Client connected to document:', documentName, 'socketId:', socketId);
    console.log('[Hocuspocus] User:', context.user?.email || 'anonymous');
  },

  // Called when a connection is closed
  async onDisconnect({ documentName, context, socketId }) {
    console.log('[Hocuspocus] Client disconnected from document:', documentName, 'socketId:', socketId);
  },

  // Called when document changes
  async onChange({ documentName, context }) {
    console.log('[Hocuspocus] Document changed:', documentName);
  },

  // Debounce time before calling onStoreDocument (ms)
  debounce: 2000,

  // Maximum debounce time - force save after this time even if still changing (ms)
  maxDebounce: 10000,
});

// Set up Express with WebSocket support
const { app } = expressWebsockets(express());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'TourVision Hocuspocus Server',
    status: 'running',
    version: '1.0.0',
    supabase: {
      url: SUPABASE_URL,
      connected: true
    }
  });
});

// WebSocket endpoint for Hocuspocus
app.ws('/collaboration', (websocket, request) => {
  console.log('[Hocuspocus] New WebSocket connection');

  // You can extract additional context from the request here
  const context = {
    ip: request.ip,
    userAgent: request.headers['user-agent']
  };

  hocuspocus.handleConnection(websocket, request, context);
});

// Start the server
app.listen(PORT, () => {
  console.log(`[Hocuspocus] Server listening on http://127.0.0.1:${PORT}`);
  console.log(`[Hocuspocus] WebSocket endpoint: ws://127.0.0.1:${PORT}/collaboration`);
  console.log(`[Hocuspocus] Health check: http://127.0.0.1:${PORT}/`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Hocuspocus] Shutting down gracefully...');
  await hocuspocus.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Hocuspocus] Shutting down gracefully...');
  await hocuspocus.destroy();
  process.exit(0);
});

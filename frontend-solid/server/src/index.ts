import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupWSConnection, initPersistence, registerOrchestrator } from './yjs-server.js';
import { createSignalingServer } from './signaling-server.js';

dotenv.config();

const PORT = process.env.PORT || 8788;
const SIGNALING_PORT = process.env.SIGNALING_PORT || 4444;
const STORAGE_PATH = process.env.STORAGE_PATH || './yjs-storage';

const app = express();

// Enable CORS for development
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5175',
  credentials: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server with noServer option
const wss = new WebSocketServer({ noServer: true });

// Initialize persistence
initPersistence(STORAGE_PATH);

// Handle WebSocket upgrade manually
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  // Handle orchestrator WebSocket connection
  if (url.pathname === '/orchestrator') {
    console.log('[Server] Orchestrator connecting');
    wss.handleUpgrade(req, socket, head, (ws) => {
      registerOrchestrator(ws);
    });
    return;
  }

  // Check if path starts with /yjs/
  if (!url.pathname.startsWith('/yjs/')) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  // Extract document ID from URL path
  // y-websocket sends: /yjs/docId
  const pathParts = url.pathname.split('/').filter(Boolean);
  const docId = pathParts.length > 1 ? pathParts[1] : null;

  if (!docId) {
    console.error('[Server] No document ID in URL path:', req.url);
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\nDocument ID required\r\n');
    socket.destroy();
    return;
  }

  console.log('[Server] Client connecting to document:', docId);

  // Complete the WebSocket handshake
  wss.handleUpgrade(req, socket, head, (ws) => {
    setupWSConnection(ws, docId).catch((err) => {
      console.error('[Server] Error setting up WebSocket connection:', err);
      ws.close(1011, 'Internal error');
    });
  });
});

// Start WebSocket server
server.listen(PORT, () => {
  console.log(`[Server] HTTP server listening on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket server listening on ws://localhost:${PORT}/yjs`);
  console.log(`[Server] Storage path: ${STORAGE_PATH}`);
});

// Start WebRTC signaling server
createSignalingServer(Number(SIGNALING_PORT));

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

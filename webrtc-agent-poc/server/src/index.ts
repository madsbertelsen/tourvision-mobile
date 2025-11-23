/**
 * Express WebSocket Signaling Server
 *
 * Direct replacement for Cloudflare Durable Object signaling server
 * Maintains 100% protocol compatibility with y-webrtc client
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { SignalingServer } from './SignalingServer.js';
import type { ServerInfoResponse } from './types/signaling.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientDistPath = join(__dirname, '../../client/dist');

// Create Express app
const app = express();

// CORS middleware - allow all origins for development
// In production, configure ALLOWED_ORIGINS environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Create signaling server instance
const signaling = new SignalingServer();

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Match /signaling/:documentId pattern
    const match = pathname.match(/^\/signaling\/([^/]+)$/);

    if (match) {
      const documentId = decodeURIComponent(match[1]);

      console.log(`[Server] WebSocket upgrade request for document: ${documentId}`);

      wss.handleUpgrade(request, socket, head, (ws) => {
        signaling.handleConnection(ws, documentId);
      });
    } else {
      console.warn(`[Server] Invalid WebSocket path: ${pathname}`);
      socket.destroy();
    }
  } catch (error) {
    console.error('[Server] Error during WebSocket upgrade:', error);
    socket.destroy();
  }
});

// API Routes (must be defined before static file serving)

// Server info endpoint
app.get('/api', (req, res) => {
  const info: ServerInfoResponse = {
    status: 'ok',
    service: 'WebRTC Signaling Server',
    version: '1.0.0',
    protocol: 'y-webrtc',
    usage: 'WebSocket URL: ws://[host]:[port]/signaling/[documentId]'
  };
  res.json(info);
});

// Health check endpoint
app.get('/health', (req, res) => {
  const health = signaling.getHealthStats();
  res.json(health);
});

// Detailed health check with statistics
app.get('/health/detailed', (req, res) => {
  const health = signaling.getHealthStats();
  const detailed = {
    ...health,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
  res.json(detailed);
});

// Get active topics
app.get('/api/topics', (req, res) => {
  res.json({
    topics: signaling.getTopics(),
    count: signaling.getTopics().length
  });
});

// Get topic details with subscriber counts
app.get('/api/topics/details', (req, res) => {
  res.json({
    topics: signaling.getTopicCounts()
  });
});

// Get active connections count
app.get('/api/connections', (req, res) => {
  res.json({
    connections: signaling.getSessionCount()
  });
});

// Serve static files from client dist directory
// This serves the built Vite frontend application
if (existsSync(clientDistPath)) {
  console.log(`[Server] Serving static files from: ${clientDistPath}`);

  // Disable caching for all static files (prevent Cloudflare and browser caching)
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(clientDistPath));

  // Catch-all route for client-side routing
  // This ensures that routes like /?doc=xyz work properly
  app.get('*', (req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });
} else {
  console.warn(`[Server] Client dist directory not found: ${clientDistPath}`);
  console.warn(`[Server] Run 'npm run build' in the client directory to build the frontend`);

  // Fallback 404 when client is not built
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'Frontend not built. Run "npm run build" in the client directory.',
      path: req.path
    });
  });
}

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  WebRTC Signaling Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  HTTP:      http://${HOST}:${PORT}`);
  console.log(`  WebSocket: ws://${HOST}:${PORT}/signaling/:documentId`);
  console.log(`  Health:    http://${HOST}:${PORT}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  CORS:        ${allowedOrigins.join(', ')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

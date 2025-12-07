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
const clientDistPath = join(__dirname, '../../client/dist-public');

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

    // Match /debug-ws for debug dashboard
    if (pathname === '/debug-ws') {
      console.log(`[Server] Debug WebSocket connection established`);

      wss.handleUpgrade(request, socket, head, (ws) => {
        signaling.registerDebugClient(ws);
      });
      return;
    }

    // Match /signaling/:documentId pattern
    const match = pathname.match(/^\/signaling\/([^/]+)$/);

    if (match) {
      const documentId = decodeURIComponent(match[1]);
      const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                 || request.socket.remoteAddress
                 || 'unknown';
      const userAgent = request.headers['user-agent'] || 'unknown';

      console.log(`[Server] WebSocket upgrade request for document: ${documentId} from ${ip}`);

      wss.handleUpgrade(request, socket, head, (ws) => {
        signaling.handleConnection(ws, documentId, ip, userAgent);
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
app.get('/api', (_req, res) => {
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
app.get('/health', (_req, res) => {
  const health = signaling.getHealthStats();
  res.json(health);
});

// Detailed health check with statistics
app.get('/health/detailed', (_req, res) => {
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
app.get('/api/topics', (_req, res) => {
  res.json({
    topics: signaling.getTopics(),
    count: signaling.getTopics().length
  });
});

// Get topic details with subscriber counts
app.get('/api/topics/details', (_req, res) => {
  res.json({
    topics: signaling.getTopicCounts()
  });
});

// Get active connections count
app.get('/api/connections', (_req, res) => {
  res.json({
    connections: signaling.getSessionCount()
  });
});

// TURN credentials endpoint for WebRTC
app.get('/api/turn-credentials', async (_req, res) => {
  const TURN_KEY_ID = process.env.TURN_KEY_ID;
  const TURN_KEY_API_TOKEN = process.env.TURN_KEY_API_TOKEN;

  if (!TURN_KEY_ID || !TURN_KEY_API_TOKEN) {
    return res.status(503).json({
      error: 'TURN credentials not configured',
      message: 'Set TURN_KEY_ID and TURN_KEY_API_TOKEN environment variables'
    });
  }

  try {
    const turnApiUrl = `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate-ice-servers`;

    const turnResponse = await fetch(turnApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttl: 86400, // 24 hours
      }),
    });

    if (!turnResponse.ok) {
      const errorText = await turnResponse.text();
      console.error('[Server] Failed to generate TURN credentials:', errorText);
      return res.status(502).json({
        error: 'Failed to generate TURN credentials',
        details: errorText,
        status: turnResponse.status
      });
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

    return res.json(turnData);
  } catch (error) {
    console.error('[Server] Error fetching TURN credentials:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Geocoding proxy to local Nominatim service
app.get('/api/geocode', async (req, res) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Query parameter "q" is required'
    });
  }

  try {
    const url = `http://localhost:8080/search?q=${encodeURIComponent(q)}&format=json&limit=1`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Geocoding failed',
        message: `Local Nominatim returned ${response.status}`
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('[Server] Geocoding error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Reverse geocoding proxy to local Nominatim service
app.get('/api/reverse-geocode', async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon || typeof lat !== 'string' || typeof lon !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Query parameters "lat" and "lon" are required'
    });
  }

  try {
    const url = `http://localhost:8080/reverse?lat=${lat}&lon=${lon}&format=json`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Reverse geocoding failed',
        message: `Local Nominatim returned ${response.status}`
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('[Server] Reverse geocoding error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Debug API Routes

// Get detailed connection information
app.get('/api/debug/connections', (_req, res) => {
  res.json({
    connections: signaling.getConnectionDetails()
  });
});

// Get message log
app.get('/api/debug/messages', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  res.json({
    messages: signaling.getMessageLog(limit)
  });
});

// Inject test message
app.post('/api/debug/inject', (req, res) => {
  const { documentId, topic, data } = req.body;

  if (!documentId || !topic) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'documentId and topic are required'
    });
  }

  try {
    signaling.injectTestMessage(documentId, topic, data || { type: 'test', message: 'Test message from admin' });
    return res.json({
      success: true,
      message: `Test message injected to document ${documentId} on topic ${topic}`
    });
  } catch (error) {
    console.error('[Server] Error injecting test message:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to inject test message'
    });
  }
});

// Debug dashboard route (served separately from client app)
app.get('/debug', (_req, res) => {
  // Will serve debug.html from server/public directory
  const debugHtmlPath = join(__dirname, '../public/debug.html');
  if (existsSync(debugHtmlPath)) {
    res.sendFile(debugHtmlPath);
  } else {
    res.status(404).send(`
      <html>
        <head><title>Debug Dashboard Not Found</title></head>
        <body>
          <h1>Debug Dashboard Not Found</h1>
          <p>Create <code>server/public/debug.html</code> to enable the debug dashboard.</p>
          <p>Available debug API endpoints:</p>
          <ul>
            <li>GET /api/debug/connections - Connection details</li>
            <li>GET /api/debug/messages - Message log</li>
            <li>POST /api/debug/inject - Inject test message</li>
            <li>WebSocket: ws://localhost:${PORT}/debug-ws</li>
          </ul>
        </body>
      </html>
    `);
  }
});

// Serve static files from client dist directory
// This serves the built Vite frontend application
if (existsSync(clientDistPath)) {
  console.log(`[Server] Serving static files from: ${clientDistPath}`);

  // Disable caching for all static files (prevent Cloudflare and browser caching)
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

  // Serve static assets (JS, CSS, images, etc.)
  // index: false prevents auto-serving index.html for "/" - we handle that explicitly below
  app.use(express.static(clientDistPath, { index: false }));

  // Landing page at root
  app.get('/', (_req, res) => {
    const landingPath = join(clientDistPath, 'landing.html');
    if (existsSync(landingPath)) {
      res.sendFile(landingPath);
    } else {
      // Fallback to index.html if landing page not built
      res.sendFile(join(clientDistPath, 'index.html'));
    }
  });

  // Document routes - serve the editor app
  // Matches /doc/:documentId and /?doc=:documentId for backwards compatibility
  app.get('/doc/*', (_req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });

  // Legacy query param support for backwards compatibility
  app.get('*', (req, res, next) => {
    // If accessing with ?doc= query param, serve the app
    if (req.query.doc) {
      res.sendFile(join(clientDistPath, 'index.html'));
    } else {
      // Otherwise 404
      next();
    }
  });
} else {
  console.warn(`[Server] Client dist directory not found: ${clientDistPath}`);
  console.warn(`[Server] Run 'npm run build' in the client directory to build the frontend`);

  // Landing page placeholder
  app.get('/', (_req, res) => {
    res.status(503).send(`
      <html>
        <head><title>TourVision - Not Built</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>TourVision</h1>
          <p>Frontend not built. Run <code>npm run build</code> in the client directory.</p>
        </body>
      </html>
    `);
  });

  // Document route placeholder when client not built
  app.get('/doc/*', (req, res) => {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Frontend not built. Run "npm run build" in the client directory.',
      path: req.path
    });
  });
}

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found.',
    path: req.path,
    suggestion: 'Try accessing / for the landing page or /doc/:id for a document'
  });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

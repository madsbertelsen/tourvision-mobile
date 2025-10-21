import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { CollaborationManager } from './src/CollaborationManager.js';

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:8081",
      "http://localhost:8082",
      "http://localhost:3000",
      "http://localhost:3001"
    ],
    methods: ["GET", "POST"]
  }
});

// Enable CORS for regular HTTP requests
app.use(cors());
app.use(express.json());

// Collaboration manager instance
const collabManager = new CollaborationManager();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    documents: collabManager.getDocumentCount(),
    connections: io.engine.clientsCount
  });
});

// Get document state (for debugging)
app.get('/documents/:id', (req, res) => {
  const doc = collabManager.getDocument(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json({
    id: req.params.id,
    version: doc.version,
    stepCount: doc.steps.length,
    clientCount: doc.clients.size
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  let currentDocumentId = null;
  let clientInfo = {
    id: socket.id,
    name: null,
    color: null
  };

  // Join a document room
  socket.on('join-document', ({ documentId, clientName, initialDoc }) => {
    console.log(`Client ${socket.id} joining document: ${documentId}`);

    // Leave previous document if any
    if (currentDocumentId) {
      socket.leave(currentDocumentId);
      collabManager.removeClient(currentDocumentId, socket.id);
    }

    currentDocumentId = documentId;
    clientInfo.name = clientName || `User ${socket.id.slice(0, 6)}`;
    clientInfo.color = generateUserColor(socket.id);

    // Join the document room
    socket.join(documentId);

    // Initialize or get document
    const docState = collabManager.joinDocument(documentId, socket.id, initialDoc);

    // Send current document state to the joining client
    socket.emit('init', {
      version: docState.version,
      doc: docState.doc,
      steps: docState.steps,
      users: Array.from(docState.clients).map(id => ({
        id,
        ...getClientInfo(id)
      }))
    });

    // Notify other clients about the new user
    socket.to(documentId).emit('user-joined', {
      userId: socket.id,
      userName: clientInfo.name,
      userColor: clientInfo.color
    });
  });

  // Receive steps from a client
  socket.on('send-steps', ({ version, steps, clientID }) => {
    if (!currentDocumentId) {
      socket.emit('error', { message: 'Not connected to a document' });
      return;
    }

    console.log(`Received ${steps.length} steps from ${socket.id} for document ${currentDocumentId}`);

    const result = collabManager.receiveSteps(currentDocumentId, version, steps, clientID || socket.id);

    if (result.status === 'accepted') {
      // Broadcast steps to all other clients in the document
      socket.to(currentDocumentId).emit('steps', {
        steps: result.steps,
        clientID: clientID || socket.id,
        version: result.version
      });

      // Confirm to sender
      socket.emit('steps-accepted', {
        version: result.version
      });
    } else {
      // Steps need rebasing
      socket.emit('steps-rejected', {
        currentVersion: result.currentVersion,
        steps: result.stepsToRebase
      });
    }
  });

  // Handle cursor/selection updates
  socket.on('selection-changed', ({ from, to }) => {
    if (!currentDocumentId) return;

    // Broadcast selection to other clients
    socket.to(currentDocumentId).emit('selection', {
      userId: socket.id,
      userName: clientInfo.name,
      userColor: clientInfo.color,
      from,
      to
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    if (currentDocumentId) {
      collabManager.removeClient(currentDocumentId, socket.id);

      // Notify other clients
      socket.to(currentDocumentId).emit('user-left', {
        userId: socket.id
      });
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Helper function to generate consistent user colors
function generateUserColor(userId) {
  const colors = [
    '#3B82F6', // blue
    '#8B5CF6', // purple
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#84CC16', // lime
    '#F97316', // orange
    '#6366F1'  // indigo
  ];

  // Generate a consistent index based on userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }

  return colors[Math.abs(hash) % colors.length];
}

// Store client info
const clientInfoMap = new Map();

function getClientInfo(clientId) {
  return clientInfoMap.get(clientId) || { name: 'Unknown', color: '#666' };
}

// Start server
const PORT = process.env.PORT || 3003;
httpServer.listen(PORT, () => {
  console.log(`Collaboration server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
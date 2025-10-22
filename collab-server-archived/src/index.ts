import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { CollaborationManager } from './CollaborationManager.js';
import { AIUserService } from './AIUserService.js';
import { AIStepGenerator } from './AIStepGenerator.js';

// Load environment variables
dotenv.config();

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

// AI service instances
const stepGenerator = new AIStepGenerator(collabManager);
const aiService = new AIUserService(collabManager, stepGenerator, io);

// Client info interface
interface ClientInfo {
  id: string;
  name: string | null;
  color: string | null;
}

// Store client info
const clientInfoMap = new Map<string, ClientInfo>();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    documents: collabManager.getDocumentCount(),
    connections: io.engine.clientsCount,
    activeAIGenerations: aiService.getActiveGenerations().length,
    aiModel: process.env.DEFAULT_AI_MODEL || 'mistral-small-latest'
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
io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  let currentDocumentId: string | null = null;
  let clientInfo: ClientInfo = {
    id: socket.id,
    name: null,
    color: null
  };

  // Join a document room
  socket.on('join-document', ({ documentId, clientName, initialDoc }: {
    documentId: string;
    clientName?: string;
    initialDoc?: any;
  }) => {
    console.log(`Client ${socket.id} joining document: ${documentId}`);

    // Leave previous document if any
    if (currentDocumentId) {
      socket.leave(currentDocumentId);
      collabManager.removeClient(currentDocumentId, socket.id);
    }

    currentDocumentId = documentId;
    clientInfo.name = clientName || `User ${socket.id.slice(0, 6)}`;
    clientInfo.color = generateUserColor(socket.id);

    // Store client info
    clientInfoMap.set(socket.id, clientInfo);

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
  socket.on('send-steps', ({ version, steps, clientID }: {
    version: number;
    steps: any[];
    clientID?: string;
  }) => {
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
        stepsToRebase: result.stepsToRebase
      });
    }
  });

  // Handle cursor/selection updates
  socket.on('selection-changed', ({ from, to }: { from: number; to: number }) => {
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

    // Clean up client info
    clientInfoMap.delete(socket.id);
  });

  // Error handling
  socket.on('error', (error: Error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });

  // ====== AI GENERATION HANDLERS ======

  // Handle AI generation request
  socket.on('request-ai-generation', async ({ documentId, prompt, options = {} }: {
    documentId: string;
    prompt: string;
    options?: any;
  }) => {
    console.log(`AI generation requested for document ${documentId} by ${socket.id}`);

    if (!documentId || !currentDocumentId || documentId !== currentDocumentId) {
      socket.emit('ai-error', {
        message: 'Must be connected to the document to request AI generation'
      });
      return;
    }

    try {
      // Start the AI generation
      const generationId = await aiService.startGeneration(documentId, prompt, {
        ...options,
        requesterId: socket.id,
        requesterName: clientInfo.name || undefined
      });

      // Notify all clients that AI is generating
      io.to(documentId).emit('ai-generation-started', {
        generationId,
        requesterId: socket.id,
        requesterName: clientInfo.name || undefined,
        prompt: prompt.substring(0, 100) + '...' // Preview of prompt
      });

      // The AI service will handle sending steps through the collaboration manager
      // When steps are sent, they'll be broadcast via the normal 'steps' event

      // Set up completion tracking
      const checkCompletion = setInterval(() => {
        const status = aiService.getGenerationStatus(generationId);
        if (status.status === 'completed') {
          clearInterval(checkCompletion);
          io.to(documentId).emit('ai-generation-complete', { generationId });
        }
      }, 500);

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(checkCompletion);
        aiService.cancelGeneration(generationId);
      }, 60000);

    } catch (error: any) {
      console.error('AI generation error:', error);
      socket.emit('ai-error', {
        message: 'Failed to start AI generation',
        error: error.message
      });
    }
  });

  // Cancel AI generation
  socket.on('cancel-ai-generation', ({ generationId }: { generationId: string }) => {
    console.log(`Cancelling AI generation ${generationId}`);
    aiService.cancelGeneration(generationId);

    if (currentDocumentId) {
      io.to(currentDocumentId).emit('ai-generation-cancelled', { generationId });
    }
  });

  // Request AI reply for a comment
  socket.on('request-ai-comment-reply', async ({ documentId, commentId, from, to, instruction, options = {} }: {
    documentId: string;
    commentId: string;
    from: number;
    to: number;
    instruction: string;
    options?: any;
  }) => {
    console.log(`AI comment reply requested for document ${documentId}, comment ${commentId}`);

    if (!documentId || !currentDocumentId || documentId !== currentDocumentId) {
      socket.emit('ai-error', {
        message: 'Must be connected to the document to request AI comment reply'
      });
      return;
    }

    try {
      // Generate AI reply for the comment
      const generationId = await aiService.generateCommentReply(
        documentId,
        commentId,
        from,
        to,
        instruction,
        {
          requesterId: socket.id,
          requesterName: clientInfo.name || undefined,
          model: options.model || process.env.DEFAULT_AI_MODEL
        }
      );

      // Notify clients that AI is generating a reply
      io.to(documentId).emit('ai-comment-reply-started', {
        generationId,
        commentId,
        requesterId: socket.id,
        requesterName: clientInfo.name || undefined
      });

    } catch (error: any) {
      console.error('AI comment reply error:', error);
      socket.emit('ai-error', {
        message: 'Failed to generate AI comment reply',
        error: error.message
      });
    }
  });

  // Request inline AI edit (for @ai comments)
  socket.on('request-ai-inline-edit', async ({ documentId, from, to, selectedText, instruction, options = {} }: {
    documentId: string;
    from: number;
    to: number;
    selectedText: string;
    instruction: string;
    options?: any;
  }) => {
    console.log(`AI inline edit requested for document ${documentId}`);

    if (!documentId || !currentDocumentId || documentId !== currentDocumentId) {
      socket.emit('ai-error', {
        message: 'Must be connected to the document to request AI edit'
      });
      return;
    }

    try {
      // Build context-aware prompt
      const prompt = `The user selected this text: "${selectedText}"

User instruction: ${instruction}

Please provide a replacement for the selected text that addresses the user's request.`;

      // Start generation with replace range
      const generationId = await aiService.startGeneration(documentId, prompt, {
        replaceRange: { from, to },
        requesterId: socket.id,
        requesterName: clientInfo.name || undefined,
        model: options.model || process.env.DEFAULT_AI_MODEL
      });

      // Notify clients
      io.to(documentId).emit('ai-inline-edit-started', {
        generationId,
        from,
        to
      });

    } catch (error: any) {
      console.error('AI inline edit error:', error);
      socket.emit('ai-error', {
        message: 'Failed to start AI inline edit',
        error: error.message
      });
    }
  });
});

// Helper function to generate consistent user colors
function generateUserColor(userId: string): string {
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

// Get client info helper
function getClientInfo(clientId: string): { name: string | null; color: string | null } {
  const info = clientInfoMap.get(clientId);
  return info ? { name: info.name, color: info.color } : { name: null, color: null };
}

// Start server
const PORT = process.env.PORT || 3003;
httpServer.listen(PORT, () => {
  console.log(`Collaboration server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
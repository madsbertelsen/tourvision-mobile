import { io, Socket } from 'socket.io-client';

// Socket instance singleton
let socket: Socket | null = null;
let currentDocumentId: string | null = null;

// Event callbacks
const callbacks = new Map<string, Set<Function>>();

/**
 * Initialize or get the socket connection
 */
export function getSocket(): Socket {
  if (!socket) {
    // Connect to the collab server
    const serverUrl = process.env.EXPO_PUBLIC_COLLAB_SERVER_URL || 'http://localhost:3003';
    console.log('[CollabSocket] Connecting to:', serverUrl);

    socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Set up global event handlers
    socket.on('connect', () => {
      console.log('[CollabSocket] Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('[CollabSocket] Disconnected from server');
      currentDocumentId = null;
    });

    socket.on('error', (error) => {
      console.error('[CollabSocket] Socket error:', error);
    });

    // Forward events to registered callbacks
    setupEventForwarding();
  }

  return socket;
}

/**
 * Join a document collaboration session
 */
export function joinDocument(documentId: string, clientName: string, initialDoc?: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = getSocket();

    // Store current document ID
    currentDocumentId = documentId;

    // Listen for initialization response
    socket.once('init', (data) => {
      console.log('[CollabSocket] Document initialized:', {
        version: data.version,
        users: data.users?.length || 0,
      });
      resolve();
    });

    socket.once('error', (error) => {
      reject(error);
    });

    // Join the document
    socket.emit('join-document', {
      documentId,
      clientName,
      initialDoc,
    });
  });
}

/**
 * Request AI generation for the current document
 */
export function requestAIGeneration(
  documentId: string,
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    position?: number;
    replaceRange?: { from: number; to: number };
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = getSocket();

    if (documentId !== currentDocumentId) {
      reject(new Error('Must join document before requesting AI generation'));
      return;
    }

    // Listen for AI generation start
    socket.once('ai-generation-started', (data) => {
      console.log('[CollabSocket] AI generation started:', data.generationId);
      resolve(data.generationId);
    });

    socket.once('ai-error', (error) => {
      console.error('[CollabSocket] AI error:', error);
      reject(new Error(error.message));
    });

    // Request AI generation
    socket.emit('request-ai-generation', {
      documentId,
      prompt,
      options,
    });
  });
}

/**
 * Subscribe to an event
 */
export function subscribe(event: string, callback: Function): () => void {
  // Add to callbacks map
  if (!callbacks.has(event)) {
    callbacks.set(event, new Set());
  }
  callbacks.get(event)!.add(callback);

  // Return unsubscribe function
  return () => {
    const eventCallbacks = callbacks.get(event);
    if (eventCallbacks) {
      eventCallbacks.delete(callback);
      if (eventCallbacks.size === 0) {
        callbacks.delete(event);
      }
    }
  };
}

/**
 * Set up event forwarding to callbacks
 */
function setupEventForwarding() {
  if (!socket) return;

  // AI generation events
  socket.on('ai-generation-started', (data) => {
    triggerCallbacks('ai-generation-started', data);
  });

  socket.on('ai-generation-complete', (data) => {
    triggerCallbacks('ai-generation-complete', data);
  });

  socket.on('ai-generation-cancelled', (data) => {
    triggerCallbacks('ai-generation-cancelled', data);
  });

  // Step events (document changes)
  socket.on('steps', (data) => {
    triggerCallbacks('steps', data);
  });

  socket.on('steps-accepted', (data) => {
    triggerCallbacks('steps-accepted', data);
  });

  socket.on('steps-rejected', (data) => {
    triggerCallbacks('steps-rejected', data);
  });

  // User events
  socket.on('user-joined', (data) => {
    triggerCallbacks('user-joined', data);
  });

  socket.on('user-left', (data) => {
    triggerCallbacks('user-left', data);
  });

  // Selection events
  socket.on('selection', (data) => {
    triggerCallbacks('selection', data);
  });
}

/**
 * Trigger callbacks for an event
 */
function triggerCallbacks(event: string, data: any) {
  const eventCallbacks = callbacks.get(event);
  if (eventCallbacks) {
    eventCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[CollabSocket] Error in ${event} callback:`, error);
      }
    });
  }
}

/**
 * Send steps to the server
 */
export function sendSteps(version: number, steps: any[], clientID?: string): void {
  const socket = getSocket();
  socket.emit('send-steps', {
    version,
    steps,
    clientID,
  });
}

/**
 * Disconnect from the server
 */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentDocumentId = null;
    callbacks.clear();
  }
}

/**
 * Get the current document ID
 */
export function getCurrentDocumentId(): string | null {
  return currentDocumentId;
}
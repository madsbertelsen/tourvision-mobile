import { v4 as uuidv4 } from 'uuid';

export class CollaborationManager {
  constructor() {
    // Map of documentId -> DocumentState
    this.documents = new Map();

    // Periodic cleanup of inactive documents
    setInterval(() => this.cleanupInactiveDocuments(), 60000); // Every minute
  }

  /**
   * Join or create a document session
   */
  joinDocument(documentId, clientId, initialDoc = null) {
    let docState = this.documents.get(documentId);

    if (!docState) {
      // Create new document state
      docState = {
        id: documentId,
        doc: initialDoc || this.createEmptyDoc(),
        version: 0,
        steps: [],
        clients: new Set(),
        lastActivity: Date.now(),
        checkpoints: []
      };
      this.documents.set(documentId, docState);
      console.log(`Created new document: ${documentId}`);
    }

    // Add client to document
    docState.clients.add(clientId);
    docState.lastActivity = Date.now();

    return docState;
  }

  /**
   * Remove a client from a document
   */
  removeClient(documentId, clientId) {
    const docState = this.documents.get(documentId);
    if (docState) {
      docState.clients.delete(clientId);

      // If no clients left and document hasn't been modified, remove it
      if (docState.clients.size === 0 && docState.version === 0) {
        this.documents.delete(documentId);
        console.log(`Removed empty document: ${documentId}`);
      }
    }
  }

  /**
   * Process incoming steps from a client
   */
  receiveSteps(documentId, clientVersion, steps, clientID) {
    const docState = this.documents.get(documentId);

    if (!docState) {
      return {
        status: 'error',
        message: 'Document not found'
      };
    }

    // Update activity timestamp
    docState.lastActivity = Date.now();

    // Check if the client's version matches our current version
    if (clientVersion !== docState.version) {
      console.log(`Version mismatch: client ${clientVersion}, server ${docState.version}`);

      // Client needs to rebase their steps
      const stepsToRebase = docState.steps.slice(clientVersion);

      return {
        status: 'rejected',
        currentVersion: docState.version,
        stepsToRebase: stepsToRebase
      };
    }

    // Apply and store the steps
    try {
      // In a real implementation, we would:
      // 1. Deserialize steps using ProseMirror's Step.fromJSON
      // 2. Apply them to the document
      // 3. Update the document state

      // For now, we just store them
      docState.steps.push(...steps.map(step => ({
        ...step,
        clientID,
        timestamp: Date.now()
      })));

      docState.version += steps.length;

      // Create checkpoint every 100 steps
      if (docState.steps.length >= 100) {
        this.createCheckpoint(docState);
      }

      return {
        status: 'accepted',
        version: docState.version,
        steps: steps
      };
    } catch (error) {
      console.error('Error applying steps:', error);
      return {
        status: 'error',
        message: 'Failed to apply steps'
      };
    }
  }

  /**
   * Create a checkpoint for a document
   */
  createCheckpoint(docState) {
    console.log(`Creating checkpoint for document ${docState.id} at version ${docState.version}`);

    // In a real implementation, we would:
    // 1. Apply all steps to create a new document snapshot
    // 2. Store the snapshot
    // 3. Clear the steps array

    docState.checkpoints.push({
      version: docState.version,
      timestamp: Date.now(),
      doc: docState.doc // This should be the computed doc after applying steps
    });

    // Keep only last 10 checkpoints
    if (docState.checkpoints.length > 10) {
      docState.checkpoints.shift();
    }

    // Clear old steps (they're now in the checkpoint)
    const stepsToKeep = docState.steps.slice(-20); // Keep last 20 steps for late-joining clients
    docState.steps = stepsToKeep;
  }

  /**
   * Get document state
   */
  getDocument(documentId) {
    return this.documents.get(documentId);
  }

  /**
   * Get total document count
   */
  getDocumentCount() {
    return this.documents.size;
  }

  /**
   * Clean up inactive documents
   */
  cleanupInactiveDocuments() {
    const now = Date.now();
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [documentId, docState] of this.documents.entries()) {
      // Remove documents with no clients and no activity for 30 minutes
      if (docState.clients.size === 0 &&
          (now - docState.lastActivity) > inactivityThreshold) {
        this.documents.delete(documentId);
        console.log(`Cleaned up inactive document: ${documentId}`);
      }
    }
  }

  /**
   * Create an empty ProseMirror document
   */
  createEmptyDoc() {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: `p-${uuidv4()}` },
          content: []
        }
      ]
    };
  }
}
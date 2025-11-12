/**
 * Local Agent POC - Y.js Document Sync
 *
 * This agent connects to Cloudflare Workers (PartyKit/Durable Objects) and syncs a document using Y.js.
 * It logs whenever the document changes.
 *
 * Usage:
 *   node scripts/local-agent-yjs.js <documentId>
 *
 * Example:
 *   node scripts/local-agent-yjs.js test-doc-123
 */

import * as Y from 'yjs';
import YProvider from 'y-partyserver/provider';
import { Awareness } from 'y-protocols/awareness.js';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
global.WebSocket = WebSocket;

// Configuration
const COLLAB_HOST = process.env.COLLAB_HOST || 'tourvision-collab.mads-9b9.workers.dev';
const PARTY_NAME = 'yjs-room'; // Durable Object binding name (kebab-case of "YJS_ROOM")

// Get document ID from command line
const documentId = process.argv[2];

if (!documentId) {
  console.error('Usage: node scripts/local-agent-yjs.js <documentId>');
  process.exit(1);
}

console.log(`[Agent] Starting local agent for document: ${documentId}`);

/**
 * Main agent function
 */
async function startAgent() {
  try {
    // Create Y.js document
    const ydoc = new Y.Doc();

    // Get the ProseMirror XML fragment (standard Y.js structure for ProseMirror)
    const type = ydoc.getXmlFragment('prosemirror');

    // Create awareness for presence/cursor tracking
    const awareness = new Awareness(ydoc);

    // Set local awareness state (identify as local agent)
    awareness.setLocalStateField('user', {
      id: 'local-agent',
      name: 'Local Agent',
      color: '#FF6B6B' // Red color for agent
    });

    console.log('[Agent] Awareness initialized with clientID:', ydoc.clientID);

    // Listen to awareness changes (cursor positions, selections, presence)
    awareness.on('change', ({ added, updated, removed }) => {
      console.log('\n[Agent] 👁️  Awareness changed!');

      if (added.length > 0) {
        console.log(`[Agent] Users joined: ${added.length}`);
        added.forEach(clientId => {
          const state = awareness.getStates().get(clientId);
          console.log(`  - Client ${clientId}:`, state?.user);
        });
      }

      if (updated.length > 0) {
        console.log(`[Agent] Users updated: ${updated.length}`);
        updated.forEach(clientId => {
          const state = awareness.getStates().get(clientId);
          if (state?.user) {
            console.log(`  - Client ${clientId}: ${state.user.name}`);
          }
          // Check for cursor/selection data
          if (state?.cursor) {
            console.log(`    Cursor: anchor=${state.cursor.anchor}, head=${state.cursor.head}`);
          }
        });
      }

      if (removed.length > 0) {
        console.log(`[Agent] Users left: ${removed.length}`);
        removed.forEach(clientId => {
          console.log(`  - Client ${clientId} disconnected`);
        });
      }

      // Log current active users
      const activeUsers = Array.from(awareness.getStates().entries())
        .filter(([id]) => id !== ydoc.clientID)
        .map(([id, state]) => ({ id, name: state?.user?.name }));

      if (activeUsers.length > 0) {
        console.log(`[Agent] Active users (${activeUsers.length}):`, activeUsers);
      }
    });

    // Set up observer for document changes
    let isInitialSync = true;
    type.observeDeep((events) => {
      if (isInitialSync) {
        console.log('[Agent] Initial sync completed, document state loaded');
        isInitialSync = false;
        return;
      }

      console.log('\n[Agent] 📝 Document changed!');
      console.log(`[Agent] Number of changes: ${events.length}`);

      events.forEach((event, index) => {
        console.log(`\n[Agent] Change ${index + 1}:`);
        console.log(`  Type: ${event.constructor.name}`);
        console.log(`  Path: ${event.path.join(' > ')}`);

        if (event.changes) {
          const { added, deleted } = event.changes.delta.reduce(
            (acc, change) => {
              if (change.insert) acc.added += change.insert.length || 1;
              if (change.delete) acc.deleted += change.delete;
              return acc;
            },
            { added: 0, deleted: 0 }
          );

          if (added > 0) console.log(`  Added: ${added} items`);
          if (deleted > 0) console.log(`  Deleted: ${deleted} items`);
        }
      });

      // Log current document structure (simplified)
      try {
        const docJSON = type.toJSON();
        console.log('\n[Agent] Current document structure:');
        console.log(JSON.stringify(docJSON, null, 2).substring(0, 500) + '...');
      } catch (error) {
        console.log('[Agent] Could not serialize document');
      }
    });

    // Create Y.js provider for Cloudflare Workers (PartyKit/Durable Objects)
    console.log(`[Agent] Connecting to Cloudflare Worker: wss://${COLLAB_HOST}`);
    console.log(`[Agent] Party: ${PARTY_NAME}, Room: ${documentId}`);

    const provider = new YProvider(
      COLLAB_HOST,
      documentId,
      ydoc,
      {
        party: PARTY_NAME,
        awareness: awareness,  // Pass awareness for presence/cursor tracking
        connect: true,
      }
    );

    // Listen to connection events
    provider.on('status', ({ status }) => {
      console.log(`[Agent] 📡 WebSocket status: ${status}`);
      if (status === 'connected') {
        console.log('[Agent] ✅ WebSocket connected successfully');
      } else if (status === 'disconnected') {
        console.log('[Agent] ❌ WebSocket disconnected');
      }
    });

    provider.on('sync', (synced) => {
      if (synced) {
        console.log('[Agent] ✅ Document synced with server');
      } else {
        console.log('[Agent] 🔄 Syncing with server...');
      }
    });

    console.log('\n[Agent] 👂 Listening for document changes...');
    console.log('[Agent] Press Ctrl+C to stop\n');

    // Helper function to calculate ProseMirror position from Y.js XML structure
    function calculateProseMirrorLength(xmlFragment) {
      // Convert Y.js XML to string and parse it to get actual content length
      const xmlString = xmlFragment.toString();

      // Count nodes and text content
      // Each XML element adds 2 (open/close), text content adds its length
      let length = 0;

      // Simple parser: count < and > pairs as nodes (2 each), everything else as text
      let inTag = false;
      let tagCount = 0;
      let textLength = 0;

      for (const char of xmlString) {
        if (char === '<') {
          inTag = true;
          tagCount++;
        } else if (char === '>') {
          inTag = false;
        } else if (!inTag) {
          textLength++;
        }
      }

      // Each opening tag adds 1 for opening position, text adds its length, closing tag adds 1
      // So total = tagCount + textLength
      length = tagCount + textLength;

      return length;
    }

    // Test: Move cursor to random position every 10 seconds
    let testInterval = setInterval(() => {
      try {
        // Calculate actual ProseMirror document length
        const pmLength = calculateProseMirrorLength(type);

        console.log(`\n[Agent] 🔍 Document analysis: Y.js nodes=${type.length}, PM length=${pmLength}`);

        if (pmLength <= 2) {
          console.log('[Agent] 🎯 Document is too short (PM length <= 2), skipping cursor update');
          return;
        }

        // Generate random position within valid ProseMirror range
        // Position must be between 1 and pmLength - 1 (inside the document, not at boundaries)
        const randomPos = Math.floor(Math.random() * (pmLength - 2)) + 1;

        // Update awareness with cursor position
        // ProseMirror cursor format: { anchor, head }
        // anchor = start of selection, head = end of selection
        // For a cursor (no selection), anchor === head
        awareness.setLocalStateField('cursor', {
          anchor: randomPos,
          head: randomPos
        });

        console.log(`\n[Agent] 🎯 Moving cursor to position ${randomPos} (PM length: ${pmLength}, Y.js nodes: ${type.length})`);
      } catch (error) {
        console.error('[Agent] Error updating cursor:', error);
      }
    }, 10000); // Every 10 seconds

    // Keep the process running
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[Agent] Shutting down...');
      clearInterval(testInterval);
      provider.destroy();
      process.exit(0);
    });

  } catch (error) {
    console.error('[Agent] Fatal error:', error);
    process.exit(1);
  }
}

// Start the agent
startAgent();

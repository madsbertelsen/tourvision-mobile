import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const WS_URL = 'ws://localhost:8787';
const PARTY_NAME = 'document';
const DOCUMENT_NAME = 'y-partyserver-text-editor-example';

console.log('[Agent] Starting AI Agent...');
console.log('[Agent] Connecting to:', `${WS_URL}/parties/${PARTY_NAME}/${DOCUMENT_NAME}`);

// Create Y.Doc
const ydoc = new Y.Doc();
const yXmlFragment = ydoc.getXmlFragment('prosemirror');

// Create WebSocket provider
const provider = new WebsocketProvider(
  `${WS_URL}/parties/${PARTY_NAME}`,
  DOCUMENT_NAME,
  ydoc,
  {
    WebSocketPolyfill: WebSocket,
    connect: true
  }
);

// Set agent awareness with user info
provider.awareness.setLocalStateField('user', {
  name: 'AI Agent',
  color: '#FF6B6B'
});

console.log('[Agent] Initialized with Y.js and awareness');

// Listen for sync events
provider.on('sync', (isSynced) => {
  console.log('[Agent] Synced:', isSynced);

  if (isSynced) {
    // Start moving cursor periodically after sync
    setInterval(() => {
      moveAgentCursor();
    }, 3000);
  }
});

provider.on('status', ({ status }) => {
  console.log('[Agent] Status:', status);
});

function moveAgentCursor() {
  try {
    // Find the first paragraph (or create one if empty)
    const firstChild = yXmlFragment.get(0);

    if (!firstChild) {
      console.log('[Agent] Document is empty, no cursor to set');
      return;
    }

    // Get the text content from the first child
    let textNode = null;
    let textLength = 0;

    if (firstChild instanceof Y.XmlText) {
      textNode = firstChild;
      textLength = firstChild.length;
    } else if (firstChild instanceof Y.XmlElement) {
      // Look for text inside the element (e.g., inside a paragraph)
      firstChild.forEach((child) => {
        if (child instanceof Y.XmlText) {
          textNode = child;
          textLength = child.length;
        }
      });
    }

    if (!textNode || textLength === 0) {
      console.log('[Agent] No text content found');
      return;
    }

    // Pick a random position within the text
    const randomPosition = Math.floor(Math.random() * textLength);

    // Create relative positions for y-prosemirror using the text node
    const anchor = Y.createRelativePositionFromTypeIndex(textNode, randomPosition);
    const head = Y.createRelativePositionFromTypeIndex(textNode, randomPosition);

    provider.awareness.setLocalStateField('cursor', {
      anchor: anchor,
      head: head
    });

    console.log(`[Agent] Moved cursor to position ${randomPosition} (text length: ${textLength})`);
  } catch (error) {
    console.error('[Agent] Error moving cursor:', error);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n[Agent] Shutting down...');
  provider.destroy();
  ydoc.destroy();
  process.exit(0);
});

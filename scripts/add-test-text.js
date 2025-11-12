/**
 * Script to add test text to a Y.js document
 */

import * as Y from 'yjs';
import YProvider from 'y-partyserver/provider';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
global.WebSocket = WebSocket;

const COLLAB_HOST = 'tourvision-collab.mads-9b9.workers.dev';
const PARTY_NAME = 'yjs-room';
const documentId = process.argv[2];

if (!documentId) {
  console.error('Usage: node scripts/add-test-text.js <documentId>');
  process.exit(1);
}

console.log(`[Test] Adding text to document: ${documentId}`);

async function addText() {
  const ydoc = new Y.Doc();
  const type = ydoc.getXmlFragment('prosemirror');

  const provider = new YProvider(COLLAB_HOST, documentId, ydoc, {
    party: PARTY_NAME,
    connect: true,
  });

  // Wait for connection
  await new Promise((resolve) => {
    provider.on('status', ({ status }) => {
      if (status === 'connected') {
        console.log('[Test] Connected');
        resolve();
      }
    });
  });

  // Wait for sync
  await new Promise((resolve) => {
    provider.on('sync', (synced) => {
      if (synced) {
        console.log('[Test] Synced');
        resolve();
      }
    });
  });

  // Add a paragraph with text
  const paragraph = new Y.XmlElement('paragraph');
  const textNode = new Y.XmlText();
  textNode.insert(0, 'The quick brown fox jumps over the lazy dog. This is a longer sentence to test cursor positioning throughout the document.');
  paragraph.insert(0, [textNode]);
  type.insert(0, [paragraph]);

  console.log('[Test] Added text to document');

  // Wait a moment for sync
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('[Test] Done');
  provider.destroy();
  process.exit(0);
}

addText().catch(error => {
  console.error('[Test] Error:', error);
  process.exit(1);
});

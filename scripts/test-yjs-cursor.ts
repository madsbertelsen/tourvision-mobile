/**
 * Standalone TypeScript Test for Y.js Cursor Positioning
 *
 * This script creates a Y.js document, adds content, and tests cursor positioning
 * without needing any web page or frontend.
 *
 * Run with: npx tsx scripts/test-yjs-cursor.ts
 */

import * as Y from 'yjs';
import YProvider from 'y-partyserver/provider';
import { Awareness } from 'y-protocols/awareness.js';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
global.WebSocket = WebSocket as any;

// Configuration
const COLLAB_HOST = process.env.COLLAB_HOST || 'tourvision-collab.mads-9b9.workers.dev';
const PARTY_NAME = 'yjs-room';
const TEST_DOC_ID = 'test-cursor-' + Date.now();

console.log('[Test] Starting Y.js cursor positioning test');
console.log('[Test] Document ID:', TEST_DOC_ID);

async function testCursorPositioning() {
  // Create Y.js document
  const ydoc = new Y.Doc();
  const type = ydoc.getXmlFragment('prosemirror');

  // Create awareness
  const awareness = new Awareness(ydoc);
  awareness.setLocalStateField('user', {
    id: 'test-script',
    name: 'Test Script',
    color: '#00FF00'
  });

  // Connect to server
  console.log('\n[Test] Connecting to server...');
  const provider = new YProvider(
    COLLAB_HOST,
    TEST_DOC_ID,
    ydoc,
    {
      party: PARTY_NAME,
      awareness: awareness,
      connect: true,
    }
  );

  // Wait for connection
  await new Promise<void>((resolve) => {
    provider.on('status', ({ status }) => {
      if (status === 'connected') {
        console.log('[Test] ✅ Connected to server');
        resolve();
      }
    });
  });

  // Wait for initial sync
  await new Promise<void>((resolve) => {
    provider.on('sync', (synced) => {
      if (synced) {
        console.log('[Test] ✅ Initial sync complete');
        resolve();
      }
    });
  });

  // === TEST 1: Create Basic Document ===
  console.log('\n=== TEST 1: Create Basic Document ===');

  // Create a paragraph with text
  const paragraph = new Y.XmlElement('paragraph');
  const textNode = new Y.XmlText();
  textNode.insert(0, 'Hello World! This is a test document with some text.');
  paragraph.insert(0, [textNode]);
  type.insert(0, [paragraph]);

  console.log('[Test] Created document with text');

  // Wait a moment for sync
  await new Promise(resolve => setTimeout(resolve, 1000));

  // === TEST 2: Inspect Document Structure ===
  console.log('\n=== TEST 2: Inspect Document Structure ===');
  console.log('[Test] type.constructor.name:', type.constructor.name);
  console.log('[Test] type.length:', type.length);
  console.log('[Test] type.toString():', type.toString().substring(0, 200));

  // Iterate through children
  console.log('\n[Test] Children:');
  for (let i = 0; i < type.length; i++) {
    const child = type.get(i);
    console.log(`  [${i}] type:`, child?.constructor.name);
    if (child) {
      console.log(`  [${i}] length:`, (child as any)._length);
      console.log(`  [${i}] toString():`, child.toString().substring(0, 100));
    }
  }

  // === TEST 3: Test Text Node Collection ===
  console.log('\n=== TEST 3: Test Text Node Collection ===');

  let allTextNodes: Array<{
    node: Y.XmlText;
    path: number[];
    startOffset: number;
    length: number;
  }> = [];
  let cumulativeLength = 0;

  function collectTextNodes(xmlElement: any, path: number[] = []) {
    if (!xmlElement) {
      console.log(`[Test] Skipping null element at path ${path.join('>')}`);
      return;
    }

    const pathStr = path.length > 0 ? path.join('>') : 'root';
    console.log(`[Test] Inspecting at path ${pathStr}: ${xmlElement.constructor.name}`);

    // If this is an XmlText node, collect it
    if (xmlElement.constructor.name === 'YXmlText') {
      const textLength = xmlElement.length;
      console.log(`[Test]   -> Found XmlText with length ${textLength}: "${xmlElement.toString()}"`);
      if (textLength > 0) {
        allTextNodes.push({
          node: xmlElement,
          path: [...path],
          startOffset: cumulativeLength,
          length: textLength
        });
        cumulativeLength += textLength;
      }
      return;
    }

    // If this is an XmlElement or XmlFragment, recurse into children
    if (xmlElement.constructor.name === 'YXmlElement' || xmlElement.constructor.name === 'YXmlFragment') {
      // Try different methods to get children
      let children: any[] = [];

      // Method 1: Try toArray()
      if (typeof xmlElement.toArray === 'function') {
        children = xmlElement.toArray();
        console.log(`[Test]   -> toArray() returned ${children.length} children`);
      }

      // Method 2: Try iterator
      if (children.length === 0 && typeof xmlElement[Symbol.iterator] === 'function') {
        children = Array.from(xmlElement);
        console.log(`[Test]   -> Iterator returned ${children.length} children`);
      }

      // Method 3: Try manual iteration with _first and right
      if (children.length === 0 && xmlElement._first) {
        let item = xmlElement._first;
        let idx = 0;
        while (item) {
          if (item.content) {
            children.push(item.content.type);
            idx++;
          }
          item = item.right;
        }
        console.log(`[Test]   -> Manual iteration found ${children.length} children`);
      }

      children.forEach((child: any, i: number) => {
        collectTextNodes(child, [...path, i]);
      });
    }
  }

  collectTextNodes(type);

  console.log(`\n[Test] ✅ Found ${allTextNodes.length} text nodes`);
  console.log(`[Test] ✅ Total text length: ${cumulativeLength} characters`);

  allTextNodes.forEach((node, idx) => {
    console.log(`[Test] Text node ${idx}:`);
    console.log(`  Path: ${node.path.join(' > ')}`);
    console.log(`  Start: ${node.startOffset}, Length: ${node.length}`);
    console.log(`  Content: "${node.node.toString().substring(0, 50)}..."`);
  });

  // === TEST 4: Test Cursor Position Creation ===
  console.log('\n=== TEST 4: Test Cursor Position Creation ===');

  if (allTextNodes.length > 0 && cumulativeLength > 0) {
    // Test positions: start, middle, end
    const testPositions = [0, Math.floor(cumulativeLength / 2), cumulativeLength - 1];

    for (const testPos of testPositions) {
      console.log(`\n[Test] Testing position ${testPos} / ${cumulativeLength}:`);

      // Find which text node contains this offset
      let targetTextNode = null;
      let localOffset = 0;

      for (const textNode of allTextNodes) {
        if (testPos >= textNode.startOffset && testPos < textNode.startOffset + textNode.length) {
          targetTextNode = textNode;
          localOffset = testPos - textNode.startOffset;
          break;
        }
      }

      if (!targetTextNode) {
        targetTextNode = allTextNodes[allTextNodes.length - 1];
        localOffset = targetTextNode.length;
      }

      console.log(`  -> Text node path: ${targetTextNode.path.join(' > ')}`);
      console.log(`  -> Local offset: ${localOffset}`);

      // Create relative position
      const relativePos = Y.createRelativePositionFromTypeIndex(targetTextNode.node, localOffset);
      console.log(`  -> RelativePosition:`, JSON.stringify(relativePos, null, 2));

      // Try to resolve it back
      const absolutePos = Y.createAbsolutePositionFromRelativePosition(relativePos, ydoc);
      console.log(`  -> Resolved absolute position:`, absolutePos);
    }
  } else {
    console.log('[Test] ❌ No text nodes found - cannot test cursor positions');
  }

  // === TEST 5: Add Multiple Paragraphs ===
  console.log('\n=== TEST 5: Add Multiple Paragraphs ===');

  const paragraph2 = new Y.XmlElement('paragraph');
  const textNode2 = new Y.XmlText();
  textNode2.insert(0, 'Second paragraph with more content.');
  paragraph2.insert(0, [textNode2]);
  type.insert(1, [paragraph2]);

  console.log('[Test] Added second paragraph');
  await new Promise(resolve => setTimeout(resolve, 500));

  // Re-collect text nodes
  allTextNodes = [];
  cumulativeLength = 0;
  collectTextNodes(type);

  console.log(`\n[Test] ✅ After adding paragraph: Found ${allTextNodes.length} text nodes`);
  console.log(`[Test] ✅ Total text length: ${cumulativeLength} characters`);

  // Cleanup
  console.log('\n[Test] Cleaning up...');
  provider.destroy();

  console.log('\n[Test] ✅ Test complete!');
  process.exit(0);
}

// Run test
testCursorPositioning().catch((error) => {
  console.error('[Test] ❌ Error:', error);
  process.exit(1);
});

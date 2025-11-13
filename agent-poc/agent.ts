import WebSocket from 'ws';
import * as Y from 'yjs';
import YProvider from './src/y-partyserver/provider.js';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import { customSchema } from './src/prosemirror-schema.js';
import { JSDOM } from 'jsdom';
import { generateObject } from 'ai';
import { Node as ProseMirrorNode, DOMSerializer } from 'prosemirror-model';
import { z } from 'zod';
import dotenv from 'dotenv';

// Type definitions
interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

interface GeocodePendingTask {
  resolve: (value: GeocodeResult) => void;
  reject: (reason?: Error) => void;
}

interface CustomMessageData {
  type: string;
  taskId?: string;
  result?: GeocodeResult;
  [key: string]: unknown;
}

interface TextNodeInfo {
  node: Y.XmlText;
  text: string;
  startOffset: number;
  endOffset: number;
}

interface GeoMarkToolResult {
  success: boolean;
  geoId: string;
  placeName: string;
}

// Load environment variables
dotenv.config();

// Set up jsdom for headless DOM
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).navigator = dom.window.navigator;

// Polyfill WebSocket for Node.js
(global as any).WebSocket = WebSocket;

// Default port 8787 matches Wrangler dev server default
const WS_PORT = process.env.WS_PORT || '8787';
const PARTY_NAME = 'document';
const DOCUMENT_NAME = 'y-partyserver-text-editor-example';

console.log('[Agent] Starting AI Agent...');
console.log('[Agent] Connecting to:', `localhost:${WS_PORT}/parties/${PARTY_NAME}/${DOCUMENT_NAME}`);

// Create Y.Doc
const ydoc = new Y.Doc();
const yXmlFragment = ydoc.getXmlFragment('prosemirror');

// Track geo-marks for color assignment
let geoMarkColorIndex: number = 0;

// Create YProvider (custom provider with message support)
const provider = new YProvider(
  `localhost:${WS_PORT}`,
  DOCUMENT_NAME,
  ydoc,
  {
    party: PARTY_NAME,
    WebSocketPolyfill: WebSocket as any,
    connect: true
  }
);

// Set agent awareness with user info
provider.awareness.setLocalStateField('user', {
  name: 'AI Agent',
  color: '#FF6B6B'
});

// Create headless ProseMirror EditorView with Y.js sync (agent is a real collaborative client!)
const editorElement = document.getElementById('editor');
const editorView = new EditorView(editorElement, {
  state: EditorState.create({
    schema: customSchema,
    plugins: [
      ySyncPlugin(yXmlFragment)
    ]
  })
});

console.log('[Agent] Initialized with Y.js, awareness, and headless ProseMirror EditorView');

// Listen for sync events
provider.on('sync', (isSynced: boolean) => {
  console.log('[Agent] Synced:', isSynced);

  if (isSynced) {
    console.log('[Agent] 💡 Period-triggered LLM processing enabled');
    console.log('[Agent] Type a "." to trigger LLM analysis with tool calling');
  }
});

provider.on('status', ({ status }: { status: string }) => {
  console.log('[Agent] Status:', status);
});

// Track pending geocode tasks waiting for client response
const pendingGeocodeTasks = new Map<string, GeocodePendingTask>(); // taskId -> { resolve, reject }

// Listen for custom messages from clients (geocode results)
provider.on('custom-message', (message: string) => {
  try {
    const data: CustomMessageData = JSON.parse(message);
    console.log('[Agent] Received custom message:', data.type);

    if (data.type === 'geocode_result') {
      const pending = pendingGeocodeTasks.get(data.taskId!);
      if (pending && data.result) {
        console.log(`[Agent] ✅ Received geocode result for task ${data.taskId}`);
        pending.resolve(data.result as GeocodeResult);
        pendingGeocodeTasks.delete(data.taskId!);
      } else {
        console.log(`[Agent] ⚠️  Received result for unknown task: ${data.taskId}`);
      }
    }
  } catch (error) {
    console.error('[Agent] Error handling custom message:', error);
  }
});

// Set up observer for document changes
let isInitialSync: boolean = true;
let cursorMoveDebounceTimer: NodeJS.Timeout | null = null;

yXmlFragment.observeDeep((events: Y.YEvent<any>[]) => {
  if (isInitialSync) {
    console.log('[Agent] Initial sync completed, document state loaded');
    isInitialSync = false;
    return;
  }

  console.log('[Agent] Document changed');

  let periodDetected: boolean = false;

  // Check if any of the changes contain a period
  events.forEach((event) => {
    if (event.changes && event.changes.delta) {
      event.changes.delta.forEach((change) => {
        if (change.insert && typeof change.insert === 'string' && change.insert.includes('.')) {
          periodDetected = true;
        }
      });
    }
  });

  // Trigger LLM processing if a period was detected
  if (periodDetected) {
    console.log('[Agent] 🔴 Period detected! Triggering LLM processing...');

    // Debounce: wait 1 second after the last period before processing
    if (cursorMoveDebounceTimer) {
      clearTimeout(cursorMoveDebounceTimer);
    }

    cursorMoveDebounceTimer = setTimeout(() => {
      processDocumentWithLLM();
    }, 1000); // 1 second debounce
  }
});

/**
 * Extract all text nodes from the Y.js document with position tracking
 */
function getAllTextNodes(xmlFragment: Y.XmlFragment): TextNodeInfo[] {
  const textNodes: TextNodeInfo[] = [];
  let currentOffset: number = 0;

  function traverse(element: any): void {
    if (!element) return;

    if (element instanceof Y.XmlText) {
      const text = element.toString();
      textNodes.push({
        node: element,
        text: text,
        startOffset: currentOffset,
        endOffset: currentOffset + text.length
      });
      currentOffset += text.length;
    } else if (element instanceof Y.XmlElement || element instanceof Y.XmlFragment) {
      // Iterate through children
      let i = 0;
      let child = (element as any)._first;
      while (child) {
        if (child.content) {
          traverse((child.content as any).type);
        }
        child = child.right;
        i++;
      }
    }
  }

  traverse(xmlFragment);
  return textNodes;
}

/**
 * Geocode a location by delegating to browser client
 */
async function geocodeLocation(locationName: string): Promise<GeocodeResult> {
  console.log(`[Agent] 🔧 Geocoding "${locationName}"`);

  // Delegate to client
  const states = provider.awareness.getStates();
  const myClientId: number = ydoc.clientID;

  let targetClientId: number | null = null;
  for (const [clientId] of states) {
    if (clientId === myClientId) continue;
    targetClientId = clientId;
    break;
  }

  if (!targetClientId) {
    throw new Error('No client available for geocoding');
  }

  const taskId: string = `geocode-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  provider.sendMessage(JSON.stringify({
    type: 'geocode_task',
    taskId,
    locationName,
    targetClientId
  }));

  return new Promise<GeocodeResult>((resolve, reject) => {
    pendingGeocodeTasks.set(taskId, { resolve, reject });

    const timeoutId: NodeJS.Timeout = setTimeout(() => {
      if (pendingGeocodeTasks.has(taskId)) {
        pendingGeocodeTasks.delete(taskId);
        reject(new Error(`Geocoding timeout: ${locationName}`));
      }
    }, 10000);

    const orig = pendingGeocodeTasks.get(taskId)!.resolve;
    pendingGeocodeTasks.get(taskId)!.resolve = (result: GeocodeResult) => {
      clearTimeout(timeoutId);
      orig(result);
    };
  });
}

/**
 * Create a geo-mark in the document
 */
function createGeoMark(locationText: string, geocodeResult: GeocodeResult): void {
  console.log(`[Agent] 🔧 Creating geo-mark for "${locationText}"`);

  const doc = editorView.state.doc;

  // Find text position in document
  let startPos: number | null = null;
  let endPos: number | null = null;

  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (node.isText && node.text) {
      const index = node.text.toLowerCase().indexOf(locationText.toLowerCase());
      if (index !== -1) {
        startPos = pos + index;
        endPos = startPos + locationText.length;
        return false;
      }
    }
  });

  if (startPos === null || endPos === null) {
    console.error(`[Agent] ❌ Could not find "${locationText}" in document`);
    return;
  }

  // Create geo-mark
  const geoId: string = `geo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const colorIndex: number = geoMarkColorIndex++;

  const markType = customSchema.marks.geoMark;
  const mark = markType.create({
    geoId,
    placeName: geocodeResult.displayName,
    lat: geocodeResult.lat.toString(),
    lng: geocodeResult.lng.toString(),
    colorIndex,
    coordSource: 'nominatim'
  });

  const tr = editorView.state.tr.addMark(startPos, endPos, mark);
  editorView.dispatch(tr);

  console.log(`[Agent] ✅ Created geo-mark at ${startPos}-${endPos}`);
}

/**
 * Real LLM function using Vercel AI SDK with AI Gateway
 * Uses generateObject to get structured location data
 */
async function callRealLLM(): Promise<any> {
  console.log('[Agent] 🤖 Calling LLM via AI Gateway...');

  // Get document and serialize to HTML
  const doc = editorView.state.doc;
  const serializer = DOMSerializer.fromSchema(customSchema);
  const fragment = serializer.serializeFragment(doc.content);

  // Create a temporary div to get HTML string
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  const htmlContent = tempDiv.innerHTML;

  console.log(`[Agent] Document HTML: "${htmlContent}"`);

  // Call LLM to extract locations as structured data
  const result = await generateObject({
    model: 'openai/gpt-4o-mini',
    schema: z.object({
      locations: z.array(z.object({
        name: z.string().describe('The exact text from the document (e.g., "Copenhagen")'),
        fullName: z.string().describe('Full location name for geocoding (e.g., "Copenhagen, Denmark")')
      }))
    }),
    prompt: `Find all geographic locations (cities, countries, landmarks) in this HTML content:\n\n${htmlContent}\n\nIMPORTANT: Only extract locations that are NOT already inside <span> tags with data-geo-id attributes. Those are already marked.\n\nFor each NEW unmarked location, provide:\n1. The exact text as it appears in the document\n2. A full name suitable for geocoding`
  });

  console.log(`[Agent] 📍 Found ${result.object.locations.length} locations`);

  // Get list of already marked locations to avoid duplicates
  const alreadyMarked = new Set<string>();
  doc.descendants((node: ProseMirrorNode) => {
    if (node.isText && node.marks.length > 0) {
      for (const mark of node.marks) {
        if (mark.type.name === 'geoMark') {
          alreadyMarked.add(node.text!.toLowerCase());
        }
      }
    }
  });

  console.log(`[Agent] 🔍 Already marked locations:`, Array.from(alreadyMarked));

  // Process each location: geocode then create geo-mark
  for (const location of result.object.locations) {
    // Skip if already marked
    if (alreadyMarked.has(location.name.toLowerCase())) {
      console.log(`[Agent] ⏭️  Skipping "${location.name}" (already marked)`);
      continue;
    }

    try {
      console.log(`[Agent] Processing: "${location.name}"`);

      // Geocode the location
      const geocodeResult = await geocodeLocation(location.fullName);
      console.log(`[Agent] ✅ Geocoded: ${geocodeResult.displayName}`);

      // Create geo-mark in document
      createGeoMark(location.name, geocodeResult);

    } catch (error) {
      console.error(`[Agent] ❌ Failed to process "${location.name}":`, error);
    }
  }

  console.log('[Agent] ✅ All locations processed');

  return result;
}

/**
 * Process document with LLM and execute tool calls via AI SDK
 */
async function processDocumentWithLLM(): Promise<void> {
  try {
    console.log('[Agent] 🔎 Analyzing document with LLM...');

    // Check if document has content
    const doc = editorView.state.doc;
    if (doc.content.size === 0) {
      console.log('[Agent] ❌ Document is empty');
      return;
    }

    // Call real LLM - AI SDK handles tool execution automatically
    await callRealLLM();

    console.log('[Agent] ✅ All tool calls executed successfully');
  } catch (error) {
    console.error('[Agent] ❌ Error processing with LLM:', error);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n[Agent] Shutting down...');
  if (cursorMoveDebounceTimer) {
    clearTimeout(cursorMoveDebounceTimer);
  }
  editorView.destroy();
  provider.destroy();
  ydoc.destroy();
  process.exit(0);
});

import WebSocket from 'ws';
import * as Y from 'yjs';
import YProvider from './src/y-partyserver/provider.js';

// Polyfill WebSocket for Node.js
global.WebSocket = WebSocket;

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
let geoMarkColorIndex = 0;

// Create YProvider (custom provider with message support)
const provider = new YProvider(
  `localhost:${WS_PORT}`,
  DOCUMENT_NAME,
  ydoc,
  {
    party: PARTY_NAME,
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
    console.log('[Agent] 💡 Period-triggered LLM processing enabled');
    console.log('[Agent] Type a "." to trigger LLM analysis with tool calling');
  }
});

provider.on('status', ({ status }) => {
  console.log('[Agent] Status:', status);
});

// Track pending geocode tasks waiting for client response
const pendingGeocodeTasks = new Map(); // taskId -> { resolve, reject }

// Listen for custom messages from clients (geocode results)
provider.on('custom-message', (message) => {
  try {
    const data = JSON.parse(message);
    console.log('[Agent] Received custom message:', data.type);

    if (data.type === 'geocode_result') {
      const pending = pendingGeocodeTasks.get(data.taskId);
      if (pending) {
        console.log(`[Agent] ✅ Received geocode result for task ${data.taskId}`);
        pending.resolve(data.result);
        pendingGeocodeTasks.delete(data.taskId);
      } else {
        console.log(`[Agent] ⚠️  Received result for unknown task: ${data.taskId}`);
      }
    }
  } catch (error) {
    console.error('[Agent] Error handling custom message:', error);
  }
});

// Set up observer for document changes
let isInitialSync = true;
let cursorMoveDebounceTimer = null;

yXmlFragment.observeDeep((events) => {
  if (isInitialSync) {
    console.log('[Agent] Initial sync completed, document state loaded');
    isInitialSync = false;
    return;
  }

  console.log('[Agent] Document changed');

  let periodDetected = false;

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
function getAllTextNodes(xmlFragment) {
  const textNodes = [];
  let currentOffset = 0;

  function traverse(element) {
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
      let child = element._first;
      while (child) {
        if (child.content) {
          traverse(child.content.type);
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
 * Mock LLM function that analyzes document text and returns tool calls
 * @param {string} documentText - The full document text
 * @returns {Promise<{toolCalls: Array<{tool: string, args: object}>}>}
 */
async function callMockLLM(documentText) {
  console.log('[Agent] 🤖 Calling mock LLM...');

  // Simulate LLM processing time (500ms)
  await new Promise(resolve => setTimeout(resolve, 500));

  const toolCalls = [];

  // Mock LLM logic: detect "Copenhagen" (case-insensitive) and create tool calls
  const locationMatch = documentText.match(/copenhagen/i);

  if (locationMatch) {
    const matchedText = locationMatch[0];
    const startOffset = locationMatch.index;
    const endOffset = startOffset + matchedText.length;

    console.log(`[Agent] 💭 LLM detected location: "${matchedText}"`);

    // Tool call 1: Select the text
    toolCalls.push({
      tool: 'selectText',
      args: {
        text: matchedText,
        startOffset,
        endOffset
      }
    });

    // Tool call 2: Geocode the location
    toolCalls.push({
      tool: 'geocode',
      args: {
        locationName: matchedText
      }
    });

    // Tool call 3: Create geo-mark (will use result from geocode)
    toolCalls.push({
      tool: 'createGeoMark',
      args: {
        text: matchedText,
        startOffset,
        endOffset,
        // geocodeResult will be populated after geocode tool executes
        geocodeResult: null
      }
    });
  }

  return { toolCalls };
}

/**
 * Tool registry - available tools for the LLM to call
 */
const tools = {
  /**
   * Select text in the document by setting the agent's cursor
   */
  selectText: async ({ text, startOffset, endOffset }) => {
    console.log(`[Agent] 🔧 Tool: selectText("${text}", ${startOffset}, ${endOffset})`);

    // Get all text nodes
    const textNodes = getAllTextNodes(yXmlFragment);

    // Find which text node contains the start and end positions
    let startNode = null;
    let startLocalOffset = 0;
    let endNode = null;
    let endLocalOffset = 0;

    for (const textNode of textNodes) {
      if (startOffset >= textNode.startOffset && startOffset < textNode.endOffset) {
        startNode = textNode.node;
        startLocalOffset = startOffset - textNode.startOffset;
      }

      if (endOffset > textNode.startOffset && endOffset <= textNode.endOffset) {
        endNode = textNode.node;
        endLocalOffset = endOffset - textNode.startOffset;
      }
    }

    if (!startNode || !endNode) {
      throw new Error('Could not locate text nodes for selection');
    }

    // Create relative positions for the selection
    const anchor = Y.createRelativePositionFromTypeIndex(startNode, startLocalOffset);
    const head = Y.createRelativePositionFromTypeIndex(endNode, endLocalOffset);

    // Set the awareness cursor to select the text
    provider.awareness.setLocalStateField('cursor', {
      anchor: anchor,
      head: head
    });

    return {
      success: true,
      selected: text,
      positions: { startOffset, endOffset }
    };
  },

  /**
   * Create a geo-mark at the specified text range
   */
  createGeoMark: async ({ text, startOffset, endOffset, geocodeResult }) => {
    console.log(`[Agent] 🔧 Tool: createGeoMark("${text}", ${startOffset}, ${endOffset})`);

    if (!geocodeResult || !geocodeResult.lat || !geocodeResult.lng) {
      throw new Error('Invalid geocode result - missing coordinates');
    }

    // Get all text nodes
    const textNodes = getAllTextNodes(yXmlFragment);

    // Find which text node contains the start and end positions
    let startNode = null;
    let startLocalOffset = 0;
    let endNode = null;
    let endLocalOffset = 0;

    for (const textNode of textNodes) {
      if (startOffset >= textNode.startOffset && startOffset < textNode.endOffset) {
        startNode = textNode.node;
        startLocalOffset = startOffset - textNode.startOffset;
      }

      if (endOffset > textNode.startOffset && endOffset <= textNode.endOffset) {
        endNode = textNode.node;
        endLocalOffset = endOffset - textNode.startOffset;
      }
    }

    if (!startNode || !endNode) {
      throw new Error('Could not locate text nodes for geo-mark');
    }

    // Generate unique geo ID
    const geoId = `geo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Assign color index
    const colorIndex = geoMarkColorIndex++;

    // Create geo-mark attributes
    const geoMarkAttrs = {
      geoId: geoId,
      placeName: geocodeResult.displayName || text,
      lat: geocodeResult.lat.toString(),
      lng: geocodeResult.lng.toString(),
      colorIndex: colorIndex,
      coordSource: 'nominatim'
    };

    console.log(`[Agent] 📍 Creating geo-mark with ID: ${geoId}, color: ${colorIndex}`);

    // Apply the mark to the text range
    // Y.js formatting: textNode.format(startOffset, length, {markName: attributes})
    if (startNode === endNode) {
      // Single text node
      const length = endLocalOffset - startLocalOffset;
      startNode.format(startLocalOffset, length, { geoMark: geoMarkAttrs });
      console.log(`[Agent] ✅ Geo-mark applied to single text node`);
    } else {
      // Spans multiple nodes (unlikely but handle it)
      console.warn('[Agent] ⚠️  Geo-mark spans multiple text nodes - applying to first node only');
      const length = startNode.toString().length - startLocalOffset;
      startNode.format(startLocalOffset, length, { geoMark: geoMarkAttrs });
    }

    return {
      success: true,
      geoId: geoId,
      colorIndex: colorIndex,
      placeName: geoMarkAttrs.placeName,
      coordinates: { lat: geocodeResult.lat, lng: geocodeResult.lng }
    };
  },

  /**
   * Geocode a location name by delegating to client
   */
  geocode: async ({ locationName }) => {
    console.log(`[Agent] 🔧 Tool: geocode("${locationName}") - selecting target client`);

    // Get all connected clients from awareness
    const states = provider.awareness.getStates();
    const myClientId = ydoc.clientID;

    // Find a non-agent client to delegate the task to
    let targetClientId = null;
    for (const [clientId, state] of states) {
      // Skip if it's the agent itself
      if (clientId === myClientId) continue;

      // Found a non-agent client
      targetClientId = clientId;
      const clientName = state.user?.name || 'Unknown';
      console.log(`[Agent] 🎯 Selected client ${clientId} (${clientName}) for geocoding`);
      break;
    }

    if (!targetClientId) {
      throw new Error('No client available to handle geocode task');
    }

    // Generate unique task ID
    const taskId = `geocode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Send geocode task to specific client via custom message
    provider.sendMessage(JSON.stringify({
      type: 'geocode_task',
      taskId,
      locationName,
      targetClientId  // Target specific client
    }));

    console.log(`[Agent] 📤 Sent geocode task ${taskId} to client ${targetClientId}`);

    // Wait for result with timeout
    return new Promise((resolve, reject) => {
      pendingGeocodeTasks.set(taskId, { resolve, reject });

      // Timeout after 10 seconds
      const timeoutId = setTimeout(() => {
        if (pendingGeocodeTasks.has(taskId)) {
          pendingGeocodeTasks.delete(taskId);
          console.error(`[Agent] ⏱️  Geocode task ${taskId} timed out`);
          reject(new Error(`Geocode task timeout for "${locationName}"`));
        }
      }, 10000);

      // Clear timeout when promise resolves
      const originalResolve = pendingGeocodeTasks.get(taskId).resolve;
      pendingGeocodeTasks.get(taskId).resolve = (result) => {
        clearTimeout(timeoutId);
        originalResolve(result);
      };
    });
  }
};

/**
 * Execute a single tool call
 * @param {object} toolCall - {tool: string, args: object}
 * @returns {Promise<any>} Tool execution result
 */
async function executeTool(toolCall) {
  const toolFn = tools[toolCall.tool];

  if (!toolFn) {
    console.error(`[Agent] ❌ Unknown tool: ${toolCall.tool}`);
    return null;
  }

  try {
    const result = await toolFn(toolCall.args);
    console.log(`[Agent] ✅ Tool result:`, result);
    return result;
  } catch (error) {
    console.error(`[Agent] ❌ Tool execution error:`, error.message);
    return null;
  }
}

/**
 * Process document with LLM and execute returned tool calls
 */
async function processDocumentWithLLM() {
  try {
    console.log('[Agent] 🔎 Analyzing document with LLM...');

    // Get all text nodes
    const textNodes = getAllTextNodes(yXmlFragment);

    if (textNodes.length === 0) {
      console.log('[Agent] ❌ Document is empty');
      return;
    }

    // Combine all text
    const fullText = textNodes.map(n => n.text).join('');
    console.log(`[Agent] Document text: "${fullText}"`);

    // Call mock LLM
    const { toolCalls } = await callMockLLM(fullText);

    if (toolCalls.length === 0) {
      console.log('[Agent] 💭 LLM returned no tool calls');
      return;
    }

    console.log(`[Agent] 📋 LLM returned ${toolCalls.length} tool call(s)`);

    // Execute each tool call sequentially
    // Store results for passing between tools
    const toolResults = {};

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];

      // If this is createGeoMark, inject the geocode result
      if (toolCall.tool === 'createGeoMark' && toolResults.geocode) {
        toolCall.args.geocodeResult = toolResults.geocode;
      }

      const result = await executeTool(toolCall);

      // Store result for other tools to use
      if (result) {
        toolResults[toolCall.tool] = result;
      }

      // Small delay between tool executions for visibility
      await new Promise(resolve => setTimeout(resolve, 500));
    }

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
  provider.destroy();
  ydoc.destroy();
  process.exit(0);
});

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
import fetch from 'node-fetch';

// Polyfill WebSocket for Node.js
global.WebSocket = WebSocket;

// Configuration
const COLLAB_HOST = process.env.COLLAB_HOST || 'tourvision-collab.mads-9b9.workers.dev';
const PARTY_NAME = 'yjs-room'; // Durable Object binding name (kebab-case of "YJS_ROOM")
const CHAT_WORKER_URL = process.env.CHAT_WORKER_URL || 'https://tourvision-chat.mads-9b9.workers.dev';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// Rate limiting for Nominatim (1 req/sec)
let lastNominatimRequest = 0;
const NOMINATIM_MIN_INTERVAL = 1000; // 1 second

// Get document ID from command line
const documentId = process.argv[2];

if (!documentId) {
  console.error('Usage: node scripts/local-agent-yjs.js <documentId>');
  process.exit(1);
}

console.log(`[Agent] Starting local agent for document: ${documentId}`);

/**
 * Extract plain text from Y.js document with position mapping
 * @param {Y.XmlFragment} xmlFragment - The Y.js XML fragment
 * @returns {{text: string, textNodes: Array<{content: string, startOffset: number, endOffset: number, node: Y.XmlText}>}}
 */
function extractPlainText(xmlFragment) {
  let text = '';
  let allTextNodes = [];

  function traverse(element, path = []) {
    if (!element) return;

    // If this is a text node, collect it
    if (element.constructor.name === 'YXmlText') {
      const content = element.toString();
      const startOffset = text.length;
      text += content;
      allTextNodes.push({
        content: content,
        startOffset: startOffset,
        endOffset: text.length,
        node: element,
        path: [...path]
      });
    }
    // If this is an element or fragment, recurse into children
    else if (element.constructor.name === 'YXmlElement' || element.constructor.name === 'YXmlFragment') {
      // Add space between block elements (paragraphs, headings, etc.)
      if (element.constructor.name === 'YXmlElement' && text.length > 0 && !text.endsWith('\n')) {
        text += '\n';
      }

      let i = 0;
      let child = element._first;
      while (child) {
        if (child.content) {
          traverse(child.content.type, [...path, i]);
        }
        child = child.right;
        i++;
      }
    }
  }

  traverse(xmlFragment);

  return { text, textNodes: allTextNodes };
}

/**
 * Get all existing geo-marks from the document
 * @param {Y.XmlFragment} xmlFragment - The Y.js XML fragment
 * @returns {Array<{placeName: string, geoId: string, startOffset: number, endOffset: number}>}
 */
function getExistingGeoMarks(xmlFragment) {
  const geoMarks = [];
  let currentOffset = 0;

  function traverse(element) {
    if (!element) return;

    // Check if this is a text node
    if (element.constructor.name === 'YXmlText') {
      currentOffset += element.length;
    }
    // Check if this is a geo-mark element
    else if (element.constructor.name === 'YXmlElement' && element.getAttribute('data-geo-id')) {
      const geoId = element.getAttribute('data-geo-id');
      const placeName = element.getAttribute('data-place-name') || element.toString();
      const textLength = element.toString().length;

      geoMarks.push({
        placeName: placeName,
        geoId: geoId,
        startOffset: currentOffset,
        endOffset: currentOffset + textLength
      });

      currentOffset += textLength;
    }
    // Recurse into children
    else if (element.constructor.name === 'YXmlElement' || element.constructor.name === 'YXmlFragment') {
      let child = element._first;
      while (child) {
        if (child.content) {
          traverse(child.content.type);
        }
        child = child.right;
      }
    }
  }

  traverse(xmlFragment);

  return geoMarks;
}

/**
 * Geocode a location name using Nominatim API with rate limiting
 * @param {string} placeName - The location name to geocode
 * @returns {Promise<{lat: number, lng: number, displayName: string} | null>}
 */
async function geocodeLocation(placeName) {
  try {
    // Rate limiting: ensure at least 1 second between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastNominatimRequest;
    if (timeSinceLastRequest < NOMINATIM_MIN_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, NOMINATIM_MIN_INTERVAL - timeSinceLastRequest));
    }
    lastNominatimRequest = Date.now();

    const response = await fetch(`${NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(placeName)}&limit=1`, {
      headers: {
        'User-Agent': 'TourVision-Agent/1.0'
      }
    });

    if (!response.ok) {
      console.error(`[Agent] Nominatim API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name
      };
    }

    return null;
  } catch (error) {
    console.error(`[Agent] Error geocoding location "${placeName}":`, error);
    return null;
  }
}

/**
 * Detect locations in text using simple regex pattern matching
 * This is a simple approach - can be enhanced with LLM later
 * @param {string} text - The plain text to analyze
 * @param {Array<{placeName: string}>} existingGeoMarks - Already marked locations to filter out
 * @returns {Promise<Array<{name: string, startOffset: number, endOffset: number}>>}
 */
async function detectLocations(text, existingGeoMarks) {
  try {
    const existingNames = existingGeoMarks.map(m => m.placeName.toLowerCase());

    // Simple pattern: capital word followed by optional capital words
    // Matches: "Paris", "New York", "San Francisco", etc.
    const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;

    const locations = [];
    const seenNames = new Set();
    let match;

    while ((match = locationPattern.exec(text)) !== null) {
      const name = match[1];
      const lowerName = name.toLowerCase();

      // Skip if already marked or already seen in this scan
      if (existingNames.includes(lowerName) || seenNames.has(lowerName)) {
        continue;
      }

      // Skip common words that aren't locations
      const commonWords = ['the', 'this', 'that', 'these', 'those', 'i', 'we', 'you', 'he', 'she', 'it', 'they'];
      if (commonWords.includes(lowerName)) {
        continue;
      }

      seenNames.add(lowerName);
      locations.push({
        name: name,
        startOffset: match.index,
        endOffset: match.index + name.length
      });
    }

    console.log(`[Agent] Detected ${locations.length} potential locations: ${locations.map(l => l.name).join(', ')}`);
    return locations;
  } catch (error) {
    console.error('[Agent] Error detecting locations:', error);
    return [];
  }
}

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
    let detectionDebounceTimer = null;

    type.observeDeep((events) => {
      if (isInitialSync) {
        console.log('[Agent] Initial sync completed, document state loaded');
        isInitialSync = false;
        return;
      }

      console.log('\n[Agent] 📝 Document changed!');
      console.log(`[Agent] Number of changes: ${events.length}`);

      let periodDetected = false;

      events.forEach((event, index) => {
        console.log(`\n[Agent] Change ${index + 1}:`);
        console.log(`  Type: ${event.constructor.name}`);
        console.log(`  Path: ${event.path.join(' > ')}`);

        if (event.changes && event.changes.delta) {
          const { added, deleted } = event.changes.delta.reduce(
            (acc, change) => {
              if (change.insert) {
                acc.added += change.insert.length || 1;
                // Check if the inserted content contains a period
                if (typeof change.insert === 'string' && change.insert.includes('.')) {
                  periodDetected = true;
                }
              }
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

      // Trigger location detection if a period was detected
      if (periodDetected) {
        console.log('\n[Agent] 🔴 Period detected! Triggering location detection...');

        // Debounce: wait 1 second after the last period before running detection
        // This allows the user to continue typing after the period
        if (detectionDebounceTimer) {
          clearTimeout(detectionDebounceTimer);
        }

        detectionDebounceTimer = setTimeout(() => {
          runLocationDetection();
        }, 1000); // 1 second debounce
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
    console.log('[Agent] 🤖 Period-triggered location detection enabled\n');
    console.log('[Agent] 💡 Type a "." (period) to trigger location detection\n');

    /**
     * Helper function to find text node and local offset for a given text offset
     */
    function findTextNodeAtOffset(xmlFragment, targetOffset) {
      let allTextNodes = [];
      let cumulativeLength = 0;

      function collectTextNodes(xmlElement, path = []) {
        if (!xmlElement) return;

        if (xmlElement.constructor.name === 'YXmlText') {
          const textLength = xmlElement.length;
          if (textLength > 0) {
            allTextNodes.push({
              node: xmlElement,
              path: [...path],
              startOffset: cumulativeLength,
              length: textLength
            });
            cumulativeLength += textLength;
          }
        } else if (xmlElement.constructor.name === 'YXmlElement' || xmlElement.constructor.name === 'YXmlFragment') {
          let i = 0;
          let child = xmlElement._first;
          while (child) {
            if (child.content) {
              collectTextNodes(child.content.type, [...path, i]);
            }
            child = child.right;
            i++;
          }
        }
      }

      collectTextNodes(xmlFragment);

      // Find which text node contains this offset
      for (const textNode of allTextNodes) {
        if (targetOffset >= textNode.startOffset && targetOffset < textNode.startOffset + textNode.length) {
          return {
            textNode: textNode.node,
            localOffset: targetOffset - textNode.startOffset
          };
        }
      }

      // Fallback to last position
      if (allTextNodes.length > 0) {
        const lastNode = allTextNodes[allTextNodes.length - 1];
        return {
          textNode: lastNode.node,
          localOffset: lastNode.length
        };
      }

      return null;
    }

    /**
     * Animate cursor to a specific location in the document
     */
    async function animateCursorToLocation(location) {
      try {
        const result = findTextNodeAtOffset(type, location.startOffset);
        if (!result) {
          console.warn(`[Agent] Could not find text node for location: ${location.name}`);
          return;
        }

        const { textNode, localOffset } = result;
        const relativePos = Y.createRelativePositionFromTypeIndex(textNode, localOffset);

        awareness.setLocalStateField('cursor', {
          anchor: relativePos,
          head: relativePos
        });

        console.log(`[Agent] 🎯 Moved cursor to "${location.name}" at offset ${location.startOffset}`);
      } catch (error) {
        console.error(`[Agent] Error animating cursor to location "${location.name}":`, error);
      }
    }

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

    /**
     * Run location detection on the current document
     */
    async function runLocationDetection() {
      try {
        console.log('\n[Agent] 🔎 Running location detection...');

        // Check if document has content
        if (type.length === 0) {
          console.log('[Agent] Document is empty, skipping detection');
          return;
        }

        // Extract plain text from document
        const { text } = extractPlainText(type);
        if (!text || text.trim().length === 0) {
          console.log('[Agent] No text content found, skipping detection');
          return;
        }

        console.log(`[Agent] Document text (${text.length} chars): "${text.substring(0, 100)}..."`);

        // Get existing geo-marks
        const existingGeoMarks = getExistingGeoMarks(type);
        console.log(`[Agent] Found ${existingGeoMarks.length} existing geo-marks: ${existingGeoMarks.map(m => m.placeName).join(', ')}`);

        // Detect new locations
        const detectedLocations = await detectLocations(text, existingGeoMarks);

        if (detectedLocations.length === 0) {
          console.log('[Agent] ✅ No new locations detected');
          return;
        }

        console.log(`[Agent] 🌍 Processing ${detectedLocations.length} new locations...`);

        // Process each detected location
        for (const location of detectedLocations) {
          console.log(`\n[Agent] Processing location: "${location.name}"`);

          // Animate cursor to location (with a small delay for visibility)
          await animateCursorToLocation(location);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second pause

          // Geocode the location
          console.log(`[Agent] Geocoding "${location.name}"...`);
          const coords = await geocodeLocation(location.name);

          if (coords) {
            console.log(`[Agent] ✅ Geocoded "${location.name}": ${coords.lat}, ${coords.lng}`);
            console.log(`[Agent]    Full name: ${coords.displayName}`);

            // TODO: Add geo-mark to document
            // For now, just log that we would add it
            console.log(`[Agent] 📍 Would add geo-mark for "${location.name}" at offset ${location.startOffset}-${location.endOffset}`);
          } else {
            console.log(`[Agent] ⚠️  Could not geocode "${location.name}"`);
          }

          // Pause between locations
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('\n[Agent] ✅ Location detection cycle complete\n');
      } catch (error) {
        console.error('[Agent] Error in detection loop:', error);
      }
    }

    // Keep the process running
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[Agent] Shutting down...');
      if (detectionDebounceTimer) {
        clearTimeout(detectionDebounceTimer);
      }
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

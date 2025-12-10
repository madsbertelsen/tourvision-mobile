/**
 * Tool Executor Service
 * Executes tool calls from the agent plan
 */

import type { AgentPlan, ToolCall, ExecutionContext, ExecutionResult } from '../types/agent';
import type { DetectedLocation } from '../types';
import { TextSelection } from 'prosemirror-state';
import { DOMParser } from 'prosemirror-model';
import { describeToolCall } from './ToolRegistry';

/**
 * Execute all tools in an agent plan sequentially
 */
export async function executePlan(
  plan: AgentPlan,
  context: ExecutionContext
): Promise<ExecutionResult[]> {
  console.log('[ToolExecutor] Executing plan with', plan.tools.length, 'tools');

  const results: ExecutionResult[] = [];

  for (const tool of plan.tools) {
    console.log('[ToolExecutor] Executing tool:', tool.name, tool.parameters);

    tool.status = 'executing';

    try {
      const result = await executeTool(tool, context);
      results.push(result);

      tool.status = result.success ? 'completed' : 'failed';

      if (!result.success) {
        console.warn('[ToolExecutor] Tool execution failed:', result);
      }
    } catch (error) {
      console.error('[ToolExecutor] Tool execution error:', error);

      const result: ExecutionResult = {
        toolName: tool.name,
        success: false,
        error: error.message || 'Unknown error'
      };

      results.push(result);
      tool.status = 'failed';
    }
  }

  console.log('[ToolExecutor] Plan execution complete. Results:', results);
  return results;
}

/**
 * Execute a single tool
 */
async function executeTool(
  tool: ToolCall,
  context: ExecutionContext
): Promise<ExecutionResult> {
  switch (tool.name) {
    case 'replaceText':
      return executeReplaceText(tool.parameters, context);

    case 'insertText':
      return executeInsertText(tool.parameters, context);

    case 'insertMap':
      return executeInsertMap(tool.parameters, context);

    case 'createGeoMark':
      return executeCreateGeoMark(tool.parameters, context);

    case 'setTransportation':
      return executeSetTransportation(tool.parameters, context);

    case 'openFullscreenMap':
      return await executeOpenFullscreenMap(
        tool.parameters as {
          focusLocation?: string;
          zoom?: number;
          action?: 'open' | 'focus';
        },
        context
      );

    default:
      return {
        toolName: tool.name,
        success: false,
        error: `Unknown tool: ${tool.name}`
      };
  }
}

/**
 * Tool 1: replaceText
 * Replace existing text in the document (does NOT auto-create geo-marks)
 */
function executeReplaceText(
  params: { targetText: string; replacementText: string; reason?: string },
  context: ExecutionContext
): ExecutionResult {
  const { editorView, schema } = context;
  const { state } = editorView;

  console.log('[ToolExecutor] replaceText:', params.targetText, '→', params.replacementText);

  // Find target text in document
  const range = findTextPosition(state.doc, params.targetText);
  if (!range) {
    return {
      toolName: 'replaceText',
      success: false,
      error: `Target text "${params.targetText}" not found in document`
    };
  }

  try {
    let tr = state.tr;

    // Replace the text (LLM will use createGeoMark separately if needed)
    tr = tr.replaceWith(range.from, range.to, schema.text(params.replacementText));

    // Track the replacement range for subsequent createGeoMark calls
    const newEnd = range.from + params.replacementText.length;
    context.lastInsertedRange = { from: range.from, to: newEnd };

    console.log('[ToolExecutor] Tracked replacement range:', context.lastInsertedRange);

    // Move cursor to end of replaced text
    tr = tr.setSelection(TextSelection.create(tr.doc, newEnd));

    editorView.dispatch(tr);

    return {
      toolName: 'replaceText',
      success: true,
      message: `Replaced "${params.targetText}" with "${params.replacementText}"`
    };
  } catch (error) {
    return {
      toolName: 'replaceText',
      success: false,
      error: error.message || 'Failed to replace text'
    };
  }
}

/**
 * Tool 2: insertText
 * Insert rich HTML content with geo-marks at cursor or end of document
 */
function executeInsertText(
  params: { html?: string; text?: string; position?: 'cursor' | 'end' },
  context: ExecutionContext
): ExecutionResult {
  const { editorView, schema, detectedLocations } = context;
  const { state } = editorView;

  // Support both html (new) and text (backward compatibility)
  const content = params.html || params.text || '';
  const isHtml = !!params.html;

  console.log('[ToolExecutor] insertText at', params.position || 'cursor', isHtml ? '(HTML mode)' : '(plain text mode)');

  const insertPos = params.position === 'end'
    ? state.doc.content.size
    : state.selection.from;

  try {
    let tr = state.tr;
    let insertedLength = 0;

    if (isHtml) {
      // Parse HTML and enrich geo-marks with generated attributes
      const enrichedHtml = enrichGeoMarks(content, detectedLocations);

      console.log('[ToolExecutor] Enriched HTML:', enrichedHtml);

      // Create a temporary DOM element to parse HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = enrichedHtml;

      // Use ProseMirror's DOMParser to convert HTML to ProseMirror nodes
      const parser = DOMParser.fromSchema(schema);
      const parsedDoc = parser.parse(tempDiv);

      // Insert the parsed content
      tr = tr.insert(insertPos, parsedDoc.content);
      insertedLength = parsedDoc.content.size;

      console.log('[ToolExecutor] Inserted', insertedLength, 'nodes from HTML');
    } else {
      // Plain text mode (backward compatibility)
      tr = tr.insertText(content + ' ', insertPos);
      insertedLength = content.length;
    }

    // Track the insertion range for subsequent createGeoMark calls
    const textEnd = insertPos + insertedLength;
    context.lastInsertedRange = { from: insertPos, to: textEnd };

    console.log('[ToolExecutor] Tracked insertion range:', context.lastInsertedRange);

    // Move cursor to end of inserted content
    const cursorPos = textEnd;
    tr = tr.setSelection(TextSelection.create(tr.doc, cursorPos));

    editorView.dispatch(tr);

    // Notify geo mark change to trigger map updates
    if (isHtml && context.notifyGeoMarkChange) {
      console.log('[ToolExecutor] Calling notifyGeoMarkChange after insertText');
      context.notifyGeoMarkChange();
    }

    return {
      toolName: 'insertText',
      success: true,
      message: `Inserted ${isHtml ? 'HTML' : 'text'} at ${params.position || 'cursor'}`
    };
  } catch (error) {
    console.error('[ToolExecutor] insertText error:', error);
    return {
      toolName: 'insertText',
      success: false,
      error: error.message || 'Failed to insert text'
    };
  }
}

/**
 * Tool 3: insertMap
 * Insert a map block that auto-discovers geo-marks from context
 */
function executeInsertMap(
  params: { height?: number },
  context: ExecutionContext
): ExecutionResult {
  const { editorView, schema, detectedLocations } = context;
  const { state } = editorView;

  console.log('[ToolExecutor] insertMap (auto-discover mode)');

  // Use all detected locations (auto-discover from context)
  const mapLocations = detectedLocations.filter(loc => loc.status === 'found');

  console.log('[ToolExecutor] Found locations for map:', mapLocations.length);

  try {
    // Create map node (can be empty - will discover geo-marks from context)
    const mapNode = schema.nodes.map.create({
      height: params.height || 400
    });

    // Insert after current position
    const insertPos = state.selection.to + 1;
    let tr = state.tr.insert(insertPos, mapNode);

    editorView.dispatch(tr);

    const message = mapLocations.length > 0
      ? `Inserted map with ${mapLocations.length} locations`
      : 'Inserted map (will auto-discover geo-marks from context)';

    return {
      toolName: 'insertMap',
      success: true,
      message
    };
  } catch (error) {
    return {
      toolName: 'insertMap',
      success: false,
      error: error.message || 'Failed to insert map'
    };
  }
}

/**
 * Tool 4: createGeoMark
 * Mark existing text as a location with pre-resolved coordinates
 */
function executeCreateGeoMark(
  params: { text: string; placeName: string; lat?: number; lng?: number },
  context: ExecutionContext
): ExecutionResult {
  const { editorView, schema, detectedLocations, lastInsertedRange } = context;
  const { state } = editorView;

  console.log('[ToolExecutor] createGeoMark:', params.text, 'as', params.placeName, `(${params.lat}, ${params.lng})`);

  // Coordinates should already be resolved by geocode tool during planning
  if (!params.lat || !params.lng) {
    return {
      toolName: 'createGeoMark',
      success: false,
      error: `Missing coordinates for "${params.placeName}". Did you forget to call geocode tool first?`
    };
  }

  // Find the text in the document, preferring the last inserted range if available
  // This prevents marking text from earlier in the document when the same location name appears multiple times
  const range = findTextPosition(state.doc, params.text, lastInsertedRange);

  if (!range) {
    // If not found in insertion range, provide helpful error
    const searchContext = lastInsertedRange
      ? ` (searched within recently inserted text at positions ${lastInsertedRange.from}-${lastInsertedRange.to})`
      : '';

    return {
      toolName: 'createGeoMark',
      success: false,
      error: `Text "${params.text}" not found in document${searchContext}`
    };
  }

  console.log('[ToolExecutor] Found text at position:', range, lastInsertedRange ? '(within inserted range)' : '(global search)');

  try {
    // Generate geo-mark ID and color
    const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const colorIndex = detectedLocations.length % 10; // 10 colors in palette

    // Add to detectedLocations for reference by other tools (e.g., setTransportation)
    detectedLocations.push({
      locationName: params.placeName,
      geoId,
      lat: params.lat,
      lng: params.lng,
      colorIndex,
      status: 'found',
      ranges: [{ from: range.from, to: range.to }]
    });

    let tr = state.tr;

    // Create geo-mark with pre-resolved coordinates
    const geoMark = schema.marks.geoMark.create({
      geoId,
      placeName: params.placeName,
      lat: params.lat,
      lng: params.lng,
      colorIndex,
      coordSource: 'nominatim',
      createdAt: new Date().toISOString(),
      createdBy: 'voice-agent'
    });

    // Apply mark to range
    tr = tr.addMark(range.from, range.to, geoMark);

    editorView.dispatch(tr);

    // Notify geo mark change to trigger map updates
    if (context.notifyGeoMarkChange) {
      console.log('[ToolExecutor] Calling notifyGeoMarkChange after createGeoMark');
      context.notifyGeoMarkChange();
    }

    return {
      toolName: 'createGeoMark',
      success: true,
      message: `Marked "${params.text}" as ${params.placeName} (${params.lat}, ${params.lng})`
    };
  } catch (error) {
    return {
      toolName: 'createGeoMark',
      success: false,
      error: error.message || 'Failed to create geo-mark'
    };
  }
}

/**
 * Tool 5: setTransportation
 * Set transportation configuration between two locations
 */
function executeSetTransportation(
  params: { toLocation: string; fromLocation: string; mode: string },
  context: ExecutionContext
): ExecutionResult {
  const { editorView, schema } = context;
  const { state } = editorView;

  console.log('[ToolExecutor] setTransportation:', params.mode, 'from', params.fromLocation, 'to', params.toLocation);

  // First pass: Find geo-marks in the document to get their geoIds
  let fromGeoId: string | null = null;
  let toGeoId: string | null = null;

  state.doc.descendants((node: any, pos: number) => {
    if (node.isText && node.marks) {
      for (const mark of node.marks) {
        if (mark.type.name === 'geoMark') {
          const placeName = mark.attrs.placeName.toLowerCase();

          if (placeName === params.fromLocation.toLowerCase()) {
            fromGeoId = mark.attrs.geoId;
            console.log('[ToolExecutor] Found fromLocation geo-mark:', params.fromLocation, 'geoId:', fromGeoId);
          }

          if (placeName === params.toLocation.toLowerCase()) {
            toGeoId = mark.attrs.geoId;
            console.log('[ToolExecutor] Found toLocation geo-mark:', params.toLocation, 'geoId:', toGeoId);
          }
        }
      }
    }
  });

  if (!fromGeoId) {
    return {
      toolName: 'setTransportation',
      success: false,
      error: `Origin location "${params.fromLocation}" not found in document`
    };
  }

  if (!toGeoId) {
    return {
      toolName: 'setTransportation',
      success: false,
      error: `Destination location "${params.toLocation}" not found in document`
    };
  }

  // Map transportation modes to profile names
  const transportProfileMap: { [key: string]: string } = {
    'cycling': 'cycling',
    'driving': 'driving-car',
    'walking': 'foot-walking',
    'flying': 'plane'
  };

  const transportProfile = transportProfileMap[params.mode] || params.mode;

  try {
    let tr = state.tr;
    let updatedCount = 0;

    // Second pass: Update all geo-marks for the toLocation with transport attributes
    state.doc.descendants((node: any, pos: number) => {
      if (node.isText && node.marks) {
        for (const mark of node.marks) {
          if (mark.type.name === 'geoMark' &&
              mark.attrs.placeName.toLowerCase() === params.toLocation.toLowerCase()) {
            // Remove old mark
            tr = tr.removeMark(pos, pos + node.nodeSize, mark);

            // Create new mark with transport attributes
            const newMark = schema.marks.geoMark.create({
              ...mark.attrs,
              transportFrom: fromGeoId,
              transportProfile: transportProfile
            });

            // Add new mark
            tr = tr.addMark(pos, pos + node.nodeSize, newMark);
            updatedCount++;
            console.log('[ToolExecutor] Updated geo-mark with transport:', {
              toLocation: params.toLocation,
              fromGeoId,
              transportProfile
            });
          }
        }
      }
    });

    if (updatedCount === 0) {
      return {
        toolName: 'setTransportation',
        success: false,
        error: `No geo-mark found for "${params.toLocation}" to update`
      };
    }

    editorView.dispatch(tr);

    // Notify geo mark change to trigger map updates (transport routes)
    if (context.notifyGeoMarkChange) {
      console.log('[ToolExecutor] Calling notifyGeoMarkChange after setTransportation');
      context.notifyGeoMarkChange();
    }

    return {
      toolName: 'setTransportation',
      success: true,
      message: `Set ${params.mode} from ${params.fromLocation} to ${params.toLocation} (updated ${updatedCount} geo-mark(s))`
    };
  } catch (error) {
    return {
      toolName: 'setTransportation',
      success: false,
      error: error.message || 'Failed to set transportation'
    };
  }
}

/**
 * Find the position of a text string in the document
 * Returns the first occurrence found (optionally within a specific range)
 */
function findTextPosition(
  doc: any,
  text: string,
  searchRange?: { from: number; to: number }
): { from: number; to: number } | null {
  let foundPosition: { from: number; to: number } | null = null;

  doc.descendants((node: any, pos: number) => {
    if (foundPosition) return false; // Already found, stop iterating

    if (node.isText && node.text) {
      const index = node.text.indexOf(text);
      if (index !== -1) {
        const matchFrom = pos + index;
        const matchTo = pos + index + text.length;

        // If searchRange is specified, only accept matches within that range
        if (searchRange) {
          if (matchFrom >= searchRange.from && matchTo <= searchRange.to) {
            foundPosition = { from: matchFrom, to: matchTo };
            return false; // Stop iterating
          }
        } else {
          foundPosition = { from: matchFrom, to: matchTo };
          return false; // Stop iterating
        }
      }
    }
  });

  return foundPosition;
}

/**
 * Enrich geo-mark spans in HTML with generated attributes
 * Adds: data-geo-id, data-color-index, data-coord-source, data-created-at, data-created-by
 * Two-pass approach:
 *   Pass 1: Assign geo-ids to all geo-marks
 *   Pass 2: Update transport-from references to use actual geo-ids
 */
function enrichGeoMarks(html: string, detectedLocations: DetectedLocation[]): string {
  console.log('[ToolExecutor:enrichGeoMarks] === STARTING GEO-MARK ENRICHMENT ===');
  console.log('[ToolExecutor:enrichGeoMarks] Input HTML:', html);

  // Parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Find all geo-mark spans
  const geoMarkSpans = tempDiv.querySelectorAll('span.geo-mark');
  console.log('[ToolExecutor:enrichGeoMarks] Found', geoMarkSpans.length, 'geo-mark spans');

  // Pass 1: Assign geo-ids and collect mapping
  const placeNameToGeoId = new Map<string, string>();

  geoMarkSpans.forEach((span, index) => {
    const placeName = span.getAttribute('data-place-name');
    const lat = span.getAttribute('data-lat');
    const lng = span.getAttribute('data-lng');
    const displayText = span.textContent || ''; // Get the inner text (what user typed)

    if (!placeName || !lat || !lng) {
      console.warn('[ToolExecutor] Skipping invalid geo-mark:', span.innerHTML);
      return;
    }

    // Generate attributes
    // Use place name as geo-id to allow transport-from references by name
    const geoId = placeName;
    const colorIndex = detectedLocations.length + index;

    console.log('[ToolExecutor:enrichGeoMarks] Pass 1 - Processing geo-mark #' + index);
    console.log('[ToolExecutor:enrichGeoMarks]   placeName:', placeName);
    console.log('[ToolExecutor:enrichGeoMarks]   displayText:', displayText);
    console.log('[ToolExecutor:enrichGeoMarks]   ASSIGNING geo-id:', geoId);

    // Store mapping for Pass 2 - map BOTH place name AND display text to geo-id
    // This handles cases where LLM uses "Copenhagen" but geocode returned "København"
    placeNameToGeoId.set(placeName, geoId);
    if (displayText && displayText !== placeName) {
      placeNameToGeoId.set(displayText, geoId);
      console.log('[ToolExecutor:enrichGeoMarks]   Also mapping displayText "' + displayText + '" → ' + geoId);
    }

    // Add to detectedLocations for reference by other tools
    detectedLocations.push({
      locationName: placeName,
      geoId,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      colorIndex: colorIndex % 10,
      status: 'found',
      ranges: [] // Ranges will be set after insertion
    });

    // Set attributes on span
    span.setAttribute('data-geo-id', geoId);
    span.setAttribute('data-color-index', String(colorIndex % 10));
    span.setAttribute('data-coord-source', 'nominatim');
    span.setAttribute('data-created-at', new Date().toISOString());
    span.setAttribute('data-created-by', 'voice-agent');

    console.log('[ToolExecutor] Enriched geo-mark:', placeName, '(display:', displayText, ') → geo-id:', geoId);
  });

  // Pass 2: Update transport-from references to use actual geo-ids
  console.log('[ToolExecutor:enrichGeoMarks] === PASS 2: Updating transport-from references ===');
  console.log('[ToolExecutor:enrichGeoMarks] Place name to geo-id map:', Array.from(placeNameToGeoId.entries()));

  geoMarkSpans.forEach((span, index) => {
    const transportFrom = span.getAttribute('data-transport-from');

    if (transportFrom) {
      console.log('[ToolExecutor:enrichGeoMarks] Pass 2 - Geo-mark #' + index + ' has transport-from:', transportFrom);

      // If transport-from is a place name, convert it to geo-id
      const fromGeoId = placeNameToGeoId.get(transportFrom);

      if (fromGeoId) {
        span.setAttribute('data-transport-from', fromGeoId);
        console.log('[ToolExecutor:enrichGeoMarks]   Updated transport-from:', transportFrom, '→', fromGeoId);
      } else {
        console.warn('[ToolExecutor:enrichGeoMarks]   Could not find geo-id for transport-from:', transportFrom);
        console.warn('[ToolExecutor:enrichGeoMarks]   Available mappings:', Array.from(placeNameToGeoId.keys()));
      }
    }
  });

  const result = tempDiv.innerHTML;
  console.log('[ToolExecutor:enrichGeoMarks] === FINAL ENRICHED HTML ===');
  console.log('[ToolExecutor:enrichGeoMarks]', result);

  return result;
}

/**
 * Apply geo-marks to detected locations in inserted text
 * Reuses the pattern from voice-draft-sheet.ts
 */
function applyGeoMarks(
  tr: any,
  text: string,
  fromPos: number,
  detectedLocations: DetectedLocation[],
  schema: any
): any {
  const foundLocations = detectedLocations.filter(loc => loc.status === 'found');

  foundLocations.forEach(location => {
    const { locationName, geoId, lat, lng, colorIndex } = location;

    if (geoId && lat !== undefined && lng !== undefined && colorIndex !== undefined) {
      // Apply geo-mark to each occurrence of this location in the text
      if (location.ranges) {
        location.ranges.forEach(range => {
          const markFrom = fromPos + range.from;
          const markTo = fromPos + range.to;

          // Create geo-mark
          const geoMark = schema.marks.geoMark.create({
            geoId,
            placeName: locationName,
            lat,
            lng,
            colorIndex,
            coordSource: 'nominatim',
            createdAt: new Date().toISOString(),
            createdBy: 'voice-agent'
          });

          // Apply mark to range
          tr = tr.addMark(markFrom, markTo, geoMark);
        });

        console.log(`[ToolExecutor] Applied geo-mark: ${locationName} (${geoId})`);
      }
    }
  });

  return tr;
}

/**
 * Tool 7: openFullscreenMap
 * Open fullscreen map and optionally pan/zoom to a location
 */
async function executeOpenFullscreenMap(
  params: {
    focusLocation?: string;
    zoom?: number;
    action?: 'open' | 'focus';
  },
  context: ExecutionContext
): Promise<ExecutionResult> {
  console.log('[ToolExecutor:openFullscreenMap] Opening fullscreen map', params);

  try {
    const zoom = params.zoom ?? 10;
    const action = params.action ?? 'open';

    // Check if fullscreen map is already open by checking the stored reference
    // The reference is set when showFullscreenMap creates the map and cleared when closed
    const fullscreenMapView = (window as any).fullscreenMapView;
    const isMapOpen = fullscreenMapView &&
                      fullscreenMapView.map &&
                      typeof fullscreenMapView.map.isStyleLoaded === 'function' &&
                      fullscreenMapView.map.isStyleLoaded();

    // Get the global showFullscreenMap function
    const showFullscreenMap = (window as any).showFullscreenMap;
    if (!showFullscreenMap) {
      throw new Error('showFullscreenMap function not available');
    }

    // Only open the map if it's not already open
    if (!isMapOpen) {
      console.log('[ToolExecutor:openFullscreenMap] Opening fullscreen map (no reference or map not ready)');
      showFullscreenMap(null);
    } else {
      console.log('[ToolExecutor:openFullscreenMap] Fullscreen map already open (using stored reference), skipping reopen');
    }

    // If focusing on a location, geocode and animate to it
    if (params.focusLocation) {
      // Start geocoding (async)
      const geocodingService = await import('./GeocodingService').then(m => m.geocodingService);
      const geocodedResult = await geocodingService.geocode(params.focusLocation);

      if (!geocodedResult) {
        console.warn(`[ToolExecutor:openFullscreenMap] Could not geocode ${params.focusLocation}`);
        return {
          toolName: 'openFullscreenMap',
          success: true,
          message: 'Opened fullscreen map (could not find location to focus on)'
        };
      }

      console.log(`[ToolExecutor:openFullscreenMap] Geocoded ${params.focusLocation}:`, geocodedResult);

      // Animate to location using the stored reference
      // Wait 300ms if map was just opened to allow initialization, animate immediately if already open
      const delay = isMapOpen ? 0 : 300;
      setTimeout(() => {
        const fullscreenMapView = (window as any).fullscreenMapView;
        if (fullscreenMapView && fullscreenMapView.map) {
          const map = fullscreenMapView.map;

          if (geocodedResult.boundingbox) {
            // Use fitBounds with Nominatim's accurate boundingbox
            const bounds: [[number, number], [number, number]] = [
              [geocodedResult.boundingbox.west, geocodedResult.boundingbox.south],
              [geocodedResult.boundingbox.east, geocodedResult.boundingbox.north]
            ];
            console.log(`[ToolExecutor:openFullscreenMap] Flying to bounds for ${params.focusLocation}:`, bounds);
            map.fitBounds(bounds, { padding: 50, duration: 1000 });
          } else {
            // Fallback: flyTo center point with zoom
            const center: [number, number] = [parseFloat(geocodedResult.lng), parseFloat(geocodedResult.lat)];
            console.log(`[ToolExecutor:openFullscreenMap] Flying to center for ${params.focusLocation}:`, center);
            map.flyTo({ center, zoom, duration: 1000 });
          }
        }
      }, delay); // Wait for map to initialize if just opened, otherwise animate immediately
    }

    return {
      toolName: 'openFullscreenMap',
      success: true,
      message: params.focusLocation
        ? isMapOpen
          ? `Focused map on ${params.focusLocation}`
          : `Opened fullscreen map focused on ${params.focusLocation} (zoom: ${zoom})`
        : isMapOpen
          ? 'Fullscreen map already open'
          : 'Opened fullscreen map'
    };
  } catch (error: any) {
    console.error('[ToolExecutor:openFullscreenMap] Error:', error);
    return {
      toolName: 'openFullscreenMap',
      success: false,
      error: error.message || 'Failed to open fullscreen map'
    };
  }
}

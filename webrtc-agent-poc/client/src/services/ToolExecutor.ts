/**
 * Tool Executor Service
 * Executes tool calls from the agent plan
 */

import type { AgentPlan, ToolCall, ExecutionContext, ExecutionResult } from '../types/agent';
import type { DetectedLocation } from '../types';
import { TextSelection } from 'prosemirror-state';
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
 * Insert text at cursor or end of document (does NOT auto-create geo-marks)
 */
function executeInsertText(
  params: { text: string; position?: 'cursor' | 'end' },
  context: ExecutionContext
): ExecutionResult {
  const { editorView, schema } = context;
  const { state } = editorView;

  console.log('[ToolExecutor] insertText at', params.position || 'cursor');

  const insertPos = params.position === 'end'
    ? state.doc.content.size
    : state.selection.from;

  try {
    let tr = state.tr;

    // Just insert text - DON'T auto-create geo-marks
    // The LLM will use createGeoMark separately if needed
    tr = tr.insertText(params.text + ' ', insertPos);

    // Track the insertion range for subsequent createGeoMark calls
    const textEnd = insertPos + params.text.length;
    context.lastInsertedRange = { from: insertPos, to: textEnd };

    console.log('[ToolExecutor] Tracked insertion range:', context.lastInsertedRange);

    // Move cursor to end of inserted text (includes space)
    const cursorPos = textEnd + 1;
    tr = tr.setSelection(TextSelection.create(tr.doc, cursorPos));

    editorView.dispatch(tr);

    return {
      toolName: 'insertText',
      success: true,
      message: `Inserted text at ${params.position || 'cursor'}`
    };
  } catch (error) {
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
  const { editorView, schema, detectedLocations } = context;
  const { state } = editorView;

  console.log('[ToolExecutor] setTransportation:', params.mode, 'from', params.fromLocation, 'to', params.toLocation);

  // Find the toLocation in detected locations
  const toLocation = detectedLocations.find(loc =>
    loc.status === 'found' && loc.locationName.toLowerCase() === params.toLocation.toLowerCase()
  );

  if (!toLocation) {
    return {
      toolName: 'setTransportation',
      success: false,
      error: `Destination location "${params.toLocation}" not found in detected locations`
    };
  }

  // Find the fromLocation in detected locations
  const fromLocation = detectedLocations.find(loc =>
    loc.status === 'found' && loc.locationName.toLowerCase() === params.fromLocation.toLowerCase()
  );

  if (!fromLocation) {
    return {
      toolName: 'setTransportation',
      success: false,
      error: `Origin location "${params.fromLocation}" not found in detected locations`
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
    let found = false;

    // Find all geo-marks for the toLocation and update their transport attributes
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
              transportFrom: fromLocation.geoId,
              transportProfile: transportProfile
            });

            // Add new mark
            tr = tr.addMark(pos, pos + node.nodeSize, newMark);
            found = true;
          }
        }
      }
    });

    if (!found) {
      return {
        toolName: 'setTransportation',
        success: false,
        error: `No geo-mark found for "${params.toLocation}"`
      };
    }

    editorView.dispatch(tr);

    return {
      toolName: 'setTransportation',
      success: true,
      message: `Set ${params.mode} from ${params.fromLocation} to ${params.toLocation}`
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

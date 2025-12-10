/**
 * Plan Parser Service
 * Converts text-based plans from IntentClarificationService into executable tool calls
 */

import type { ToolCall, AgentPlan, ClarifiedIntent } from '../types/agent';
import { GeocodingService } from './GeocodingService';

/**
 * Parse a text plan into executable tool calls
 *
 * Example input:
 * 1. Geocode Copenhagen
 * 2. Geocode Stockholm
 * 3. Insert text: "I want to drive from Copenhagen to Stockholm" (with geo-marks)
 * 4. Set transportation from Copenhagen to Stockholm (driving)
 */
export async function parsePlanToToolCalls(intent: ClarifiedIntent): Promise<AgentPlan | null> {
  console.log('[PlanParser] Parsing text plan into tool calls');

  const planText = intent.intent;
  const lines = planText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  console.log('[PlanParser] Plan lines:', lines);

  const tools: ToolCall[] = [];
  const geocodingService = new GeocodingService();
  const geocodedLocations = new Map<string, { placeName: string; lat: number; lng: number }>();

  // First pass: Execute geocoding actions
  for (const line of lines) {
    const geocodeMatch = line.match(/^\d+\.\s*Geocode\s+(.+)$/i);
    if (geocodeMatch) {
      const locationName = geocodeMatch[1].trim();
      console.log(`[PlanParser] Geocoding: ${locationName}`);

      const result = await geocodingService.geocode(locationName);
      if (result) {
        geocodedLocations.set(locationName, {
          placeName: result.placeName,
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lng)
        });
        console.log(`[PlanParser] Geocoded ${locationName}:`, geocodedLocations.get(locationName));
      } else {
        console.warn(`[PlanParser] Failed to geocode ${locationName}`);
      }
    }
  }

  // Second pass: Parse all actions into tool calls
  for (const line of lines) {
    // Skip geocode lines (already processed)
    if (line.match(/^\d+\.\s*Geocode\s+/i)) {
      continue;
    }

    // Parse Insert text
    const insertTextMatch = line.match(/^\d+\.\s*Insert text:\s*"(.+?)"\s*(?:\(with geo-marks\))?$/i);
    if (insertTextMatch) {
      const textContent = insertTextMatch[1];
      console.log(`[PlanParser] Parsing insert text: ${textContent}`);

      // Build HTML with geo-marks
      let html = textContent;

      // Replace location names with geo-mark spans
      for (const [locationName, coords] of geocodedLocations.entries()) {
        const regex = new RegExp(`\\b${escapeRegex(locationName)}\\b`, 'gi');
        html = html.replace(regex, (match) => {
          return `<span class="geo-mark" data-place-name="${match}" data-lat="${coords.lat}" data-lng="${coords.lng}">${match}</span>`;
        });
      }

      tools.push({
        name: 'insertText',
        parameters: { html },
        status: 'pending'
      });
      continue;
    }

    // Parse Set transportation
    const setTransportMatch = line.match(/^\d+\.\s*Set transportation from\s+(.+?)\s+to\s+(.+?)\s*\((\w+)\)$/i);
    if (setTransportMatch) {
      const fromLocation = setTransportMatch[1].trim();
      const toLocation = setTransportMatch[2].trim();
      const mode = setTransportMatch[3].toLowerCase();

      console.log(`[PlanParser] Parsing set transportation: ${fromLocation} → ${toLocation} (${mode})`);

      const fromCoords = geocodedLocations.get(fromLocation);
      const toCoords = geocodedLocations.get(toLocation);

      if (fromCoords && toCoords) {
        tools.push({
          name: 'setTransportation',
          parameters: {
            fromLocation: fromCoords.placeName,
            toLocation: toCoords.placeName,
            mode: mode as 'cycling' | 'driving' | 'walking' | 'flying'
          },
          status: 'pending'
        });
      } else {
        console.warn(`[PlanParser] Missing coordinates for transportation: ${fromLocation} → ${toLocation}`);
      }
      continue;
    }

    // Parse Insert map
    const insertMapMatch = line.match(/^\d+\.\s*Insert map$/i);
    if (insertMapMatch) {
      console.log(`[PlanParser] Parsing insert map`);
      tools.push({
        name: 'insertMap',
        parameters: {},
        status: 'pending'
      });
      continue;
    }

    // Parse Open fullscreen map
    const openMapMatch = line.match(/^\d+\.\s*Open fullscreen map(?:\s+(?:focused on|zoomed to)\s+(.+?)(?:\s+\(zoom:\s*(\d+)\))?)?$/i);
    if (openMapMatch) {
      const focusLocation = openMapMatch[1]?.trim();
      const zoom = openMapMatch[2] ? parseInt(openMapMatch[2]) : undefined;

      console.log(`[PlanParser] Parsing open fullscreen map`, { focusLocation, zoom });

      tools.push({
        name: 'openFullscreenMap',
        parameters: {
          focusLocation: focusLocation || undefined,
          zoom: zoom || 12
        },
        status: 'pending'
      });
      continue;
    }

    // Parse Replace
    const replaceMatch = line.match(/^\d+\.\s*Replace\s+"(.+?)"\s+with\s+"(.+?)"$/i);
    if (replaceMatch) {
      const targetText = replaceMatch[1];
      const replacementText = replaceMatch[2];

      console.log(`[PlanParser] Parsing replace: "${targetText}" → "${replacementText}"`);

      tools.push({
        name: 'replaceText',
        parameters: {
          targetText,
          replacementText
        },
        status: 'pending'
      });
      continue;
    }

    console.warn(`[PlanParser] Could not parse line: ${line}`);
  }

  const plan: AgentPlan = {
    status: 'ready',
    reasoning: intent.reasoning,
    tools,
    executionResults: []
  };

  console.log('[PlanParser] Parsed plan:', plan);
  console.log('[PlanParser] Tools to execute:', tools.length);

  return plan;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

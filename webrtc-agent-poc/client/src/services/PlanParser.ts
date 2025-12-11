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

  // NEW: ID generation setup
  const planTimestamp = Date.now();
  let locationIdCounter = 0;

  // NEW: Updated geocoded locations structure with IDs
  const geocodedLocations = new Map<string, {
    locationId: string;      // Unique ID for this geocoding
    displayName: string;     // Original name from plan
    placeName: string;       // Full name from Nominatim
    lat: number;
    lng: number;
  }>();

  // First pass: Execute geocoding actions
  for (const line of lines) {
    const geocodeMatch = line.match(/^\d+\.\s*Geocode\s+(.+)$/i);
    if (geocodeMatch) {
      const locationName = geocodeMatch[1].trim();
      console.log(`[PlanParser] Geocoding: ${locationName}`);

      const result = await geocodingService.geocode(locationName);
      if (result) {
        // NEW: Generate unique ID for this location
        const locationId = `loc_${planTimestamp}_${locationIdCounter}`;
        locationIdCounter++;

        geocodedLocations.set(locationName, {
          locationId,
          displayName: locationName,
          placeName: result.placeName,
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lng)
        });
        console.log(`[PlanParser] Geocoded ${locationName} → ID: ${locationId}`);
      } else {
        console.warn(`[PlanParser] Failed to geocode ${locationName}`);
      }
    }
  }

  // Second pass: Parse all actions into tool calls
  // NEW: Track occurrence usage for setTransportation
  const locationUsageCounter = new Map<string, number>();

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

      // NEW: Track each occurrence separately (different ID per occurrence)
      const locationOccurrences = new Map<string, number>();

      // Replace location names with geo-mark spans
      for (const [locationName, locData] of geocodedLocations.entries()) {
        const regex = new RegExp(`\\b${escapeRegex(locationName)}\\b`, 'gi');

        // NEW: Generate unique ID for EACH occurrence
        let occurrenceCount = 0;

        html = html.replace(regex, (match) => {
          // Generate unique ID for this specific occurrence
          const occurrenceId = `${locData.locationId}_occ${occurrenceCount}`;
          occurrenceCount++;

          console.log(`[PlanParser] Replacing occurrence #${occurrenceCount} of ${match} with ID ${occurrenceId}`);

          return `<span class="geo-mark" data-geo-id="${occurrenceId}" data-place-name="${match}" data-lat="${locData.lat}" data-lng="${locData.lng}">${match}</span>`;
        });

        locationOccurrences.set(locationName, occurrenceCount);
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

      const fromData = geocodedLocations.get(fromLocation);
      const toData = geocodedLocations.get(toLocation);

      if (fromData && toData) {
        // NEW: Determine which occurrence to use (based on order of appearance in plan)
        const fromOccurrence = locationUsageCounter.get(fromLocation) || 0;
        const toOccurrence = locationUsageCounter.get(toLocation) || 0;

        locationUsageCounter.set(fromLocation, fromOccurrence + 1);
        locationUsageCounter.set(toLocation, toOccurrence + 1);

        const fromLocationId = `${fromData.locationId}_occ${fromOccurrence}`;
        const toLocationId = `${toData.locationId}_occ${toOccurrence}`;

        console.log(`[PlanParser] setTransportation: ${fromLocation}[occ${fromOccurrence}] → ${toLocation}[occ${toOccurrence}]`);
        console.log(`[PlanParser] IDs: ${fromLocationId} → ${toLocationId}`);

        tools.push({
          name: 'setTransportation',
          parameters: {
            // NEW: ID-based referencing
            fromLocationId,
            toLocationId,

            // LEGACY: Keep for backward compatibility
            fromLocation: fromLocation,  // Use original name from plan, not Nominatim placeName
            toLocation: toLocation,      // Use original name from plan, not Nominatim placeName

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

    // Parse Open fullscreen map (no location parameter)
    const openMapMatch = line.match(/^\d+\.\s*Open fullscreen map$/i);
    if (openMapMatch) {
      console.log(`[PlanParser] Parsing open fullscreen map`);

      tools.push({
        name: 'openFullscreenMap',
        parameters: {},
        status: 'pending'
      });
      continue;
    }

    // Parse Center map on location (for already-open fullscreen map)
    const centerMapMatch = line.match(/^\d+\.\s*Center map on\s+(.+?)(?:\s+\(zoom:\s*(\d+)\))?$/i);
    if (centerMapMatch) {
      const location = centerMapMatch[1].trim();
      const zoom = centerMapMatch[2] ? parseInt(centerMapMatch[2]) : undefined;

      console.log(`[PlanParser] Parsing center map on:`, location, { zoom });

      tools.push({
        name: 'focusMap',
        parameters: {
          location,
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

    // Parse Answer (for informational questions)
    const answerMatch = line.match(/^\d+\.\s*Answer:\s*"?(.+?)"?$/i);
    if (answerMatch) {
      const answer = answerMatch[1].trim();

      console.log(`[PlanParser] Parsing answer: "${answer}"`);

      tools.push({
        name: 'answerQuestion',
        parameters: {
          answer
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

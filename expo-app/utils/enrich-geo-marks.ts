/**
 * Utility to enrich geo-marks in HTML content with accurate Nominatim coordinates
 * Replaces LLM-generated approximate coordinates with accurate ones from Nominatim
 */

import { geocodeWithNominatim } from './nominatim';

interface GeoMarkMatch {
  fullMatch: string;
  placeName: string;
  lat: string;
  lng: string;
  coordSource: string;
  colorIndex: string;
  text: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Parse geo-marks from HTML content
 */
function parseGeoMarks(html: string): GeoMarkMatch[] {
  const geoMarkRegex = /<span\s+class="geo-mark"\s+data-place-name="([^"]*)"\s+data-lat="([^"]*)"\s+data-lng="([^"]*)"\s+data-coord-source="([^"]*)"\s+data-color-index="([^"]*)">([^<]*)<\/span>/g;

  const matches: GeoMarkMatch[] = [];
  let match;

  while ((match = geoMarkRegex.exec(html)) !== null) {
    matches.push({
      fullMatch: match[0],
      placeName: match[1],
      lat: match[2],
      lng: match[3],
      coordSource: match[4],
      colorIndex: match[5],
      text: match[6],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return matches;
}

/**
 * Enrich HTML content containing geo-marks with accurate Nominatim coordinates
 * Only enriches geo-marks with coordSource="llm" (LLM-generated approximate coords)
 *
 * @param htmlContent - HTML string containing geo-mark spans
 * @param options - Configuration options
 * @returns Enriched HTML with accurate coordinates
 */
export async function enrichGeoMarksInHTML(
  htmlContent: string,
  options: {
    /**
     * Whether to skip enrichment (useful for testing)
     */
    skip?: boolean;
    /**
     * Callback for progress updates
     */
    onProgress?: (current: number, total: number, placeName: string) => void;
  } = {}
): Promise<string> {
  if (options.skip) {
    return htmlContent;
  }

  // Parse all geo-marks from the HTML
  const geoMarks = parseGeoMarks(htmlContent);

  if (geoMarks.length === 0) {
    console.log('[enrichGeoMarks] No geo-marks found in content');
    return htmlContent;
  }

  console.log(`[enrichGeoMarks] Found ${geoMarks.length} geo-marks, enriching...`);

  // Filter to only LLM-generated coordinates that need enrichment
  const needsEnrichment = geoMarks.filter(mark =>
    mark.coordSource === 'llm' && mark.placeName && mark.lat && mark.lng
  );

  if (needsEnrichment.length === 0) {
    console.log('[enrichGeoMarks] No LLM-generated geo-marks to enrich');
    return htmlContent;
  }

  console.log(`[enrichGeoMarks] Enriching ${needsEnrichment.length} LLM-generated geo-marks`);

  // Enrich each geo-mark with Nominatim
  const enrichedMarks = await Promise.all(
    needsEnrichment.map(async (mark, index) => {
      try {
        options.onProgress?.(index + 1, needsEnrichment.length, mark.placeName);

        // Use LLM coordinates as bias for disambiguation
        const biasCoords = {
          lat: parseFloat(mark.lat),
          lng: parseFloat(mark.lng)
        };

        const result = await geocodeWithNominatim(mark.placeName, { biasCoords });

        if (result) {
          console.log(`[enrichGeoMarks] ✓ Enriched: ${mark.placeName} (${mark.lat}, ${mark.lng}) → (${result.lat}, ${result.lng})`);

          return {
            ...mark,
            lat: result.lat.toString(),
            lng: result.lng.toString(),
            coordSource: 'nominatim'
          };
        } else {
          console.warn(`[enrichGeoMarks] ✗ Failed to enrich: ${mark.placeName}, keeping LLM coordinates`);
          return mark;
        }
      } catch (error) {
        console.error(`[enrichGeoMarks] Error enriching ${mark.placeName}:`, error);
        return mark; // Keep original if enrichment fails
      }
    })
  );

  // Replace geo-marks in HTML with enriched versions
  let enrichedHTML = htmlContent;

  // Sort by startIndex in reverse order to avoid index shifting issues
  const sortedMarks = [...enrichedMarks].sort((a, b) => b.startIndex - a.startIndex);

  for (const mark of sortedMarks) {
    const newSpan = `<span class="geo-mark" data-place-name="${mark.placeName}" data-lat="${mark.lat}" data-lng="${mark.lng}" data-coord-source="${mark.coordSource}" data-color-index="${mark.colorIndex}">${mark.text}</span>`;

    enrichedHTML =
      enrichedHTML.substring(0, mark.startIndex) +
      newSpan +
      enrichedHTML.substring(mark.endIndex);
  }

  console.log(`[enrichGeoMarks] ✓ Successfully enriched ${enrichedMarks.length} geo-marks`);
  return enrichedHTML;
}

/**
 * Extract all geo-marks from HTML content
 * Useful for displaying locations on a map
 */
export function extractGeoMarksFromHTML(html: string): Array<{
  placeName: string;
  lat: number;
  lng: number;
  coordSource: string;
}> {
  const marks = parseGeoMarks(html);

  return marks
    .filter(mark => mark.lat && mark.lng)
    .map(mark => ({
      placeName: mark.placeName,
      lat: parseFloat(mark.lat),
      lng: parseFloat(mark.lng),
      coordSource: mark.coordSource
    }));
}

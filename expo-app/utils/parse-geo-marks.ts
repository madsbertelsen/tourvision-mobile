/**
 * Parse geo-marks from HTML content
 * Extracts location data from <span class="geo-mark"> elements
 */

export interface GeoMark {
  id: string;
  geoId?: string; // The data-geo-id attribute from HTML
  placeName: string;
  displayName?: string; // The actual text content shown to users
  lat: number;
  lng: number;
  transportFrom?: string;
  transportProfile?: 'driving' | 'walking' | 'cycling' | 'transit';
  colorIndex?: number;
}

export function parseGeoMarksFromHTML(html: string): GeoMark[] {
  if (!html) return [];

  const geoMarks: GeoMark[] = [];

  // Regular expression to match geo-mark spans with their attributes
  const geoMarkRegex = /<span[^>]*class="geo-mark"[^>]*>([^<]*)<\/span>/g;
  let match;

  while ((match = geoMarkRegex.exec(html)) !== null) {
    const spanTag = match[0];
    const textContent = match[1];

    // Extract attributes using individual regex patterns
    const geoIdMatch = spanTag.match(/data-geo-id="([^"]*)"/);
    const latMatch = spanTag.match(/data-lat="([^"]*)"/);
    const lngMatch = spanTag.match(/data-lng="([^"]*)"/);
    const placeNameMatch = spanTag.match(/data-place-name="([^"]*)"/);
    const transportFromMatch = spanTag.match(/data-transport-from="([^"]*)"/);
    const transportProfileMatch = spanTag.match(/data-transport-profile="([^"]*)"/);
    const colorIndexMatch = spanTag.match(/data-color-index="([^"]*)"/);

    // Only create a geo-mark if we have valid coordinates
    if (latMatch && lngMatch) {
      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lngMatch[1]);

      if (!isNaN(lat) && !isNaN(lng)) {
        const geoMark: GeoMark = {
          id: geoIdMatch ? geoIdMatch[1] : `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          geoId: geoIdMatch ? geoIdMatch[1] : undefined,
          placeName: placeNameMatch ? placeNameMatch[1] : textContent,
          displayName: textContent, // The actual visible text
          lat,
          lng,
        };

        if (transportFromMatch) {
          geoMark.transportFrom = transportFromMatch[1];
        }

        if (transportProfileMatch) {
          geoMark.transportProfile = transportProfileMatch[1] as 'driving' | 'walking' | 'cycling' | 'transit';
        }

        if (colorIndexMatch) {
          geoMark.colorIndex = parseInt(colorIndexMatch[1], 10);
        }

        geoMarks.push(geoMark);
      }
    }
  }

  // Post-process to resolve transport-from references
  // Be forgiving: try to match by geo-id first, then by display name (case-insensitive)
  for (const mark of geoMarks) {
    if (mark.transportFrom) {
      // First try exact geo-id match
      let originMark = geoMarks.find(m => m.geoId === mark.transportFrom);

      // If not found, try case-insensitive display name match
      if (!originMark) {
        const transportFromLower = mark.transportFrom.toLowerCase().trim();
        originMark = geoMarks.find(m => {
          const displayLower = (m.displayName || '').toLowerCase().trim();
          return displayLower === transportFromLower ||
                 displayLower.includes(transportFromLower) ||
                 transportFromLower.includes(displayLower);
        });

        // If still not found, try against placeName as fallback
        if (!originMark) {
          originMark = geoMarks.find(m => {
            const placeNameLower = m.placeName.toLowerCase();
            return placeNameLower.includes(transportFromLower) ||
                   transportFromLower.includes(placeNameLower);
          });
        }

        // If we found a match, update transportFrom to use the geo-id
        if (originMark) {
          mark.transportFrom = originMark.geoId || originMark.id;
        }
      }
    }
  }

  return geoMarks;
}

/**
 * Get the latest assistant message's geo-marks
 */
export function getLatestAssistantGeoMarks(messages: any[]): GeoMark[] {
  // Find the most recent assistant message
  const assistantMessages = messages.filter(msg => msg.role === 'assistant');
  if (assistantMessages.length === 0) return [];

  const latestMessage = assistantMessages[assistantMessages.length - 1];
  return parseGeoMarksFromHTML(latestMessage.content || '');
}
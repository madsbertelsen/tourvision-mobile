/**
 * Extract locations from text using LLM and generate ProseMirror document with geo-marks
 * This is used for voice dictation to automatically identify locations and create structured content
 */

export interface GeoMarkNode {
  type: 'geoMark';
  attrs: {
    geoId: string;
    placeName: string;
    lat?: number;
    lng?: number;
    colorIndex: number;
    coordSource?: string;
    transportFrom?: string | null;
    transportProfile?: string | null;
  };
  content: Array<{ type: 'text'; text: string }>;
}

export interface ProseMirrorDocument {
  type: 'doc';
  content: Array<{
    type: string;
    content?: Array<any>;
    attrs?: any;
  }>;
}

/**
 * Generate ProseMirror document with geo-marks from dictated text using LLM (Cloudflare Workers AI)
 *
 * @param text The transcribed text from voice dictation
 * @param existingLocations Array of location names that are already marked (to avoid re-marking)
 * @returns ProseMirror document with geo-marks (without coordinates - need to geocode)
 */
export async function extractLocationsFromText(
  text: string,
  existingLocations?: string[]
): Promise<ProseMirrorDocument | null> {
  console.log('[LocationExtraction] Processing text with LLM:', text);
  console.log('[LocationExtraction] Existing locations to skip:', existingLocations);

  try {
    // Call Cloudflare Workers AI via direct API
    const CHAT_WS_URL = process.env.EXPO_PUBLIC_CHAT_WS_URL || 'https://tourvision-chat.mads-9b9.workers.dev';
    const HTTP_URL = CHAT_WS_URL.replace('wss://', 'https://').replace('ws://', 'http://');

    const response = await fetch(`${HTTP_URL}/api/extract-locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        existingLocations: existingLocations || []
      })
    });

    if (!response.ok) {
      console.error('[LocationExtraction] API request failed:', response.status, response.statusText);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[LocationExtraction] LLM response:', data);

    return data.document || null;
  } catch (error) {
    console.error('[LocationExtraction] Error calling LLM:', error);
    // Fall back to null on error
    return null;
  }
}

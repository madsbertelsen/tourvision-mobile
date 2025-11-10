/**
 * Extract location names from text using LLM
 * This is used for voice dictation to automatically identify locations
 */

export interface ExtractedLocation {
  name: string;
  startIndex: number;
  endIndex: number;
  confidence: number; // 0-1
}

/**
 * Extract location names from dictated text using LLM
 *
 * @param text The transcribed text from voice dictation
 * @returns Array of detected locations with their positions
 */
export async function extractLocationsFromText(text: string): Promise<ExtractedLocation[]> {
  // TODO: Call LLM API (Mistral via Vercel AI SDK or similar)
  // For now, return a mock implementation

  console.log('[LocationExtraction] Processing text:', text);

  // Mock implementation - finds common Danish location names
  const locations: ExtractedLocation[] = [];
  const knownLocations = [
    'København', 'Kobenhavn', 'Copenhagen',
    'Lejre',
    'Århus', 'Aarhus',
    'Odense',
    'Aalborg',
    'Roskilde',
    'Helsingør', 'Elsinore',
    'Paris', 'London', 'Berlin', 'Stockholm'
  ];

  const lowerText = text.toLowerCase();

  for (const location of knownLocations) {
    const lowerLocation = location.toLowerCase();
    let startIndex = 0;

    while ((startIndex = lowerText.indexOf(lowerLocation, startIndex)) !== -1) {
      locations.push({
        name: location,
        startIndex,
        endIndex: startIndex + location.length,
        confidence: 0.9
      });
      startIndex += location.length;
    }
  }

  console.log('[LocationExtraction] Found locations:', locations);
  return locations;
}

/**
 * Create LLM prompt for location extraction
 */
function createLocationExtractionPrompt(text: string): string {
  return `Extract all location names (cities, countries, landmarks, addresses) from the following text.
Return a JSON array of objects with format: {"name": "location name", "startIndex": number, "endIndex": number, "confidence": number}

Text: "${text}"

Return only the JSON array, no explanation.`;
}

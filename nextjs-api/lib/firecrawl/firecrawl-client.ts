/**
 * Firecrawl client for extracting travel content from URLs
 */

import Firecrawl from '@mendable/firecrawl-js';

interface ExtractedLocation {
  name: string;
  description?: string;
  type?: 'attraction' | 'restaurant' | 'hotel' | 'activity' | 'place';
}

interface ExtractedContent {
  content: string;
  locations: ExtractedLocation[];
  title?: string;
  description?: string;
  sourceUrl: string;
}

export class FirecrawlClient {
  private client: Firecrawl;

  constructor(apiKey: string) {
    this.client = new Firecrawl({ apiKey });
  }

  /**
   * Extract travel-related locations from content
   */
  private extractLocations(content: string): ExtractedLocation[] {
    const locations: ExtractedLocation[] = [];
    const seen = new Set<string>();

    // Common patterns for travel locations
    const patterns = [
      // Headings with locations (e.g., "Visit the Eiffel Tower")
      /(?:visit|explore|see|tour|discover|check out)\s+(?:the\s+)?([A-Z][A-Za-z\s]+(?:[A-Z][A-Za-z\s]+)*)/gi,

      // Location names in quotes
      /"([A-Z][A-Za-z\s]+(?:[A-Z][A-Za-z\s]+)*)"/g,

      // Landmarks and attractions (e.g., "Sagrada Familia", "Central Park")
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,

      // Museums, galleries, parks
      /\b([A-Za-z\s]+(?:Museum|Gallery|Park|Palace|Cathedral|Church|Temple|Tower|Bridge|Beach|Market|Square|Plaza|Gardens?))\b/gi,

      // Restaurants and cafes
      /\b(?:restaurant|café|cafe|bistro|bar|pub)\s+([A-Z][A-Za-z\s]+)/gi,

      // Hotels
      /\b(?:Hotel|Hostel|Resort|Inn)\s+([A-Z][A-Za-z\s]+)/gi,
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const locationName = match[1]?.trim();
        if (locationName && locationName.length > 2 && locationName.length < 50) {
          // Filter out common words that aren't locations
          const excludeWords = [
            'Day', 'Morning', 'Afternoon', 'Evening', 'Night',
            'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
            'The', 'This', 'That', 'These', 'Those',
            'First', 'Second', 'Third', 'Next', 'Last',
            'You', 'Your', 'Our', 'Their',
          ];

          const isExcluded = excludeWords.some(word =>
            locationName.toLowerCase() === word.toLowerCase() ||
            locationName.toLowerCase().startsWith(word.toLowerCase() + ' ')
          );

          if (!isExcluded && !seen.has(locationName.toLowerCase())) {
            seen.add(locationName.toLowerCase());

            // Determine type based on context
            let type: ExtractedLocation['type'] = 'place';
            const lowerName = locationName.toLowerCase();

            if (lowerName.includes('museum') || lowerName.includes('gallery')) {
              type = 'attraction';
            } else if (lowerName.includes('restaurant') || lowerName.includes('café') ||
                       lowerName.includes('cafe') || lowerName.includes('bistro')) {
              type = 'restaurant';
            } else if (lowerName.includes('hotel') || lowerName.includes('hostel') ||
                       lowerName.includes('resort')) {
              type = 'hotel';
            } else if (lowerName.includes('park') || lowerName.includes('beach') ||
                       lowerName.includes('garden')) {
              type = 'activity';
            } else if (lowerName.includes('palace') || lowerName.includes('cathedral') ||
                       lowerName.includes('church') || lowerName.includes('temple') ||
                       lowerName.includes('tower') || lowerName.includes('bridge')) {
              type = 'attraction';
            }

            locations.push({
              name: locationName,
              type,
            });
          }
        }
      }
    });

    // Also look for structured lists (common in travel blogs)
    const listItemPattern = /^[\s]*[-•*]\s*([A-Z][A-Za-z\s]+(?:[A-Z][A-Za-z\s]+)*)/gm;
    let listMatch;
    while ((listMatch = listItemPattern.exec(content)) !== null) {
      const itemName = listMatch[1]?.trim();
      if (itemName && itemName.length > 2 && itemName.length < 50 && !seen.has(itemName.toLowerCase())) {
        seen.add(itemName.toLowerCase());
        locations.push({
          name: itemName,
          type: 'place',
        });
      }
    }

    return locations;
  }

  /**
   * Extract and process travel content from a URL
   */
  async extractUrlContent(url: string): Promise<ExtractedContent | null> {
    console.log('[Firecrawl] Extracting content from URL:', url);

    try {
      const scrapeResult = await this.client.scrape(url, {
        formats: ['markdown', 'html'],
      });

      if (!scrapeResult) {
        console.error('[Firecrawl] Failed to scrape URL - no result returned');
        return null;
      }

      // Access content directly from the result - Firecrawl v2 response structure
      const content = scrapeResult.markdown || '';
      if (!content) {
        console.error('[Firecrawl] No markdown content found in scrape result');
        console.log('[Firecrawl] Available properties:', Object.keys(scrapeResult));
        return null;
      }

      const locations = this.extractLocations(content);

      console.log(`[Firecrawl] Extracted ${locations.length} locations from content`);

      return {
        content,
        locations,
        title: scrapeResult.metadata?.title,
        description: scrapeResult.metadata?.description,
        sourceUrl: scrapeResult.metadata?.sourceURL || url,
      };
    } catch (error) {
      console.error('[Firecrawl] Error extracting URL content:', error);
      return null;
    }
  }
}

/**
 * Format extracted content for AI processing
 */
export function formatForAI(extracted: ExtractedContent): string {
  let formatted = `Source: ${extracted.sourceUrl}\n`;

  if (extracted.title) {
    formatted += `Title: ${extracted.title}\n`;
  }

  if (extracted.description) {
    formatted += `Description: ${extracted.description}\n`;
  }

  formatted += `\nExtracted Content:\n${extracted.content}\n`;

  if (extracted.locations.length > 0) {
    formatted += `\nIdentified Locations:\n`;
    extracted.locations.forEach(loc => {
      formatted += `- ${loc.name} (${loc.type})\n`;
    });
  }

  return formatted;
}
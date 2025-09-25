import { mistral } from '@ai-sdk/mistral';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import * as cheerio from 'cheerio';

// Cache for geocoding results
const geocodeCache = new Map<string, { lat: string; lng: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Function to assign consistent color indices to geo marks
function assignColorIndicesToGeoMarks(html: string): string {
  const $ = cheerio.load(`<body>${html}</body>`);
  const geoMarks = $('.geo-mark');

  // Track existing color assignments and location keys
  const locationColorMap = new Map<string, number>();
  const existingColorIndices = new Set<number>();
  let nextColorIndex = 0;

  // First pass: collect existing color indices
  geoMarks.each((_, elem) => {
    const mark = $(elem);
    const existingIndex = mark.attr('data-color-index');
    if (existingIndex) {
      existingColorIndices.add(parseInt(existingIndex));
    }
  });

  // Second pass: assign color indices
  geoMarks.each((_, elem) => {
    const mark = $(elem);
    const existingIndex = mark.attr('data-color-index');

    // If already has a color index, preserve it
    if (existingIndex) {
      return;
    }

    // Create a unique key for this location
    const placeName = mark.attr('data-place-name') || mark.text();
    const lat = mark.attr('data-lat');
    const lng = mark.attr('data-lng');
    const locationKey = `${placeName}-${lat}-${lng}`;

    // Check if we've already assigned a color to this location
    if (locationColorMap.has(locationKey)) {
      mark.attr('data-color-index', locationColorMap.get(locationKey)!.toString());
    } else {
      // Find next available color index (cycle through 0-9)
      while (existingColorIndices.has(nextColorIndex % 10)) {
        nextColorIndex++;
        if (nextColorIndex >= 10) {
          // If all colors are taken, just use the next one in sequence
          nextColorIndex = locationColorMap.size % 10;
          break;
        }
      }

      const colorIndex = nextColorIndex % 10;
      locationColorMap.set(locationKey, colorIndex);
      existingColorIndices.add(colorIndex);
      mark.attr('data-color-index', colorIndex.toString());
      mark.attr('data-location-index', colorIndex.toString()); // For backward compatibility
      nextColorIndex++;
    }
  });

  return $('body').html() || '';
}

async function enrichCoordinates(html: string, apiKey: string): Promise<string> {
  const $ = cheerio.load(`<body>${html}</body>`);
  // Always enrich ALL geo-marks to ensure accurate coordinates from Google Places API
  const geoMarks = $('.geo-mark[data-geo="true"]');

  console.log(`[Info] Found ${geoMarks.length} geo-marks to enrich with Google Places API`);

  // Process each geo-mark to get accurate coordinates from Google Places API
  for (let i = 0; i < geoMarks.length; i++) {
    const mark = $(geoMarks[i]);
    const placeName = mark.attr('data-place-name');

    if (!placeName) continue;

    // Check cache first
    const cacheKey = placeName;
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[Cache] Using cached coordinates for: ${placeName}`);
      mark.attr('data-lat', cached.lat);
      mark.attr('data-lng', cached.lng);
      continue;
    }

    try {
      console.log(`[Places API] Searching for: ${placeName}`);

      // Build the API URL - search purely by name for accuracy
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(placeName)}&key=${apiKey}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[Places API] Error for ${placeName}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const place = data.results[0];
        const lat = place.geometry.location.lat.toString();
        const lng = place.geometry.location.lng.toString();

        console.log(`[Places API] Found coordinates for ${placeName}: ${lat}, ${lng}`);

        // Update the mark with precise coordinates
        mark.attr('data-lat', lat);
        mark.attr('data-lng', lng);

        // Cache the result
        geocodeCache.set(cacheKey, { lat, lng, timestamp: Date.now() });
      } else {
        console.warn(`[Places API] No results for: ${placeName}`);
        // Keep as PENDING if we can't find coordinates
        mark.attr('data-lat', 'PENDING');
        mark.attr('data-lng', 'PENDING');
      }

      // Add a small delay to avoid hitting rate limits
      if (i < geoMarks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`[Places API] Error enriching ${placeName}:`, error);
      // Keep as PENDING on error to avoid using unreliable coordinates
      mark.attr('data-lat', 'PENDING');
      mark.attr('data-lng', 'PENDING');
    }
  }

  return $('body').html() || html;
}

// Define the createItinerary tool
const createItinerary = tool({
  description: 'Create a detailed travel itinerary with locations and activities. Use this when the user asks for trip planning, itinerary creation, or travel suggestions.',
  parameters: z.object({
    destination: z.string().describe('The main destination or city for the trip'),
    days: z.number().min(1).max(30).describe('Number of days for the trip'),
    interests: z.array(z.string()).optional().describe('User interests like art, food, history, nature, etc.'),
    pace: z.enum(['relaxed', 'moderate', 'packed']).optional().default('moderate').describe('Travel pace preference'),
  }),
  execute: async function* ({ destination, days, interests = [], pace = 'moderate' }) {
    console.log(`[CreateItinerary] Creating ${days}-day itinerary for ${destination}`);

    // Accumulate HTML content
    let fullHtml = '';

    // Generate HTML content with proper structure
    const header = `<h1>${destination} - ${days} Day${days > 1 ? 's' : ''} Itinerary</h1>\n`;
    fullHtml += header;
    yield header;

    // Generate content for each day
    for (let day = 1; day <= days; day++) {
      const dayHeader = `<h2>Day ${day}${day === 1 ? ' - Arrival' : day === days ? ' - Departure' : ''}</h2>\n`;
      fullHtml += dayHeader;
      yield dayHeader;

      // Morning activities
      const morningHeader = `<h3>Morning</h3>\n`;
      fullHtml += morningHeader;
      yield morningHeader;

      if (day === 1) {
        const arrival = `<p>After arriving in <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="${destination}" title="📍 ${destination}">${destination}</span>, check into your hotel and get oriented with the city.</p>\n`;
        fullHtml += arrival;
        yield arrival;
      } else {
        const morning = `<p>Start your day with breakfast at a local café near your accommodation.</p>\n`;
        fullHtml += morning;
        yield morning;
      }

      // Add location-based activities based on destination
      if (destination.toLowerCase().includes('paris')) {
        if (day === 1) {
          const eiffel = `<p>Visit the iconic <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Eiffel Tower, Paris" title="📍 Eiffel Tower">Eiffel Tower</span> for stunning views of the city.</p>\n`;
          fullHtml += eiffel;
          yield eiffel;
        } else if (day === 2) {
          const louvre = `<p>Explore the world-famous <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Louvre Museum, Paris" title="📍 Louvre Museum">Louvre Museum</span> and see the Mona Lisa.</p>\n`;
          fullHtml += louvre;
          yield louvre;
        }
      } else if (destination.toLowerCase().includes('tokyo')) {
        if (day === 1) {
          const shibuya = `<p>Visit the bustling <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Shibuya Crossing, Tokyo" title="📍 Shibuya Crossing">Shibuya Crossing</span> and explore the surrounding district.</p>\n`;
          fullHtml += shibuya;
          yield shibuya;
        } else if (day === 2) {
          const temple = `<p>Experience the traditional atmosphere at <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Senso-ji Temple, Tokyo" title="📍 Senso-ji Temple">Senso-ji Temple</span> in Asakusa.</p>\n`;
          fullHtml += temple;
          yield temple;
        }
      } else if (destination.toLowerCase().includes('barcelona')) {
        if (day === 1) {
          const sagrada = `<p>Marvel at Gaudí's masterpiece, <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Sagrada Familia, Barcelona" title="📍 Sagrada Familia">Sagrada Familia</span>.</p>\n`;
          fullHtml += sagrada;
          yield sagrada;
        } else if (day === 2) {
          const park = `<p>Stroll through the whimsical <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Park Güell, Barcelona" title="📍 Park Güell">Park Güell</span> with its colorful mosaics.</p>\n`;
          fullHtml += park;
          yield park;
        }
      } else {
        // Generic activities for any destination
        const generic = `<p>Explore the historic city center and visit the main <span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="${destination} City Center" title="📍 City Center">city center</span>.</p>\n`;
        fullHtml += generic;
        yield generic;
      }

      // Afternoon activities
      const afternoonHeader = `<h3>Afternoon</h3>\n`;
      fullHtml += afternoonHeader;
      yield afternoonHeader;
      if (interests.includes('food') || interests.includes('cuisine')) {
        const lunch1 = `<p>Enjoy lunch at a recommended local restaurant, trying traditional ${destination} cuisine.</p>\n`;
        fullHtml += lunch1;
        yield lunch1;
      } else {
        const lunch2 = `<p>Have lunch at a local restaurant to experience authentic flavors.</p>\n`;
        fullHtml += lunch2;
        yield lunch2;
      }

      if (interests.includes('art') || interests.includes('museums')) {
        const activity1 = `<p>Visit one of ${destination}'s renowned art galleries or museums.</p>\n`;
        fullHtml += activity1;
        yield activity1;
      } else if (interests.includes('nature') || interests.includes('outdoors')) {
        const activity2 = `<p>Take a walk in one of ${destination}'s beautiful parks or gardens.</p>\n`;
        fullHtml += activity2;
        yield activity2;
      } else if (interests.includes('shopping')) {
        const activity3 = `<p>Explore local markets and shopping districts for unique souvenirs.</p>\n`;
        fullHtml += activity3;
        yield activity3;
      } else {
        const activity4 = `<p>Continue exploring the neighborhood, discovering hidden gems and local spots.</p>\n`;
        fullHtml += activity4;
        yield activity4;
      }

      // Evening activities
      const eveningHeader = `<h3>Evening</h3>\n`;
      fullHtml += eveningHeader;
      yield eveningHeader;
      if (day === days) {
        const dinner1 = `<p>Enjoy a farewell dinner at a special restaurant before preparing for departure.</p>\n`;
        fullHtml += dinner1;
        yield dinner1;
      } else if (pace === 'relaxed') {
        const dinner2 = `<p>Return to your hotel for some rest, then enjoy a leisurely dinner nearby.</p>\n`;
        fullHtml += dinner2;
        yield dinner2;
      } else if (pace === 'packed') {
        const dinner3 = `<p>Experience the nightlife with a sunset viewpoint visit followed by dinner and evening entertainment.</p>\n`;
        fullHtml += dinner3;
        yield dinner3;
      } else {
        const dinner4 = `<p>Watch the sunset from a scenic spot, then dine at a recommended restaurant.</p>\n`;
        fullHtml += dinner4;
        yield dinner4;
      }

      // Add tips for specific days
      if (day === 1) {
        const tip = `<p><strong>Tip:</strong> Don't overpack your first day. Allow time for jet lag and getting oriented.</p>\n`;
        fullHtml += tip;
        yield tip;
      }

      const spacer = `\n`;
      fullHtml += spacer;
      yield spacer;
    }

    // Add general tips section
    const tipsHeader = `<h2>Travel Tips</h2>\n`;
    fullHtml += tipsHeader;
    yield tipsHeader;

    const listStart = `<ul>\n`;
    fullHtml += listStart;
    yield listStart;

    const tip1 = `<li>Book accommodations in advance, especially during peak season</li>\n`;
    fullHtml += tip1;
    yield tip1;

    const tip2 = `<li>Learn a few basic phrases in the local language</li>\n`;
    fullHtml += tip2;
    yield tip2;

    const tip3 = `<li>Keep copies of important documents</li>\n`;
    fullHtml += tip3;
    yield tip3;

    if (interests.includes('photography')) {
      const photoTip = `<li>Best photo spots are usually less crowded early morning or late afternoon</li>\n`;
      fullHtml += photoTip;
      yield photoTip;
    }

    if (pace === 'packed') {
      const packedTip = `<li>Book skip-the-line tickets for major attractions to save time</li>\n`;
      fullHtml += packedTip;
      yield packedTip;
    } else if (pace === 'relaxed') {
      const relaxedTip = `<li>Don't feel pressured to see everything - quality over quantity</li>\n`;
      fullHtml += relaxedTip;
      yield relaxedTip;
    }

    const listEnd = `</ul>\n`;
    fullHtml += listEnd;
    yield listEnd;

    // Add a note about customization
    const note = `<p><em>This itinerary is a starting point - feel free to adjust based on your preferences and energy levels!</em></p>\n`;
    fullHtml += note;
    yield note;

    // Get Google Places API key from environment
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';

    // Enrich coordinates and assign colors if API key is available
    if (apiKey) {
      console.log('[CreateItinerary] Enriching coordinates...');
      const enrichedHtml = await enrichCoordinates(fullHtml, apiKey);
      const finalHtml = assignColorIndicesToGeoMarks(enrichedHtml);

      // Return the enriched HTML
      return {
        success: true,
        message: `Created ${days}-day itinerary for ${destination}`,
        html: finalHtml,
      };
    }

    // Return the non-enriched HTML if no API key
    return {
      success: true,
      message: `Created ${days}-day itinerary for ${destination}`,
      html: fullHtml,
    };
  },
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: mistral('mistral-small-latest'),
    messages,
    system: `You are a helpful travel planning assistant. You have access to a tool for creating detailed itineraries.

When users ask about:
- Trip planning, itineraries, or travel suggestions
- What to do in a city or destination
- Creating a travel plan or schedule
- Vacation ideas or recommendations

You should use the createItinerary tool to generate a detailed, formatted itinerary.

For other questions, provide helpful travel advice and information directly.

Be concise and friendly in your responses.`,
    tools: {
      createItinerary,
    },
    maxSteps: 3,
  });

  // Return response with CORS headers for cross-origin access
  return result.toDataStreamResponse({
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
import { streamObject } from 'ai';
import { z } from 'zod';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import type { Destination } from './types';

const destinationSchema = z.object({
  id: z.string(),
  name: z.string(),
  coordinates: z.tuple([z.number(), z.number()]),
  category: z.enum(['attraction', 'restaurant', 'activity', 'accommodation', 'shopping', 'nature']),
  description: z.string(),
  rating: z.number().min(0).max(5).optional(),
  priceLevel: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
  imageUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  estimatedDuration: z.string().optional(),
  address: z.string().optional(),
  openingHours: z.string().optional(),
});

const explorationDataSchema = z.object({
  city: z.string(),
  dates: z.string().optional(),
  duration: z.string().optional(),
  travelStyle: z.string().optional(),
  companions: z.string().optional(),
  destinations: z.array(destinationSchema),
});

export const explorationDocumentHandler = createDocumentHandler<'exploration'>({
  kind: 'exploration',
  onCreateDocument: async ({ title, dataStream }) => {
    // Extract context from title (e.g., "Explore Barcelona - 1 week Next month")
    const cityMatch = title.match(/Explore\s+([^-]+)/i);
    const city = cityMatch ? cityMatch[1].trim() : 'the destination';
    
    // Use AI to identify interesting places, then enrich with Google Places data
    const { partialObjectStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      schema: explorationDataSchema,
      system: `You are a travel expert helping users explore ${city}. Generate names of real, popular destinations.
      
      Include a variety of categories:
      - Famous attractions and landmarks (e.g., "Sagrada Familia", "Park Güell")
      - Highly-rated restaurants by name (e.g., "Tickets Bar", "Cal Pep")
      - Specific activities and experiences (e.g., "Flamenco Show at Tablao Cordobes")
      - Natural sites or parks (e.g., "Barceloneta Beach", "Montjuïc")
      
      For each destination:
      - Use the EXACT real name of the place
      - Provide a category (attraction, restaurant, activity, accommodation, shopping, nature)
      - Write engaging descriptions
      - Add relevant tags
      - For now, use approximate coordinates (they will be corrected via Google Places)
      
      Generate at least 15-20 real destinations in ${city}.`,
      prompt: `Create an exploration guide for ${title}. Include top attractions, restaurants, activities, and hidden gems in ${city}.`,
      mode: 'json',
    });

    // Stream each destination as it's generated
    const streamedData = {
      city,
      dates: '',
      duration: '',
      travelStyle: '',
      companions: '',
      destinations: [] as Destination[],
    };

    // Collect all AI-generated destinations first
    let aiGeneratedData: any = {};
    for await (const partialObject of partialObjectStream) {
      aiGeneratedData = partialObject;
    }

    // Now enrich each destination with real Google Places data
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://yourdomain.com' 
      : 'http://localhost:3001';

    const enrichedDestinations: Destination[] = [];
    
    if (aiGeneratedData.destinations) {
      for (const dest of aiGeneratedData.destinations) {
        if (!dest?.name || !dest?.category) continue;
        
        try {
          // Query Google Places API for real coordinates and details
          const searchQuery = `${dest.name} ${city}`;
          const response = await fetch(
            `${baseUrl}/api/places?q=${encodeURIComponent(searchQuery)}&type=geocode`
          );
          
          if (response.ok) {
            const placeData = await response.json();
            
            // Merge AI description with real place data
            const enrichedDest: Destination = {
              id: dest.id || placeData.placeId || dest.name.toLowerCase().replace(/\s+/g, '-'),
              name: dest.name,
              coordinates: placeData.coordinates || dest.coordinates || [0, 0],
              category: dest.category,
              description: dest.description || placeData.formattedAddress || '',
              rating: placeData.rating || dest.rating,
              priceLevel: dest.priceLevel,
              imageUrl: dest.imageUrl,
              tags: dest.tags || placeData.types?.slice(0, 3),
              estimatedDuration: dest.estimatedDuration,
              address: placeData.formattedAddress || dest.address,
              openingHours: dest.openingHours,
            };
            
            enrichedDestinations.push(enrichedDest);
            
            // Stream the enriched destination
            dataStream.write({
              type: 'data-textDelta',
              data: `${JSON.stringify(enrichedDest)}\n`,
              transient: true,
            });
          } else {
            // Fallback to AI-generated data if Google Places fails
            enrichedDestinations.push(dest as Destination);
            dataStream.write({
              type: 'data-textDelta',
              data: `${JSON.stringify(dest)}\n`,
              transient: true,
            });
          }
        } catch (error) {
          console.error(`Failed to enrich destination ${dest.name}:`, error);
          // Use AI-generated data as fallback
          enrichedDestinations.push(dest as Destination);
        }
      }
    }

    streamedData.destinations = enrichedDestinations;
    if (aiGeneratedData.city) streamedData.city = aiGeneratedData.city;
    if (aiGeneratedData.dates) streamedData.dates = aiGeneratedData.dates;
    if (aiGeneratedData.duration) streamedData.duration = aiGeneratedData.duration;
    if (aiGeneratedData.travelStyle) streamedData.travelStyle = aiGeneratedData.travelStyle;
    if (aiGeneratedData.companions) streamedData.companions = aiGeneratedData.companions;

    return JSON.stringify(streamedData, null, 2);
  },

  onUpdateDocument: async ({ document, description, dataStream }) => {
    // Parse existing exploration data
    let existingData: any;
    try {
      existingData = JSON.parse(document.content || '{}');
    } catch {
      existingData = { city: 'Unknown', destinations: [] };
    }

    const { partialObjectStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      schema: explorationDataSchema,
      system: `You are updating an exploration guide. The user wants to: ${description}
      
      Existing data includes ${existingData.destinations?.length || 0} destinations in ${existingData.city}.
      
      Based on the request, you should:
      - Add new destinations if requested
      - Remove destinations if asked
      - Update existing destinations with new information
      - Change categories or filters as needed
      
      Maintain the quality and detail of all destination information.`,
      prompt: description,
      mode: 'json',
    });

    let updatedData = existingData;

    for await (const partialObject of partialObjectStream) {
      if (partialObject.destinations) {
        updatedData = { ...updatedData, ...partialObject };
        
        dataStream.write({
          type: 'data-clear',
          data: null,
          transient: true,
        });
        
        dataStream.write({
          type: 'data-textDelta',
          data: JSON.stringify(updatedData, null, 2),
          transient: true,
        });
      }
    }

    return JSON.stringify(updatedData, null, 2);
  },
});
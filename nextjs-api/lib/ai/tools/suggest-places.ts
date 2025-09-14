import { tool, streamObject } from 'ai';
import { z } from 'zod';
import { myProvider } from '@/lib/ai/providers';
import { enrichPlaceWithGoogleData } from '@/lib/ai/services/place-enrichment';

// Schema for AI generation (without coordinates)
const aiPlaceSchema = z.object({
  placeName: z.string().describe('Exact name of the real place'),
  description: z.string().describe('Brief description'),
  category: z.enum(['attraction', 'restaurant', 'activity', 'accommodation', 'shopping', 'nature']),
  whyVisit: z.string().describe('Why visit this place'),
  estimatedDuration: z.string().optional(),
  tags: z.array(z.string()).optional(),
  priceLevel: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
});

const aiSuggestionsSchema = z.object({
  city: z.string(),
  places: z.array(aiPlaceSchema),
});

/**
 * Tool for suggesting places based on a natural language request
 * Generates places using AI and enriches them with Google Places data
 */
export const createSuggestPlacesTool = (dataStream?: any) => tool({
  description: 'Generate and suggest places based on user preferences',
  inputSchema: z.object({
    request: z.string().describe('Natural language description of what places to suggest'),
  }),
  execute: async ({ request }: { request: string }) => {
    console.log('[createSuggestPlacesTool] Request:', request);
    console.log('[createSuggestPlacesTool] DataStream available:', !!dataStream);
    console.log('[createSuggestPlacesTool] DataStream.write available:', !!(dataStream?.write));
    
    // Extract city from request - look for common patterns like "in Barcelona" or "to Paris"
    const cityMatch = request.match(/(?:in|to|at|visit|explore)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    const city = cityMatch ? cityMatch[1] : 'the destination';
    
    // Write initial empty state to trigger UI immediately
    if (dataStream?.write) {
      console.log('[createSuggestPlacesTool] Writing initial empty state to trigger UI');
      dataStream.write({
        type: 'data-textDelta',
        data: JSON.stringify({
          type: 'explorePlacesUpdate',
          city,
          places: [],
        }),
      });
    }
    
    // Generate places using AI
    const { partialObjectStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      schema: aiSuggestionsSchema,
      system: `You are a travel expert. Generate REAL place names that exist in ${city}.
      Focus on variety: attractions, restaurants, activities, nature spots.
      IMPORTANT: Use the COMPLETE, EXACT names of places:
      - "Casa Batlló" not just "Casa"
      - "Park Güell" not just "Park"  
      - "La Sagrada Familia" not "Sagrada Familia Cathedral"
      - "El Born Cultural Center" not just "El Born"
      Include accent marks and special characters where appropriate.`,
      prompt: request,
      mode: 'json',
    });
    
    const enrichedPlaces: any[] = [];
    let currentCity = city;
    
    for await (const partialObject of partialObjectStream) {
      try {
        // Validate the partial object has complete structure
        if (partialObject.city && partialObject.places && Array.isArray(partialObject.places)) {
          // Update city if it's complete
          if (partialObject.city.length > 1) {
            currentCity = partialObject.city;
          }
          
          // Process each place that's complete and valid
          for (let i = enrichedPlaces.length; i < partialObject.places.length; i++) {
            const place = partialObject.places[i];
            
            // Validate this place object is complete using the schema
            try {
              const validatedPlace = aiPlaceSchema.parse(place);
              
              // Skip if we already processed this place
              const alreadyProcessed = enrichedPlaces.some(
                ep => ep.placeName === validatedPlace.placeName
              );
              if (alreadyProcessed) continue;
              
              console.log(`[createSuggestPlacesTool] Processing place ${enrichedPlaces.length + 1}: ${validatedPlace.placeName}`);
              
              try {
                const enriched = await enrichPlaceWithGoogleData({
                  placeName: validatedPlace.placeName,
                  description: validatedPlace.description || '',
                  category: validatedPlace.category || 'attraction',
                  whyVisit: validatedPlace.whyVisit || '',
                  estimatedDuration: validatedPlace.estimatedDuration,
                  tags: validatedPlace.tags?.filter(Boolean) as string[] | undefined,
                  priceLevel: validatedPlace.priceLevel,
                }, currentCity);
                enrichedPlaces.push(enriched);
                
                console.log(`[createSuggestPlacesTool] Enriched ${validatedPlace.placeName}, total: ${enrichedPlaces.length}`);
                
                // Stream progress with text delta (standard AI SDK format)
                if (dataStream?.write) {
                  console.log(`[createSuggestPlacesTool] Writing progress update with ${enrichedPlaces.length} places`);
                  // Use data-textDelta which is a standard AI SDK event type
                  dataStream.write({
                    type: 'data-textDelta',
                    data: JSON.stringify({
                      type: 'explorePlacesUpdate',
                      city: currentCity,
                      places: enrichedPlaces,
                    }),
                  });
                }
              } catch (error) {
                console.error(`[createSuggestPlacesTool] Failed to enrich ${validatedPlace.placeName}:`, error);
                // Add the place without enrichment if it fails
                enrichedPlaces.push(validatedPlace);
                
                // Still stream the update even if enrichment failed
                if (dataStream?.write) {
                  dataStream.write({
                    type: 'data-textDelta',
                    data: JSON.stringify({
                      type: 'explorePlacesUpdate',
                      city: currentCity,
                      places: enrichedPlaces,
                    }),
                  });
                }
              }
            } catch (validationError) {
              // Place is not complete yet, skip it
              continue;
            }
          }
        }
      } catch (error) {
        // Partial object is not ready, continue to next
        continue;
      }
    }
    
    return {
      city: currentCity,
      places: enrichedPlaces,
    };
  },
});
import { streamObject, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { enrichPlaceWithGoogleData } from '@/lib/ai/services/place-enrichment';
import { z as zod } from 'zod';

// Schema for individual place validation
const placeSchema = zod.object({
  placeName: zod.string(),
  description: zod.string(),
  category: zod.enum(['attraction', 'restaurant', 'activity', 'accommodation', 'shopping', 'nature']),
  whyVisit: zod.string(),
  estimatedDuration: zod.string().optional(),
  tags: zod.array(zod.string()).optional(),
  priceLevel: zod.enum(['$', '$$', '$$$', '$$$$']).optional(),
});

// Schema for place generation
const placeGenerationSchema = zod.object({
  city: zod.string(),
  places: zod.array(placeSchema),
});

/**
 * Itinerary document handler using streamObject for direct JSON generation
 * Creates a workspace with places pool and empty plan
 */
export const itineraryDocumentHandlerStreamObject =
  createDocumentHandler<'itinerary'>({
    kind: 'itinerary',
    onCreateDocument: async ({ title, dataStream }) => {
      let draftJSON = '{"type":"doc","content":[]}';

      // Extract city from title
      const cityMatch = title.match(/(?:in|to|at|visit|explore)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      const city = cityMatch ? cityMatch[1] : 'the destination';
      
      // Initialize document with TipTap structure
      const initialDoc = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{
              type: 'text',
              text: `${city} Travel Guide`
            }]
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: `Discovering amazing places in ${city}...`
            }]
          }
        ],
      };
      
      // Stream initial structure AND trigger the explore places UI
      // First, send the explorePlacesUpdate to trigger the UI
      dataStream.write({
        type: 'data-textDelta',
        data: JSON.stringify({
          type: 'explorePlacesUpdate',
          city,
          places: [],
        }),
        transient: true,
      });
      
      // Generate places for the pool
      const { partialObjectStream, object } = streamObject({
        model: myProvider.languageModel('artifact-model'),
        schema: placeGenerationSchema,
        system: `You are a travel expert. Generate REAL, diverse places for ${city}.
        Focus on variety: mix of attractions, restaurants, activities, nature spots.
        IMPORTANT: Use COMPLETE, EXACT names of real places that exist.
        Include famous landmarks as well as hidden gems.
        For each place provide rich details about why it's worth visiting.`,
        prompt: `Generate 15-20 interesting places to visit in ${city} based on: ${title}`,
      });

      const enrichedPlaces: any[] = [];
      let currentCity = city;
      
      // Stream partial objects as they're generated
      for await (const partialObject of partialObjectStream) {
        try {
          if (partialObject.city && partialObject.places && Array.isArray(partialObject.places)) {
            // Update city if provided
            if (partialObject.city.length > 1) {
              currentCity = partialObject.city;
            }
            
            // Process new places
            for (let i = enrichedPlaces.length; i < partialObject.places.length; i++) {
              const place = partialObject.places[i];
              
              // Skip if undefined
              if (!place) continue;
              
              // Validate this place object is complete using the schema
              try {
                const validatedPlace = placeSchema.parse(place);
                
                // Skip if already processed
                if (enrichedPlaces.some(ep => ep.placeName === validatedPlace.placeName)) continue;
                
                console.log(`[Itinerary] Processing place ${enrichedPlaces.length + 1}: ${validatedPlace.placeName}`);
                
                try {
                  // Enrich with Google data
                  const enriched = await enrichPlaceWithGoogleData({
                    placeName: validatedPlace.placeName,
                    description: validatedPlace.description,
                    category: validatedPlace.category,
                    whyVisit: validatedPlace.whyVisit,
                    estimatedDuration: validatedPlace.estimatedDuration,
                    tags: validatedPlace.tags?.filter(Boolean) as string[] | undefined,
                    priceLevel: validatedPlace.priceLevel,
                  }, currentCity);
                
                // Add status field to enriched result
                const placeWithStatus = { ...enriched, status: 'available' };
                enrichedPlaces.push(placeWithStatus);
                
                // Update document with TipTap-formatted content
                const updatedDoc = {
                  type: 'doc',
                  content: [
                    {
                      type: 'heading',
                      attrs: { level: 1 },
                      content: [{
                        type: 'text',
                        text: `${currentCity} Travel Guide`
                      }]
                    },
                    {
                      type: 'paragraph',
                      content: [{
                        type: 'text',
                        text: `Loading ${enrichedPlaces.length} amazing places...`
                      }]
                    },
                    {
                      type: 'heading',
                      attrs: { level: 2 },
                      content: [{
                        type: 'text',
                        text: '📍 Suggested Places'
                      }]
                    },
                    {
                      type: 'bulletList',
                      content: enrichedPlaces.map((place, index) => ({
                        type: 'listItem',
                        content: [{
                          type: 'destination',
                          attrs: {
                            name: place.placeName,
                            context: currentCity,
                            coordinates: place.coordinates,
                            placeId: place.placeId,
                            colorIndex: index,
                            open: false
                          },
                          content: [{
                            type: 'paragraph',
                            content: [
                              {
                                type: 'text',
                                text: place.description || 'Loading...'
                              }
                            ]
                          }]
                        }]
                      }))
                    }
                  ],
                };
                
                draftJSON = JSON.stringify(updatedDoc);
                
                // Stream BOTH the explore places UI update and the document update
                // This makes the UI show the interactive place selection
                dataStream.write({
                  type: 'data-textDelta',
                  data: JSON.stringify({
                    type: 'explorePlacesUpdate',
                    city: currentCity,
                    places: enrichedPlaces,
                  }),
                  transient: true,
                });
              } catch (error) {
                  console.error(`[Itinerary] Failed to enrich ${validatedPlace.placeName}:`, error);
                  // Skip places that fail enrichment - don't show incomplete data
                  // Better to show fewer complete places than many broken ones
                }
              } catch (validationError) {
                // Place is not complete yet, skip it
                console.log(`[Itinerary] Skipping incomplete place (validation failed)`);
                continue;
              }
            }
          }
        } catch (error) {
          console.error('[Itinerary] Error processing partial:', error);
        }
      }

      // Get the final complete object
      await object;
      
      // Create final TipTap document with both suggested places and itinerary structure
      const finalDoc = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{
              type: 'text',
              text: `${currentCity} Travel Guide`
            }]
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: `Explore the best of ${currentCity} with this curated selection of places and experiences.`
            }]
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{
              type: 'text',
              text: '📍 Suggested Places to Visit'
            }]
          },
          {
            type: 'bulletList',
            content: enrichedPlaces.map((place, index) => ({
              type: 'listItem',
              content: [{
                type: 'destination',
                attrs: {
                  name: place.placeName,
                  context: currentCity,
                  coordinates: place.coordinates,
                  placeId: place.placeId,
                  colorIndex: index,
                  open: false
                },
                content: [{
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: place.description || place.whyVisit || 'Interesting place to visit'
                    },
                    ...(place.estimatedDuration ? [{
                      type: 'text',
                      text: ` • Duration: ${place.estimatedDuration}`
                    }] : [])
                  ]
                }]
              }]
            }))
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{
              type: 'text',
              text: '📅 Your Itinerary'
            }]
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              marks: [{ type: 'italic' }],
              text: 'Your personalized itinerary will appear here after you select your preferred places.'
            }]
          },
          // Store the places data as metadata for later use
          {
            type: 'paragraph',
            attrs: {
              class: 'hidden-metadata',
              'data-places-pool': JSON.stringify(enrichedPlaces),
              'data-city': currentCity
            },
            content: []
          }
        ],
      };
      
      const finalJSON = JSON.stringify(finalDoc);
      
      // Send final explore places update to complete the UI
      dataStream.write({
        type: 'data-textDelta',
        data: JSON.stringify({
          type: 'explorePlacesUpdate',
          city: currentCity,
          places: enrichedPlaces,
          complete: true,
        }),
        transient: true,
      });
      
      console.log(`[Itinerary] Workspace created with ${enrichedPlaces.length} places in pool`);
      return finalJSON;
    },

    onUpdateDocument: async ({ document, description, dataStream }) => {
      let draftJSON = document.content || '{"type":"doc","content":[]}';
      
      // Parse existing document to get current content
      let currentDoc: any;
      try {
        currentDoc = JSON.parse(draftJSON);
      } catch {
        // If parsing fails, create default structure
        currentDoc = {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Travel Guide' }]
            }
          ],
        };
      }
      
      // Extract city and places from metadata
      let city = 'the destination';
      let existingPlaces: any[] = [];
      
      // Look for metadata in paragraph attrs
      const metadataNode = currentDoc.content?.find((n: any) => 
        n.type === 'paragraph' && n.attrs?.['data-places-pool']
      );
      
      if (metadataNode?.attrs?.['data-places-pool']) {
        existingPlaces = JSON.parse(metadataNode.attrs['data-places-pool']);
        city = metadataNode.attrs['data-city'] || 'the destination';
      }
      
      // Check if this is a request to generate itinerary from selected places
      if (description.toLowerCase().includes('generate itinerary') && description.includes('selected:')) {
        // Parse the selected places from the description
        const selectedMatch = description.match(/selected:\s*(\[.*?\])/);
        if (selectedMatch) {
          try {
            const selectedPlaceNames = JSON.parse(selectedMatch[1]);
            const selectedPlaces = existingPlaces.filter((p: any) => 
              selectedPlaceNames.includes(p.placeName)
            );
            
            console.log(`[Itinerary] Generating itinerary for ${selectedPlaces.length} selected places`);
            
            // Generate an itinerary using the selected places
            const { textStream } = streamText({
              model: myProvider.languageModel('artifact-model'),
              system: `You are a travel expert creating a personalized itinerary.
              Create a day-by-day itinerary using ONLY the selected places.
              Format as an ordered list with clear time allocations.
              Group places logically by proximity and type.
              Include practical tips like best times to visit.`,
              prompt: `Create a ${Math.ceil(selectedPlaces.length / 3)}-day itinerary for ${city} using these selected places:
              ${selectedPlaces.map((p: any) => `- ${p.placeName}: ${p.description || p.whyVisit}`).join('\n')}`,
            });
            
            // Build the itinerary content
            let itineraryContent = '';
            for await (const chunk of textStream) {
              itineraryContent += chunk;
            }
            
            // Parse the itinerary into structured format
            const itineraryLines = itineraryContent.split('\n').filter(line => line.trim());
            const itineraryItems = itineraryLines.map(line => ({
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: line.replace(/^\d+\.\s*/, '').trim()
                }]
              }]
            }));
            
            // Create the updated document with both lists
            const updatedDoc = {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 1 },
                  content: [{
                    type: 'text',
                    text: `${city} Travel Itinerary`
                  }]
                },
                {
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: `Your personalized ${Math.ceil(selectedPlaces.length / 3)}-day itinerary featuring ${selectedPlaces.length} carefully selected places.`
                  }]
                },
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{
                    type: 'text',
                    text: '📅 Your Itinerary'
                  }]
                },
                {
                  type: 'orderedList',
                  content: itineraryItems
                },
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{
                    type: 'text',
                    text: '📍 Selected Places'
                  }]
                },
                {
                  type: 'bulletList',
                  content: selectedPlaces.map((place: any) => ({
                    type: 'listItem',
                    content: [{
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          marks: [{ type: 'bold' }],
                          text: place.placeName
                        },
                        {
                          type: 'text',
                          text: ` - ${place.description || place.whyVisit || 'Great place to visit'}`
                        }
                      ]
                    }]
                  }))
                },
                // Keep metadata for future reference
                {
                  type: 'paragraph',
                  attrs: {
                    class: 'hidden-metadata',
                    'data-places-pool': JSON.stringify(existingPlaces),
                    'data-city': city,
                    'data-selected-places': JSON.stringify(selectedPlaceNames)
                  },
                  content: []
                }
              ]
            };
            
            return JSON.stringify(updatedDoc);
          } catch (error) {
            console.error('[Itinerary] Error parsing selected places:', error);
          }
        }
      }
      
      // Check if user wants to add more places to the pool
      if (description.toLowerCase().includes('add') || description.toLowerCase().includes('more places')) {
        // Generate additional places
        const { partialObjectStream, object } = streamObject({
          model: myProvider.languageModel('artifact-model'),
          schema: placeGenerationSchema,
          system: `You are a travel expert. Generate MORE REAL places for ${city} to add to the existing pool.
          The user already has these places: ${existingPlaces.map((p: any) => p.placeName).join(', ')}
          Generate different places. Focus on variety and avoid duplicates.`,
          prompt: `${description}. Generate 5-10 additional places.`,
        });
        
        const newEnrichedPlaces: any[] = [];
        
        for await (const partialObject of partialObjectStream) {
          try {
            if (partialObject.places && Array.isArray(partialObject.places)) {
              for (let i = newEnrichedPlaces.length; i < partialObject.places.length; i++) {
                const place = partialObject.places[i];
                
                // Skip if undefined
                if (!place) continue;
                
                // Validate this place object is complete using the schema
                try {
                  const validatedPlace = placeSchema.parse(place);
                  
                  // Skip if already exists
                  if (existingPlaces.some((ep: any) => ep.placeName === validatedPlace.placeName)) continue;
                  if (newEnrichedPlaces.some(ep => ep.placeName === validatedPlace.placeName)) continue;
                  
                  try {
                    const enriched = await enrichPlaceWithGoogleData({
                      placeName: validatedPlace.placeName,
                      description: validatedPlace.description,
                      category: validatedPlace.category,
                      whyVisit: validatedPlace.whyVisit,
                      estimatedDuration: validatedPlace.estimatedDuration,
                      tags: validatedPlace.tags?.filter(Boolean) as string[] | undefined,
                      priceLevel: validatedPlace.priceLevel,
                    }, city);
                  
                  const placeWithStatus = { ...enriched, status: 'available' };
                  newEnrichedPlaces.push(placeWithStatus);
                  
                  // Update document with all places
                  const updatedDoc = {
                    ...currentDoc,
                    content: [
                      {
                        type: 'placesPool',
                        attrs: {
                          city,
                          places: [...existingPlaces, ...newEnrichedPlaces],
                        },
                      },
                      currentDoc.content?.find((n: any) => n.type === 'itineraryPlan') || 
                        { type: 'itineraryPlan', attrs: { days: [] } },
                    ],
                  };
                  
                  draftJSON = JSON.stringify(updatedDoc);
                  dataStream.write({
                    type: 'data-textDelta',
                    data: draftJSON,
                    transient: true,
                  });
                  } catch (error) {
                    console.error(`[Itinerary Update] Failed to enrich ${validatedPlace.placeName}:`, error);
                    // Skip places that fail enrichment - don't show incomplete data
                  }
                } catch (validationError) {
                  // Place is not complete yet, skip it
                  console.log(`[Itinerary Update] Skipping incomplete place (validation failed)`);
                  continue;
                }
              }
            }
          } catch (error) {
            console.error('Error processing partial:', error);
          }
        }
        
        await object;
        
        // Return final document with all places
        const finalDoc = {
          ...currentDoc,
          content: [
            {
              type: 'placesPool',
              attrs: {
                city,
                places: [...existingPlaces, ...newEnrichedPlaces],
              },
            },
            currentDoc.content?.find((n: any) => n.type === 'itineraryPlan') || 
              { type: 'itineraryPlan', attrs: { days: [] } },
          ],
        };
        
        return JSON.stringify(finalDoc);
      }
      
      // For other updates, just return the current document
      // (In the future, this could handle plan modifications)
      return draftJSON;
    },
  });


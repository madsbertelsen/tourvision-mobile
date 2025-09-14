import { auth } from '@/app/(auth)/auth';
import { getDocumentById, saveDocument } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:document').toResponse();
  }

  const { 
    documentId, 
    selectedPlaces 
  }: { 
    documentId: string; 
    selectedPlaces: string[] 
  } = await request.json();

  if (!documentId || !selectedPlaces) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameters documentId and selectedPlaces are required.',
    ).toResponse();
  }

  // Get the existing document
  const document = await getDocumentById({ id: documentId });

  if (!document) {
    return new ChatSDKError('not_found:document').toResponse();
  }

  if (document.userId !== session.user.id) {
    return new ChatSDKError('forbidden:document').toResponse();
  }

  try {
    // Parse the existing document content
    const currentDoc = JSON.parse(document.content);
    
    // Extract city and places from metadata
    let city = 'the destination';
    let allPlaces: any[] = [];
    
    const metadataNode = currentDoc.content?.find((n: any) => 
      n.type === 'paragraph' && n.attrs?.['data-places-pool']
    );
    
    if (metadataNode?.attrs?.['data-places-pool']) {
      allPlaces = JSON.parse(metadataNode.attrs['data-places-pool']);
      city = metadataNode.attrs['data-city'] || 'the destination';
    }
    
    // Filter to get only selected places
    const selectedPlaceObjects = allPlaces.filter((p: any) => 
      selectedPlaces.includes(p.placeName)
    );
    
    console.log(`[API] Generating itinerary for ${selectedPlaceObjects.length} selected places in ${city}`);
    
    // Generate the itinerary
    const { text } = await streamText({
      model: myProvider.languageModel('artifact-model'),
      system: `You are a travel expert creating a personalized day-by-day itinerary.
      Create a structured itinerary using ONLY the selected places.
      Format each day clearly with morning, afternoon, and evening activities.
      Group places logically by proximity and type.
      Include practical tips like best times to visit and travel time between places.
      Be specific about duration at each place.`,
      prompt: `Create a ${Math.ceil(selectedPlaceObjects.length / 3)}-day itinerary for ${city} using these selected places:
      ${selectedPlaceObjects.map((p: any) => `- ${p.placeName}: ${p.description || p.whyVisit}. Duration: ${p.estimatedDuration || 'flexible'}`).join('\n')}
      
      Format as:
      Day 1:
      Morning (9am-12pm): [Place name] - [brief description and tips]
      Lunch: [suggestion if relevant]
      Afternoon (2pm-5pm): [Place name] - [brief description and tips]
      Evening (6pm-9pm): [Place name or dinner suggestion]
      
      Continue for all days needed.`,
    });
    
    const itineraryText = await text;
    
    // Parse the itinerary into structured format
    const days = itineraryText.split(/Day \d+:/).filter(d => d.trim());
    const itineraryItems = days.map((day, index) => {
      const dayLines = day.trim().split('\n').filter(line => line.trim());
      return {
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              marks: [{ type: 'bold' }],
              text: `Day ${index + 1}`
            }]
          },
          {
            type: 'bulletList',
            content: dayLines.map(line => ({
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: line.trim()
                }]
              }]
            }))
          }
        ]
      };
    });
    
    // Create the updated document
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
            text: `Your personalized ${days.length}-day itinerary featuring ${selectedPlaceObjects.length} carefully selected places.`
          }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{
            type: 'text',
            text: '📅 Your Day-by-Day Itinerary'
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
            text: '📍 Your Selected Places'
          }]
        },
        {
          type: 'bulletList',
          content: selectedPlaceObjects.map((place: any, index: number) => ({
            type: 'listItem',
            content: [{
              type: 'destination',
              attrs: {
                name: place.placeName,
                context: city,
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
                    text: place.description || place.whyVisit || 'Great place to visit'
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
            text: '📝 All Available Places'
          }]
        },
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [{ type: 'italic' }],
            text: `You selected ${selectedPlaceObjects.length} out of ${allPlaces.length} suggested places.`
          }]
        },
        {
          type: 'bulletList',
          content: allPlaces.map((place: any) => ({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: selectedPlaces.includes(place.placeName) ? [{ type: 'bold' }] : [],
                  text: place.placeName
                },
                {
                  type: 'text',
                  text: selectedPlaces.includes(place.placeName) ? ' ✓' : ''
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
            'data-places-pool': JSON.stringify(allPlaces),
            'data-city': city,
            'data-selected-places': JSON.stringify(selectedPlaces)
          },
          content: []
        }
      ]
    };
    
    // Save the updated document
    const updatedDocument = await saveDocument({
      id: documentId,
      title: `${city} Travel Itinerary`,
      content: JSON.stringify(updatedDoc),
      kind: 'itinerary',
      userId: session.user.id,
    });
    
    return Response.json({ 
      success: true, 
      document: updatedDocument 
    }, { status: 200 });
    
  } catch (error) {
    console.error('[API] Error generating itinerary:', error);
    return new ChatSDKError(
      'internal:api',
      'Failed to generate itinerary',
    ).toResponse();
  }
}
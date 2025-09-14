import { smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { LocationStreamProcessorHTMLToJSON } from './location-stream-processor-html-to-json';

export const itineraryDocumentHandlerJSON = createDocumentHandler<'itinerary'>({
  kind: 'itinerary',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftJSON = '{"type":"doc","content":[]}';
    const processor = new LocationStreamProcessorHTMLToJSON();

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: `Create a detailed travel itinerary. Generate clean HTML using custom semantic elements for destinations.

USE THIS CUSTOM ELEMENT FOR DESTINATIONS:
<destination>
  <summary>Destination Name</summary>
  <location>
    <geometry type="point"/>
    <context>City, Country</context>
  </location>
  <details>Description, opening hours, tips...</details>
</destination>

EXAMPLE:
<destination>
  <summary>Tivoli Gardens</summary>
  <location>
    <geometry type="point"/>
    <context>Copenhagen, Denmark</context>
  </location>
  <details>One of the world's oldest amusement parks, dating back to 1843. Open 11am-11pm during summer. Buy tickets online to skip queues. Features beautiful gardens, rides for all ages, and evening light shows.</details>
</destination>

GUIDELINES:
- Use <destination> for ALL places/attractions/restaurants
- Keep summary concise (just the destination name, NO LINKS)
- NEVER put links or <a> tags in the summary - just plain text
- Put detailed information in the <details> element
- Use semantic HTML5 elements (header, section, article, nav) for other content
- Add proper headings (h1, h2, h3) for hierarchy
- Include practical details (hours, prices, tips)
- Make content scannable with lists where appropriate
- NO MARKDOWN - output valid HTML only
- Output raw HTML tags directly - DO NOT escape HTML entities
- Use actual < and > characters, not &lt; or &gt;
- Do not include <html>, <head>, or <body> tags - just the content HTML`,
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: title,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { text } = delta;
        
        // Debug log to see what the AI is generating
        if (text.includes('Tivoli') || text.includes('Nyhavn') || text.includes('location')) {
          console.log('[ItineraryHandlerJSON] AI generated text with location:', text);
        }

        // Process the chunk through our JSON location enricher
        const { json: processedJSON, complete } = await processor.processChunk(text);
        
        // Update draft JSON
        draftJSON = processedJSON;

        // Stream the enriched JSON to the client
        dataStream.write({
          type: 'data-textDelta',
          data: processedJSON,
          transient: true,
        });
      }
    }

    // Flush any remaining buffered content and get final JSON
    const finalJSON = await processor.flush();
    draftJSON = finalJSON;

    console.log('Streaming complete with real-time enrichment');
    return finalJSON; // Return JSON string
  },

  onUpdateDocument: async ({ title, dataStream, document, currentContent, messages }) => {
    let updatedJSON = '{"type":"doc","content":[]}';
    const processor = new LocationStreamProcessorHTMLToJSON();
    processor.reset(); // Reset for new update

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: `Update the travel itinerary based on the user's request. Generate clean HTML using custom semantic elements for destinations.

USE THIS CUSTOM ELEMENT FOR DESTINATIONS:
<destination>
  <summary>Destination Name</summary>
  <location>
    <geometry type="point"/>
    <context>City, Country</context>
  </location>
  <details>Description, opening hours, tips...</details>
</destination>

EXAMPLE:
<destination>
  <summary>Tivoli Gardens</summary>
  <location>
    <geometry type="point"/>
    <context>Copenhagen, Denmark</context>
  </location>
  <details>One of the world's oldest amusement parks, dating back to 1843. Open 11am-11pm during summer. Buy tickets online to skip queues. Features beautiful gardens, rides for all ages, and evening light shows.</details>
</destination>

GUIDELINES:
- Use <destination> for ALL places/attractions/restaurants
- Keep summary concise (just the destination name, NO LINKS)
- NEVER put links or <a> tags in the summary - just plain text
- Put detailed information in the <details> element
- Use semantic HTML5 elements (header, section, article, nav)
- Add proper headings (h1, h2, h3) for hierarchy
- Include practical details (hours, prices, tips)
- Make content scannable with lists where appropriate
- NO MARKDOWN - output valid HTML only
- Output raw HTML tags directly - DO NOT escape HTML entities
- Use actual < and > characters, not &lt; or &gt;`,
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: `Current itinerary title: "${title}"\n\n---\n\nUser request:\n${messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}`,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { text } = delta;
        
        // Process the chunk through our JSON location enricher
        const { json: processedJSON } = await processor.processChunk(text);
        
        // Update draft JSON
        updatedJSON = processedJSON;

        // Stream the enriched JSON to the client
        dataStream.write({
          type: 'data-textDelta',
          data: processedJSON,
          transient: true,
        });
      }
    }

    // Flush any remaining buffered content and get final JSON
    const finalJSON = await processor.flush();
    updatedJSON = finalJSON;

    console.log('Update streaming complete with real-time enrichment');
    return finalJSON; // Return JSON string
  },

  onDuplicateDocument: async ({ document, dataStream }) => {
    // Simply return the JSON content as-is when duplicating
    console.log(`Duplicating itinerary document ${document.id}`);
    return document.content;
  },

  onRequestDocumentSuggestions: async ({ document, dataStream }) => {
    const { fullStream } = streamText({
      model: myProvider.languageModel('suggestion-model'),
      system:
        'Provide 2-3 short, specific suggestions for improving the travel itinerary. Each suggestion should be a one-liner that addresses a specific aspect like adding activities, improving logistics, including local tips, or enhancing cultural experiences. Format as a JSON array of strings. Be concise and actionable.',
      prompt: `Analyze this itinerary and suggest improvements:\n\n${document.title}\n\nCurrent content structure: ${document.content.substring(0, 500)}...`,
    });

    let suggestions = '';
    for await (const delta of fullStream) {
      const { type } = delta;
      if (type === 'text-delta') {
        suggestions += delta.text;
      }
    }

    // Parse and send suggestions
    try {
      const parsed = JSON.parse(suggestions);
      if (Array.isArray(parsed)) {
        for (const suggestion of parsed) {
          dataStream.write({
            type: 'data-suggestion',
            data: {
              id: Math.random().toString(36).substr(2, 9),
              description: suggestion,
              originalText: '',
              suggestedText: '',
            },
          });
        }
      }
    } catch (error) {
      console.error('Failed to parse suggestions:', error);
      // Send a default suggestion on error
      dataStream.write({
        type: 'data-suggestion',
        data: {
          id: Math.random().toString(36).substr(2, 9),
          description: 'Consider adding more local restaurant recommendations',
          originalText: '',
          suggestedText: '',
        },
      });
    }
  },
});

// Helper function for post-processing enrichment if needed
export async function enrichItineraryDocument(documentId: string, content: string): Promise<string> {
  console.log(`Enriching itinerary document ${documentId}`);
  
  // For JSON format, content should already be enriched
  // This is just a placeholder for any additional processing
  try {
    const doc = JSON.parse(content);
    if (doc.type === 'doc') {
      return content; // Already valid JSON
    }
  } catch {
    console.error('Invalid JSON content for itinerary document');
  }
  
  return content;
}
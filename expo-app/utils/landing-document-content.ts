/**
 * Landing page document content that will be animated/typed out
 * This represents a ProseMirror document structure
 */

export const LANDING_DOCUMENT_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Plan your next trip to ' },
        {
          type: 'geoMark',
          attrs: {
            geoId: 'landing-paris',
            placeName: 'Paris, France',
            lat: 48.8566,
            lng: 2.3522,
            colorIndex: 0,
            coordSource: 'manual',
            description: 'The City of Light',
            visitDocument: null,
            transportFrom: null,
            transportProfile: null,
            waypoints: null,
            photoName: null
          },
          content: [
            { type: 'text', text: 'Paris' }
          ]
        },
        { type: 'text', text: ' with TourVision!' }
      ]
    }
  ]
};

/* FULL CONTENT - COMMENTED OUT FOR DEBUGGING
export const LANDING_DOCUMENT_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [
        { type: 'text', text: 'Create Stunning Travel Presentations' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Transform your journeys into immersive stories. Plan, collaborate, and share beautiful travel presentations with the world.' }
      ]
    },
    {
      type: 'paragraph',
      content: []
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [
        { type: 'text', text: '✨ How It Works' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '1. ', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'Explore & Plan', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' - Add destinations like ' },
        {
          type: 'geoMark',
          attrs: {
            geoId: 'landing-paris',
            placeName: 'Paris, France',
            lat: 48.8566,
            lng: 2.3522,
            colorIndex: 0,
            coordSource: 'manual',
            description: 'The City of Light',
            visitDocument: null,
            transportFrom: null,
            transportProfile: null,
            waypoints: null,
            photoName: null
          },
          content: [
            { type: 'text', text: 'Paris' }
          ]
        },
        { type: 'text', text: ', ' },
        {
          type: 'geoMark',
          attrs: {
            geoId: 'landing-tokyo',
            placeName: 'Tokyo, Japan',
            lat: 35.6762,
            lng: 139.6503,
            colorIndex: 1,
            coordSource: 'manual',
            description: 'Modern metropolis',
            visitDocument: null,
            transportFrom: null,
            transportProfile: null,
            waypoints: null,
            photoName: null
          },
          content: [
            { type: 'text', text: 'Tokyo' }
          ]
        },
        { type: 'text', text: ', or ' },
        {
          type: 'geoMark',
          attrs: {
            geoId: 'landing-nyc',
            placeName: 'New York City, USA',
            lat: 40.7128,
            lng: -74.0060,
            colorIndex: 2,
            coordSource: 'manual',
            description: 'The Big Apple',
            visitDocument: null,
            transportFrom: null,
            transportProfile: null,
            waypoints: null,
            photoName: null
          },
          content: [
            { type: 'text', text: 'New York' }
          ]
        },
        { type: 'text', text: ' with our AI-powered suggestions.' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '2. ', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'Create Your Story', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' - Add rich media, notes, and craft a compelling narrative for your journey.' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '3. ', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'Present & Share', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' - Transform your trip into an immersive video presentation or embed it anywhere.' }
      ]
    },
    {
      type: 'paragraph',
      content: []
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [
        { type: 'text', text: '🚀 Powerful Features' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '• Immersive Presentations', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' - Transform trips into cinematic video experiences' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '• AI-Powered Planning', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' - Get smart suggestions and auto-generated itineraries' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '• Real-time Collaboration', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' - Plan together with friends and family' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '• Public Sharing', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' - Share presentations or embed them on your website' }
      ]
    },
    {
      type: 'paragraph',
      content: []
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '👉 Try editing this document yourself! ', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'Click anywhere to add your own destinations, format text, or create your first travel story.' }
      ]
    }
  ]
};
*/

/**
 * Flatten document to get plain text for typing animation
 * Returns array of characters with metadata about formatting
 */
export interface TypedCharacter {
  char: string;
  nodeType: string;
  marks: string[];
  isNodeStart?: boolean;
  isNodeEnd?: boolean;
  nodeAttrs?: any;
}

export function flattenDocumentForTyping(doc: any): TypedCharacter[] {
  const characters: TypedCharacter[] = [];

  function traverse(node: any, marks: string[] = []) {
    if (node.type === 'text') {
      const nodeMark = node.marks || [];
      const markTypes = nodeMark.map((m: any) => m.type);
      const allMarks = [...marks, ...markTypes];

      for (const char of node.text) {
        characters.push({
          char,
          nodeType: 'text',
          marks: allMarks
        });
      }
    } else if (node.type === 'geoMark') {
      // Handle geo-mark as a special node
      characters.push({
        char: '', // Geo-marks are inserted as nodes, not characters
        nodeType: 'geoMark',
        marks,
        isNodeStart: true,
        nodeAttrs: node.attrs
      });

      // Process text content inside geo-mark
      if (node.content) {
        node.content.forEach((child: any) => traverse(child, marks));
      }

      characters.push({
        char: '',
        nodeType: 'geoMark',
        marks,
        isNodeEnd: true
      });
    } else {
      // Block nodes like paragraphs and headings
      if (node.content) {
        // Add newlines for block boundaries (except first node)
        if (characters.length > 0 &&
            (node.type === 'paragraph' || node.type === 'heading')) {
          characters.push({
            char: '\n',
            nodeType: node.type,
            marks,
            isNodeStart: true,
            nodeAttrs: node.attrs
          });
        }

        node.content.forEach((child: any) => traverse(child, marks));
      }
    }
  }

  traverse(doc);
  return characters;
}

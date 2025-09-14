import { z } from 'zod';
import { getMarkerColor } from './marker-colors';

/**
 * Zod schema for TipTap itinerary JSON structure
 * This schema defines the structure that the LLM should generate
 */

// Base mark types (text formatting)
const markSchema = z.object({
  type: z.enum(['bold', 'italic', 'code', 'strike', 'link']),
  attrs: z.record(z.any()).optional(),
});

// Text node with optional marks
const textNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  marks: z.array(markSchema).optional(),
});

// Forward declaration for recursive node structure
const nodeSchema: z.ZodType<any> = z.lazy(() => 
  z.discriminatedUnion('type', [
    textNodeSchema,
    paragraphNodeSchema,
    headingNodeSchema,
    bulletListNodeSchema,
    orderedListNodeSchema,
    listItemNodeSchema,
    hardBreakNodeSchema,
    detailsNodeSchema,
    detailsSummaryNodeSchema,
    detailsContentNodeSchema,
  ])
);

// Paragraph node
const paragraphNodeSchema = z.object({
  type: z.literal('paragraph'),
  content: z.array(nodeSchema).optional(),
});

// Heading node
const headingNodeSchema = z.object({
  type: z.literal('heading'),
  attrs: z.object({
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  }),
  content: z.array(nodeSchema).optional(),
});

// List nodes
const bulletListNodeSchema = z.object({
  type: z.literal('bulletList'),
  content: z.array(z.lazy(() => listItemNodeSchema)).optional(),
});

const orderedListNodeSchema = z.object({
  type: z.literal('orderedList'),
  attrs: z.object({
    start: z.number().optional(),
  }).optional(),
  content: z.array(z.lazy(() => listItemNodeSchema)).optional(),
});

const listItemNodeSchema = z.object({
  type: z.literal('listItem'),
  content: z.array(nodeSchema).optional(),
});

// Hard break (line break)
const hardBreakNodeSchema = z.object({
  type: z.literal('hardBreak'),
});

// Details nodes (for destinations)
const detailsNodeSchema = z.object({
  type: z.literal('details'),
  attrs: z.object({
    class: z.string().optional(),
    'data-destination': z.string().optional(), // JSON string of destination data
    'data-color-index': z.number().optional(),
    'data-color': z.string().optional(),
    style: z.string().optional(),
    open: z.boolean().optional(),
  }).optional(),
  content: z.array(nodeSchema).optional(),
});

const detailsSummaryNodeSchema = z.object({
  type: z.literal('detailsSummary'),
  content: z.array(nodeSchema).optional(),
});

const detailsContentNodeSchema = z.object({
  type: z.literal('detailsContent'),
  content: z.array(nodeSchema).optional(),
});

// Root document schema
export const itineraryDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(nodeSchema).describe('The content nodes of the document'),
});

// Simplified destination structure for easier LLM generation
export const destinationSchema = z.object({
  name: z.string().describe('The name of the destination (e.g., "Tivoli Gardens")'),
  context: z.string().describe('The city and country (e.g., "Copenhagen, Denmark")'),
  description: z.string().describe('Detailed description including hours, tips, etc.'),
  colorIndex: z.number().optional().describe('Color index for visual styling'),
});

// Schema for a day in the itinerary
export const itineraryDaySchema = z.object({
  dayNumber: z.number().describe('Day number (e.g., 1, 2, 3)'),
  title: z.string().describe('Day title (e.g., "Exploring Copenhagen")'),
  sections: z.array(z.object({
    title: z.string().describe('Section title (e.g., "Morning", "Afternoon")'),
    destinations: z.array(destinationSchema),
    notes: z.string().optional().describe('Additional notes or tips for this section'),
  })),
});

// High-level itinerary structure (for easier generation)
export const itinerarySchema = z.object({
  title: z.string().describe('The title of the itinerary'),
  days: z.array(itineraryDaySchema).describe('Array of days in the itinerary'),
});

// Helper function to convert simplified structure to TipTap JSON
// Handles partial objects during streaming (accepts any partial structure)
export function convertToTipTapJSON(itinerary: any): z.infer<typeof itineraryDocumentSchema> {
  const content: any[] = [];
  
  // Add title
  if (itinerary.title) {
    content.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: itinerary.title }],
    });
  }
  
  // Add days (safely handle undefined/partial arrays)
  if (itinerary.days && Array.isArray(itinerary.days)) {
    itinerary.days.forEach((day, dayIndex) => {
      if (!day) return; // Skip undefined days
      
      // Day heading
      if (day.dayNumber && day.title) {
        content.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: `Day ${day.dayNumber}: ${day.title}` }],
        });
      } else if (day.dayNumber) {
        content.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: `Day ${day.dayNumber}` }],
        });
      }
      
      // Sections (safely handle undefined/partial sections)
      if (day.sections && Array.isArray(day.sections)) {
        day.sections.forEach(section => {
          if (!section) return; // Skip undefined sections
          
          // Section heading
          if (section.title) {
            content.push({
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: section.title }],
            });
          }
          
          // Destinations (safely handle undefined/partial destinations)
          if (section.destinations && Array.isArray(section.destinations)) {
            section.destinations.forEach((destination, destIndex) => {
              if (!destination || !destination.name) return; // Skip invalid destinations
              
              const colorIndex = destination.colorIndex ?? (dayIndex * 10 + destIndex);
              // Get color from marker colors
              const color = getMarkerColor(colorIndex);
              
              // Use custom destination node type
              content.push({
                type: 'destination',
                attrs: {
                  name: destination.name,
                  context: destination.context || '',
                  geometry: { type: 'point' },
                  colorIndex: colorIndex,
                  color: color,
                  open: false, // Default to collapsed
                },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: destination.description || 'Loading details...' }],
                  },
                ],
              });
            });
          }
          
          // Section notes
          if (section.notes) {
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: section.notes }],
            });
          }
        });
      }
    });
  }
  
  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
  };
}
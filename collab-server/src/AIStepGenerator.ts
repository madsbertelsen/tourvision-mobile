import { CollaborationManager } from './CollaborationManager.js';
import { Schema, DOMParser } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { ReplaceStep } from 'prosemirror-transform';
import { JSDOM } from 'jsdom';

// Step generation options
export interface StepGenerationOptions {
  position?: number;
  replaceRange?: { from: number; to: number };
  isStreaming?: boolean;
  isFinal?: boolean;
}

/**
 * AIStepGenerator - Converts AI-generated content to ProseMirror steps
 * This class handles the transformation of AI output (text/HTML) into
 * valid ProseMirror steps that can be applied through the OT system.
 */
export class AIStepGenerator {
  private collabManager: CollaborationManager;
  private schema: Schema;

  constructor(collabManager: CollaborationManager) {
    this.collabManager = collabManager;

    // Create schema matching the client's schema
    // This MUST match the schema used in the WebView's ProseMirror instance
    const baseNodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');

    // Add geoMark node to match client schema
    const nodes = baseNodes.addToEnd('geoMark', {
      inline: true,
      group: 'inline',
      content: 'text*',
      attrs: {
        geoId: { default: null },
        placeName: { default: '' },
        lat: { default: '' },
        lng: { default: '' },
        colorIndex: { default: 0 },
        coordSource: { default: 'manual' },
        description: { default: null },
        transportFrom: { default: null },
        transportProfile: { default: null },
        waypoints: { default: null },
        visitDocument: { default: null },
        photoName: { default: null }
      }
    });

    // Add comment mark to match client schema
    const marks = basicSchema.spec.marks.addToEnd('comment', {
      attrs: {
        commentId: { default: null },
        userId: { default: null },
        userName: { default: '' },
        content: { default: '' },
        createdAt: { default: null },
        resolved: { default: false },
        replies: { default: null }
      },
      inclusive: false
    });

    const mySchema = new Schema({
      nodes: nodes,
      marks: marks
    });

    this.schema = mySchema;
  }

  /**
   * Generate ProseMirror steps for AI-generated content
   * @param documentId - The document to generate steps for
   * @param content - The AI-generated content (text or HTML)
   * @param options - Options for step generation
   * @returns Array of ProseMirror steps
   */
  async generateStepsForContent(
    documentId: string,
    content: string,
    options: StepGenerationOptions = {}
  ): Promise<any[]> {
    const steps: any[] = [];

    try {
      // Get current document state
      const docState = this.collabManager.getDocument(documentId);
      if (!docState) {
        throw new Error('Document not found');
      }

      // For now, create a simple text insertion step
      // This is a simplified version - in production you'd want full ProseMirror integration
      const step = this.createSimpleTextStep(content, options);
      if (step) {
        steps.push(step);
      }

      return steps;
    } catch (error) {
      console.error('Error generating steps:', error);
      return [];
    }
  }

  /**
   * Create a proper ProseMirror step by parsing HTML content
   * This uses ProseMirror's DOMParser to convert HTML to document structure
   */
  private createSimpleTextStep(content: string, options: StepGenerationOptions): any {
    try {
      console.log('[AIStepGenerator] Creating step from content:', content.substring(0, 100));

      // For now, wrap plain text in a simple HTML structure
      const htmlContent = `<p>${content}</p>`;

      console.log('[AIStepGenerator] HTML content:', htmlContent);

      // Parse HTML using JSDOM and ProseMirror's DOMParser
      const dom = new JSDOM(htmlContent);
      const parser = DOMParser.fromSchema(this.schema);
      const parsedDoc = parser.parse(dom.window.document.body);

      console.log('[AIStepGenerator] Parsed document:', JSON.stringify(parsedDoc.toJSON(), null, 2));

      // Create a slice from the parsed document
      const slice = parsedDoc.slice(0, parsedDoc.content.size);

      // Replace the entire document content
      // For an empty document with one paragraph, this is from 0 to 2
      const from = options.replaceRange?.from ?? 0;
      const to = options.replaceRange?.to ?? 2;

      console.log(`[AIStepGenerator] Creating ReplaceStep from ${from} to ${to}`);

      // Create the ReplaceStep
      const step = new ReplaceStep(from, to, slice);
      const stepJSON = step.toJSON();

      console.log('[AIStepGenerator] Step JSON:', JSON.stringify(stepJSON, null, 2));

      return stepJSON;
    } catch (error) {
      console.error('[AIStepGenerator] Error creating step:', error);
      return null;
    }
  }

  /**
   * Parse content into block structure
   * Converts plain text or simple HTML into block nodes
   */
  private parseContentToBlocks(content: string): any[] {
    const blocks: any[] = [];

    // Remove HTML tags for now and just handle text
    const plainText = content
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .trim();

    if (!plainText) {
      return blocks;
    }

    // Split into paragraphs by double newlines
    const paragraphs = plainText.split(/\n\n+/);

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (trimmedPara) {
        // Split lines within paragraph
        const lines = trimmedPara.split('\n');

        // Process each line
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Check if it's a heading (starts with **)
          if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
            const headingText = trimmedLine.slice(2, -2).trim();
            // Determine heading level based on content
            let headingLevel = 2; // Default to h2
            if (headingText.includes('Day')) {
              headingLevel = 3;
            } else if (headingText.includes('Weekend') || headingText.includes('Trip')) {
              headingLevel = 1;
            }

            blocks.push({
              type: 'heading',
              attrs: { level: headingLevel },
              content: [
                {
                  type: 'text',
                  text: headingText
                }
              ]
            });
          } else {
            // Regular paragraph - remove markdown bold markers
            let processedText = trimmedLine
              .replace(/\*\*(.*?)\*\*/g, '$1') // Remove ** markers
              .replace(/^- /, '• '); // Convert markdown lists to bullet points

            blocks.push({
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: processedText
                }
              ]
            });
          }
        }
      }
    }

    // If no blocks were created, create at least one with the content
    if (blocks.length === 0 && plainText) {
      blocks.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: plainText
          }
        ]
      });
    }

    return blocks;
  }

  /**
   * Convert steps to JSON for transmission
   */
  static stepsToJSON(steps: any[]): any[] {
    // Steps are already in JSON format
    return steps;
  }

  /**
   * Create steps from JSON
   */
  static stepsFromJSON(schema: any, stepsJSON: any[]): any[] {
    // Return steps as-is since we're using simplified format
    return stepsJSON;
  }
}
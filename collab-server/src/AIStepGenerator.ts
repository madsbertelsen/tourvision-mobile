import { CollaborationManager } from './CollaborationManager.js';
import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { ReplaceStep } from 'prosemirror-transform';

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
   * Create a proper ProseMirror text insertion step
   * This creates a real ReplaceStep that can be applied to a ProseMirror document
   */
  private createSimpleTextStep(content: string, options: StepGenerationOptions): any {
    try {
      // Parse content into ProseMirror nodes
      const blocks = this.parseContentToBlocks(content);

      // Create a proper ProseMirror fragment
      const fragment = this.schema.nodeFromJSON({
        type: 'doc',
        content: blocks
      }).content;

      // Create a slice from the fragment
      const slice = fragment.slice(0);

      // Create a proper ReplaceStep
      const from = options.replaceRange?.from ?? 1; // Default to position 1 (after doc start)
      const to = options.replaceRange?.to ?? from;

      const step = new ReplaceStep(from, to, slice);

      // Return the JSON representation that can be sent over the wire
      return step.toJSON();
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

    // Split into paragraphs
    const paragraphs = plainText.split(/\n\n+/);

    for (const para of paragraphs) {
      if (para.trim()) {
        // Create a paragraph node with text
        blocks.push({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: para.trim()
            }
          ]
        });
      }
    }

    // If no paragraphs were created, create at least one with the content
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
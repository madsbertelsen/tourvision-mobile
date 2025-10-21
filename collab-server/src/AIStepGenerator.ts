import { CollaborationManager } from './CollaborationManager.js';

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

  constructor(collabManager: CollaborationManager) {
    this.collabManager = collabManager;
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
   * Create a simple text insertion step
   * This creates a basic step structure that can be applied to a ProseMirror document
   */
  private createSimpleTextStep(content: string, options: StepGenerationOptions): any {
    // Parse content to extract structure
    const blocks = this.parseContentToBlocks(content);

    // Create a replace step that inserts the content
    // Using a simplified step format that the client can interpret
    const step = {
      stepType: 'replace',
      from: options.replaceRange?.from ?? 1, // Default to position 1 (after doc start)
      to: options.replaceRange?.to ?? 1,
      slice: {
        content: blocks,
        openStart: 0,
        openEnd: 0
      }
    };

    return step;
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
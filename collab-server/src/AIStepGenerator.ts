import { JSDOM } from 'jsdom';
import { DOMParser } from 'prosemirror-model';
import { Step, ReplaceStep, ReplaceAroundStep } from 'prosemirror-transform';
import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
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
  private schema: Schema;
  private domParser: DOMParser;

  constructor(collabManager: CollaborationManager) {
    this.collabManager = collabManager;

    // Initialize ProseMirror schema with list nodes
    this.schema = new Schema({
      nodes: addListNodes(basicSchema.spec.nodes as any, "paragraph block*", "block"),
      marks: basicSchema.spec.marks
    });

    // Create DOM parser for HTML content
    const dom = new JSDOM();
    const document = dom.window.document;
    this.domParser = DOMParser.fromSchema(this.schema);
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
  ): Promise<Step[]> {
    const steps: Step[] = [];

    try {
      // Get current document state
      const docState = this.collabManager.getDocument(documentId);
      if (!docState) {
        throw new Error('Document not found');
      }

      // Parse content based on type (HTML vs plain text)
      const fragment = this.parseContent(content);

      // Determine position for insertion
      const position = this.determinePosition(docState, options);

      // Create appropriate step based on options
      if (options.replaceRange) {
        // Create replace step for inline edits
        const replaceStep = this.createReplaceStep(
          options.replaceRange.from,
          options.replaceRange.to,
          fragment
        );
        steps.push(replaceStep);
      } else {
        // Create insert step for appending content
        const insertStep = this.createInsertStep(position, fragment);
        steps.push(insertStep);
      }

      // Add formatting steps if needed (for streaming)
      if (options.isStreaming && !options.isFinal) {
        // Add a temporary marker for streaming indication
        const markerStep = this.createStreamingMarker(position);
        if (markerStep) {
          steps.push(markerStep);
        }
      }

      return steps;
    } catch (error) {
      console.error('Error generating steps:', error);
      return [];
    }
  }

  /**
   * Parse content into ProseMirror fragment
   */
  private parseContent(content: string): any {
    // Check if content is HTML
    if (content.includes('<') && content.includes('>')) {
      return this.parseHTML(content);
    }

    // Parse as plain text
    return this.parsePlainText(content);
  }

  /**
   * Parse HTML content into ProseMirror fragment
   */
  private parseHTML(html: string): any {
    try {
      // Create a DOM element with the HTML
      const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
      const element = dom.window.document.body;

      // Parse using ProseMirror's DOMParser
      return this.domParser.parse(element);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      // Fallback to plain text
      return this.parsePlainText(html);
    }
  }

  /**
   * Parse plain text into ProseMirror fragment
   */
  private parsePlainText(text: string): any {
    // Split text into paragraphs
    const paragraphs = text.split('\n\n').filter(p => p.trim());

    // Create paragraph nodes
    const nodes = paragraphs.map(para => {
      // Handle special formatting (headers, lists, etc.)
      if (para.startsWith('# ')) {
        return this.schema.nodes.heading.create(
          { level: 1 },
          this.schema.text(para.substring(2))
        );
      } else if (para.startsWith('## ')) {
        return this.schema.nodes.heading.create(
          { level: 2 },
          this.schema.text(para.substring(3))
        );
      } else if (para.startsWith('- ') || para.startsWith('* ')) {
        // Create list item
        return this.schema.nodes.bullet_list.create(null, [
          this.schema.nodes.list_item.create(null, [
            this.schema.nodes.paragraph.create(null,
              this.schema.text(para.substring(2))
            )
          ])
        ]);
      } else {
        // Regular paragraph
        return this.schema.nodes.paragraph.create(null,
          this.schema.text(para)
        );
      }
    });

    // Create fragment from nodes
    return this.schema.nodes.doc.create(null, nodes);
  }

  /**
   * Determine the position for content insertion
   */
  private determinePosition(docState: any, options: StepGenerationOptions): number {
    if (options.position !== undefined) {
      return options.position;
    }

    // Default to end of document
    // In a real implementation, we would parse the doc and find the actual end position
    return docState.doc.content.size || 1;
  }

  /**
   * Create a replace step
   */
  private createReplaceStep(from: number, to: number, fragment: any): Step {
    // Create a ReplaceStep
    // In a real implementation, this would properly construct the step
    return new ReplaceStep(from, to, fragment.content.size ? fragment : fragment);
  }

  /**
   * Create an insert step
   */
  private createInsertStep(position: number, fragment: any): Step {
    // Create an insert step (ReplaceStep with from === to)
    return new ReplaceStep(position, position, fragment);
  }

  /**
   * Create a streaming marker step (for visual feedback)
   */
  private createStreamingMarker(position: number): Step | null {
    try {
      // Add a temporary decoration or marker
      // This is optional and helps with UX during streaming
      const marker = this.schema.text('█', [
        this.schema.marks.code.create()
      ]);
      // Create a slice from the node
      const slice = (this.schema.nodes.doc.create(null, marker) as any).slice(0);
      return new ReplaceStep(position, position, slice);
    } catch (error) {
      // Markers are optional, so we can safely ignore errors
      return null;
    }
  }

  /**
   * Convert steps to JSON for transmission
   */
  static stepsToJSON(steps: Step[]): any[] {
    return steps.map(step => step.toJSON());
  }

  /**
   * Create steps from JSON
   */
  static stepsFromJSON(schema: Schema, stepsJSON: any[]): Step[] {
    return stepsJSON.map(json => Step.fromJSON(schema, json));
  }
}
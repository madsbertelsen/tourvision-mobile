import { CollaborationManager } from './CollaborationManager.js';
import { Schema, DOMParser, Fragment, Slice } from 'prosemirror-model';
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
        replies: { default: null },
        aiReply: { default: null } // AI-generated replacement document (ProseMirror doc JSON)
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
   * Get the schema instance
   * Used by AIUserService to create EditorState for position tracking
   */
  getSchema(): Schema {
    return this.schema;
  }

  /**
   * Generate ProseMirror steps for AI-generated content
   * @param documentId - The document to generate steps for
   * @param content - The AI-generated content (HTML)
   * @param options - Options for step generation
   * @returns Array of ProseMirror steps (validated on server)
   */
  async generateStepsForContent(
    documentId: string,
    content: string,
    options: StepGenerationOptions = {}
  ): Promise<any[]> {
    try {
      // Get current document state
      const docState = this.collabManager.getDocument(documentId);
      if (!docState) {
        throw new Error('Document not found');
      }

      console.log(`[AIStepGenerator] Generating steps for content (${content.length} chars)`);

      // Create multiple steps from HTML content
      const steps = this.createStepsFromHTML(content, options);
      if (!steps || steps.length === 0) {
        console.error('[AIStepGenerator] Failed to create steps');
        return [];
      }

      console.log(`[AIStepGenerator] Generated ${steps.length} steps`);

      // Validate all steps by applying them sequentially
      const isValid = this.validateSteps(steps);
      if (!isValid) {
        console.error('[AIStepGenerator] Steps validation failed');
        return [];
      }

      console.log('[AIStepGenerator] All steps validated successfully');

      return steps;
    } catch (error) {
      console.error('[AIStepGenerator] Error generating steps:', error);
      return [];
    }
  }

  /**
   * Generate a single step to append a block to the current document
   * Used for incremental streaming where blocks arrive one at a time
   * @param documentId - The document ID
   * @param blockHTML - HTML for a single block
   * @param currentDocSize - Current document size (to calculate append position)
   * @param isFirstBlock - Whether this is the first block (replaces empty paragraph)
   * @returns Array with single step (for consistency with generateStepsForContent)
   */
  async generateStepForBlock(
    documentId: string,
    blockHTML: string,
    currentDocSize: number,
    isFirstBlock: boolean
  ): Promise<any[]> {
    try {
      console.log(`[AIStepGenerator] Generating step for block (${blockHTML.length} chars, docSize: ${currentDocSize}, isFirst: ${isFirstBlock})`);

      // Parse the single HTML block
      const dom = new JSDOM(blockHTML);
      const parser = DOMParser.fromSchema(this.schema);
      const parsedDoc = parser.parse(dom.window.document.body);

      if (parsedDoc.content.childCount === 0) {
        console.error('[AIStepGenerator] No content in parsed block');
        return [];
      }

      // Get the first (and should be only) block from parsed content
      const block = parsedDoc.content.child(0);
      console.log(`[AIStepGenerator] Parsed block type: ${block.type.name}, size: ${block.nodeSize}`);

      let step: ReplaceStep;

      if (isFirstBlock) {
        // First block: replace the empty paragraph (0, 2)
        const fragment = Fragment.from(block);
        const slice = new Slice(fragment, 0, 0);
        step = new ReplaceStep(0, 2, slice);
        console.log(`[AIStepGenerator] First block: Replace (0, 2) with ${block.type.name}`);
      } else {
        // Subsequent blocks: append at current document end
        const fragment = Fragment.from(block);
        const slice = new Slice(fragment, 0, 0);
        step = new ReplaceStep(currentDocSize, currentDocSize, slice);
        console.log(`[AIStepGenerator] Append ${block.type.name} at position ${currentDocSize}`);
      }

      return [step.toJSON()];
    } catch (error) {
      console.error('[AIStepGenerator] Error generating step for block:', error);
      return [];
    }
  }

  /**
   * Generate a step that replaces a section with new content
   * @param documentId - Document ID
   * @param blockHTML - HTML for the replacement block
   * @param from - Start position of section to replace
   * @param to - End position of section to replace
   * @returns ReplaceStep that deletes old content and inserts new
   */
  async generateReplacementStep(
    documentId: string,
    blockHTML: string,
    from: number,
    to: number
  ): Promise<any[]> {
    try {
      console.log(`[AIStepGenerator] Generating replacement step for range (${from}, ${to}), blockHTML: ${blockHTML.length} chars`);

      // Parse HTML block
      const dom = new JSDOM(blockHTML);
      const parser = DOMParser.fromSchema(this.schema);
      const parsedDoc = parser.parse(dom.window.document.body);

      if (parsedDoc.content.childCount === 0) {
        console.error('[AIStepGenerator] No content in parsed block');
        return [];
      }

      // Get the block
      const block = parsedDoc.content.child(0);
      console.log(`[AIStepGenerator] Parsed block type: ${block.type.name}, size: ${block.nodeSize}`);

      // Create replacement step: delete (from, to) and insert new block
      const fragment = Fragment.from(block);
      const slice = new Slice(fragment, 0, 0);
      const step = new ReplaceStep(from, to, slice);

      console.log(`[AIStepGenerator] Replace (${from}, ${to}) with ${block.type.name}`);

      return [step.toJSON()];
    } catch (error) {
      console.error('[AIStepGenerator] Error generating replacement step:', error);
      return [];
    }
  }

  /**
   * Validate multiple steps by applying them sequentially to an empty document
   * @param stepsJSON - Array of steps in JSON format
   * @returns true if all steps can be applied successfully
   */
  private validateSteps(stepsJSON: any[]): boolean {
    try {
      // Create an empty document with one paragraph
      let currentDoc = this.schema.nodes.doc.create(null, [
        this.schema.nodes.paragraph.create()
      ]);

      console.log('[AIStepGenerator] Validating', stepsJSON.length, 'steps against empty document');
      console.log('[AIStepGenerator] Empty doc:', JSON.stringify(currentDoc.toJSON()));

      // Apply each step sequentially
      for (let i = 0; i < stepsJSON.length; i++) {
        const stepJSON = stepsJSON[i];
        console.log(`[AIStepGenerator] Validating step ${i + 1}/${stepsJSON.length}`);

        // Recreate the step from JSON
        const step = ReplaceStep.fromJSON(this.schema, stepJSON);

        // Try to apply the step to the current document
        const result = step.apply(currentDoc);

        if (result.failed) {
          console.error(`[AIStepGenerator] Step ${i + 1} validation failed:`, result.failed);
          return false;
        }

        // Update current document for next step
        if (result.doc) {
          currentDoc = result.doc;
        }
        console.log(`[AIStepGenerator] Step ${i + 1} validated, doc now has ${currentDoc.content.childCount} blocks`);
      }

      console.log('[AIStepGenerator] All steps validated successfully!');
      console.log('[AIStepGenerator] Final doc:', JSON.stringify(currentDoc.toJSON(), null, 2));
      return true;
    } catch (error) {
      console.error('[AIStepGenerator] Validation error:', error);
      return false;
    }
  }

  /**
   * Create multiple ProseMirror steps by parsing HTML content into blocks
   * This uses ProseMirror's DOMParser to convert HTML to document structure
   * and creates incremental steps for each block
   */
  private createStepsFromHTML(content: string, options: StepGenerationOptions): any[] {
    try {
      console.log('[AIStepGenerator] Creating steps from HTML content:', content.substring(0, 200));

      // Parse HTML using JSDOM and ProseMirror's DOMParser
      const dom = new JSDOM(content);
      const parser = DOMParser.fromSchema(this.schema);
      const parsedDoc = parser.parse(dom.window.document.body);

      console.log('[AIStepGenerator] Parsed document:', JSON.stringify(parsedDoc.toJSON(), null, 2));

      // Extract blocks from parsed document
      const blocks: any[] = [];
      parsedDoc.content.forEach((node) => {
        blocks.push(node);
      });

      console.log(`[AIStepGenerator] Extracted ${blocks.length} blocks from HTML`);

      if (blocks.length === 0) {
        console.error('[AIStepGenerator] No blocks found in parsed content');
        return [];
      }

      const steps: any[] = [];
      let currentPosition = 2; // Start after empty paragraph (position 0-2)

      // Create steps for each block
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        if (i === 0) {
          // First block: replace the empty paragraph (0, 2)
          const fragment = Fragment.from(block);
          const slice = new Slice(fragment, 0, 0);
          const step = new ReplaceStep(0, 2, slice);

          console.log(`[AIStepGenerator] Step ${i + 1}: Replace empty paragraph (0, 2) with ${block.type.name}`);

          steps.push(step.toJSON());

          // Update position to end of first block
          currentPosition = block.nodeSize;
        } else {
          // Subsequent blocks: append at the current end position
          const fragment = Fragment.from(block);
          const slice = new Slice(fragment, 0, 0);
          const step = new ReplaceStep(currentPosition, currentPosition, slice);

          console.log(`[AIStepGenerator] Step ${i + 1}: Append ${block.type.name} at position ${currentPosition}`);

          steps.push(step.toJSON());

          // Update position to account for the newly added block
          currentPosition += block.nodeSize;
        }
      }

      console.log(`[AIStepGenerator] Generated ${steps.length} steps total`);

      return steps;
    } catch (error) {
      console.error('[AIStepGenerator] Error creating steps:', error);
      return [];
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
   * Parse HTML to ProseMirror document JSON
   * Used for converting AI-generated HTML into document structure
   */
  parseHTMLToDoc(html: string): any {
    try {
      console.log('[AIStepGenerator] Parsing HTML to document:', html.substring(0, 200));

      const dom = new JSDOM(html);
      const parser = DOMParser.fromSchema(this.schema);
      const parsedDoc = parser.parse(dom.window.document.body);

      return parsedDoc.toJSON();
    } catch (error) {
      console.error('[AIStepGenerator] Error parsing HTML to doc:', error);
      throw error;
    }
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
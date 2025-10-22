import { mistral } from '@ai-sdk/mistral';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { streamText, LanguageModel } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { CollaborationManager, DocumentState, ReceiveStepsResult } from './CollaborationManager.js';
import { AIStepGenerator } from './AIStepGenerator.js';
import { EditorState } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import { ReplaceStep } from 'prosemirror-transform';

// Generation tracking interface
interface ActiveGeneration {
  documentId: string;
  startTime: number;
  abortController: AbortController;
}

// Generation options interface
export interface GenerationOptions {
  position?: number;
  replaceRange?: { from: number; to: number };
  isStreaming?: boolean;
  isFinal?: boolean;
  requesterId?: string;
  requesterName?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  batchSize?: number;
  context?: string;
}

// Generation status interface
export interface GenerationStatus {
  status: 'active' | 'completed';
  documentId?: string;
  duration?: number;
}

/**
 * AIUserService - Manages AI Assistant as a collaborative user
 * This service connects the AI as a special participant in document collaboration,
 * generating ProseMirror steps that integrate with the OT system.
 */
export class AIUserService {
  private collabManager: CollaborationManager;
  private stepGenerator: AIStepGenerator;
  private io: Server | null;

  // AI user identification
  private readonly aiUserId = 'ai-assistant';
  private readonly aiUserName = 'AI Assistant';
  private readonly aiUserColor = '#9333EA'; // Purple color for AI

  // Active generation tracking
  private activeGenerations: Map<string, ActiveGeneration>;

  constructor(collabManager: CollaborationManager, stepGenerator: AIStepGenerator, io: Server | null = null) {
    this.collabManager = collabManager;
    this.stepGenerator = stepGenerator;
    this.io = io; // Socket.IO instance for broadcasting
    this.activeGenerations = new Map();
  }

  /**
   * Start an AI generation for a document
   * @param documentId - The document to generate content for
   * @param prompt - The user's prompt
   * @param options - Generation options (model, position, etc.)
   * @returns generationId - Unique ID for tracking this generation
   */
  async startGeneration(documentId: string, prompt: string, options: GenerationOptions = {}): Promise<string> {
    const generationId = uuidv4();
    console.log(`[AIUserService] Starting generation ${generationId} for document ${documentId}`);

    try {
      // Get current document state
      const docState = this.collabManager.getDocument(documentId);
      if (!docState) {
        throw new Error('Document not found');
      }

      // Track this generation
      this.activeGenerations.set(generationId, {
        documentId,
        startTime: Date.now(),
        abortController: new AbortController()
      });

      // Select AI model based on options or default
      const modelName = options.model || process.env.DEFAULT_AI_MODEL || 'mistral-small-latest';
      console.log(`[AIUserService] Using model: ${modelName}`);
      const model = this.selectModel(modelName);

      // Build the system prompt with document context
      const systemPrompt = this.buildSystemPrompt(docState, options);
      console.log(`[AIUserService] System prompt length: ${systemPrompt.length}`);
      console.log(`[AIUserService] User prompt: ${prompt.substring(0, 100)}...`);

      // Stream AI-generated content
      const { textStream } = await streamText({
        model,
        system: systemPrompt,
        prompt: prompt,
        temperature: options.temperature || 0.7,
        maxRetries: 3,
        abortSignal: this.activeGenerations.get(generationId)!.abortController.signal
      });

      // Process the stream and generate steps
      console.log(`[AIUserService] Processing stream...`);
      this.processStream(generationId, documentId, textStream, docState.version, options);

      return generationId;
    } catch (error: any) {
      console.error(`[AIUserService] Error starting generation:`, error);
      console.error(`[AIUserService] Error details:`, error.message, error.stack);
      this.activeGenerations.delete(generationId);
      throw error;
    }
  }

  /**
   * Process the AI text stream and generate ProseMirror steps incrementally
   */
  private async processStream(
    generationId: string,
    documentId: string,
    textStream: AsyncIterable<string>,
    startVersion: number,
    options: GenerationOptions
  ): Promise<void> {
    const generation = this.activeGenerations.get(generationId);
    if (!generation) return;

    console.log(`[AIUserService] Processing stream for generation ${generationId} (INCREMENTAL MODE)`);

    try {
      let htmlBuffer = '';
      let chunkCount = 0;
      let stepsSent = 0;
      let blocksSent = 0;

      // Track current document version
      let currentVersion = startVersion;

      // Create server-side ProseMirror state for position tracking
      const schema = this.stepGenerator.getSchema();
      let editorState = EditorState.create({
        schema,
        doc: schema.nodes.doc.create(null, [
          schema.nodes.paragraph.create()
        ])
      });

      console.log(`[AIUserService] Starting incremental streaming with EditorState (docSize: ${editorState.doc.content.size})...`);

      for await (const chunk of textStream) {
        // Check if generation was cancelled
        if (!this.activeGenerations.has(generationId)) {
          console.log(`[AIUserService] Generation ${generationId} was cancelled`);
          break;
        }

        htmlBuffer += chunk;
        chunkCount++;

        // Try to extract and process complete HTML blocks
        const { completeBlocks, remaining } = this.extractCompleteBlocks(htmlBuffer);

        if (completeBlocks.length > 0) {
          console.log(`[AIUserService] Found ${completeBlocks.length} complete blocks in buffer`);

          // Generate steps for each complete block
          for (const blockHTML of completeBlocks) {
            const isFirstBlock = blocksSent === 0;

            let steps: any[];

            // Check if we're in replacement mode
            if (options.replaceRange && isFirstBlock) {
              // REPLACEMENT MODE: First block replaces the selection
              console.log(`[AIUserService] REPLACEMENT MODE: Replacing range (${options.replaceRange.from}, ${options.replaceRange.to})`);

              steps = await this.stepGenerator.generateReplacementStep(
                documentId,
                blockHTML,
                options.replaceRange.from,
                options.replaceRange.to
              );

            } else if (options.replaceRange && !isFirstBlock) {
              // REPLACEMENT MODE: Subsequent blocks append after replacement
              const currentDocSize = editorState.doc.content.size;
              steps = await this.stepGenerator.generateStepForBlock(
                documentId,
                blockHTML,
                currentDocSize,
                false // not first block
              );

            } else {
              // APPEND MODE: Current behavior (no replaceRange)
              const currentDocSize = editorState.doc.content.size;
              steps = await this.stepGenerator.generateStepForBlock(
                documentId,
                blockHTML,
                currentDocSize,
                isFirstBlock
              );
            }

            if (steps.length > 0) {
              // VALIDATE step by applying to our server-side EditorState FIRST
              try {
                const step = ReplaceStep.fromJSON(schema, steps[0]);

                // Try to apply the step directly to get result
                const stepResult = step.apply(editorState.doc);

                // Check if step application failed
                if (stepResult.failed) {
                  console.error(`[AIUserService] Step validation FAILED: ${stepResult.failed}`);
                  console.error(`[AIUserService] Invalid step:`, JSON.stringify(steps[0]));
                  console.error(`[AIUserService] Skipping invalid block`);
                  continue; // Skip this block and continue with next
                }

                // Now apply to EditorState via transaction
                const tr = editorState.tr;
                tr.step(step);
                editorState = editorState.apply(tr);

                // Now send the validated step to clients
                const docState = this.collabManager.getDocument(documentId);
                currentVersion = docState?.version || currentVersion;

                const result = this.sendSteps(documentId, steps, currentVersion);

                if (result.status === 'accepted') {
                  stepsSent += steps.length;
                  blocksSent++;
                  currentVersion = result.version ?? currentVersion;

                  console.log(`[AIUserService] Sent block ${blocksSent} (${steps.length} steps, total: ${stepsSent}), version: ${currentVersion}, docSize: ${editorState.doc.content.size}`);
                } else {
                  console.warn(`[AIUserService] Steps rejected by CollaborationManager:`, result);
                }
              } catch (error: any) {
                console.error(`[AIUserService] Error validating step:`, error.message);
                console.error(`[AIUserService] Invalid step JSON:`, JSON.stringify(steps[0]));
                console.error(`[AIUserService] Skipping invalid block`);
                // Continue to next block
              }
            }
          }

          // Keep only the remaining incomplete HTML
          htmlBuffer = remaining;
        }

        // Log progress every 10 chunks
        if (chunkCount % 10 === 0) {
          console.log(`[AIUserService] Received ${chunkCount} chunks, sent ${blocksSent} blocks (${stepsSent} steps), buffer: ${htmlBuffer.length} chars`);
        }
      }

      console.log(`[AIUserService] Stream complete. Processing remaining buffer...`);

      // Process any remaining content in buffer
      if (htmlBuffer.trim().length > 0) {
        console.log(`[AIUserService] Generating steps for remaining content (${htmlBuffer.length} chars)`);

        const steps = await this.stepGenerator.generateStepsForContent(
          documentId,
          htmlBuffer,
          {
            position: options.position,
            replaceRange: options.replaceRange,
            isStreaming: false,
            isFinal: true
          }
        );

        if (steps.length > 0) {
          const docState = this.collabManager.getDocument(documentId);
          currentVersion = docState?.version || currentVersion;

          const result = this.sendSteps(documentId, steps, currentVersion);

          if (result.status === 'accepted') {
            stepsSent += steps.length;
            console.log(`[AIUserService] Sent final ${steps.length} steps (total: ${stepsSent})`);
          }
        }
      }

      console.log(`[AIUserService] Generation ${generationId} complete. Total steps sent: ${stepsSent}`);
      this.completeGeneration(generationId);
    } catch (error: any) {
      console.error(`[AIUserService] Stream processing error for ${generationId}:`, error);
      console.error(`[AIUserService] Error details:`, error.message, error.stack);
      this.cancelGeneration(generationId);
      throw error;
    }
  }

  /**
   * Extract complete HTML blocks from buffer
   * Returns complete blocks and remaining incomplete HTML
   */
  private extractCompleteBlocks(html: string): { completeBlocks: string[]; remaining: string } {
    const blocks: string[] = [];
    let remaining = html;

    // Block-level tags we want to extract incrementally
    const blockTags = ['h1', 'h2', 'h3', 'p', 'ul', 'ol'];

    for (const tag of blockTags) {
      const openTag = `<${tag}>`;
      const closeTag = `</${tag}>`;

      let startIdx = 0;
      while (true) {
        const openIdx = remaining.indexOf(openTag, startIdx);
        if (openIdx === -1) break;

        const closeIdx = remaining.indexOf(closeTag, openIdx);
        if (closeIdx === -1) break; // Incomplete block

        // Extract complete block including tags
        const block = remaining.substring(openIdx, closeIdx + closeTag.length);
        blocks.push(block);

        // Remove from remaining
        remaining = remaining.substring(0, openIdx) + remaining.substring(closeIdx + closeTag.length);

        // Don't increment startIdx since we removed content
      }
    }

    return { completeBlocks: blocks, remaining };
  }

  /**
   * Send steps through the collaboration system
   */
  private sendSteps(documentId: string, steps: any[], version: number): ReceiveStepsResult {
    // Apply steps through the collaboration manager
    const result = this.collabManager.receiveSteps(
      documentId,
      version,
      steps,
      this.aiUserId
    );

    // Broadcast to all clients if accepted
    if (result.status === 'accepted' && this.io) {
      this.io.to(documentId).emit('steps', {
        steps: steps,
        clientID: this.aiUserId,
        version: result.version,
        isAI: true
      });
    }

    return result;
  }

  /**
   * Cancel an active generation
   */
  cancelGeneration(generationId: string): void {
    const generation = this.activeGenerations.get(generationId);
    if (generation) {
      generation.abortController.abort();
      this.activeGenerations.delete(generationId);
    }
  }

  /**
   * Mark a generation as complete
   */
  private completeGeneration(generationId: string): void {
    this.activeGenerations.delete(generationId);
  }

  /**
   * Select the AI model based on configuration
   */
  private selectModel(modelName?: string): LanguageModel {
    switch (modelName) {
      // Mistral models (default)
      case 'mistral-large':
      case 'mistral-large-latest':
        return mistral('mistral-large-latest');
      case 'mistral-medium':
      case 'mistral-medium-latest':
        return mistral('mistral-medium-latest');
      case 'mistral-small':
      case 'mistral-small-latest':
        return mistral('mistral-small-latest');
      case 'open-mistral-7b':
        return mistral('open-mistral-7b');
      case 'open-mixtral-8x7b':
        return mistral('open-mixtral-8x7b');
      case 'open-mixtral-8x22b':
        return mistral('open-mixtral-8x22b');

      // OpenAI models
      case 'gpt-4':
      case 'gpt-4-turbo':
        return openai('gpt-4-turbo-preview');
      case 'gpt-3.5':
        return openai('gpt-3.5-turbo');

      // Anthropic models
      case 'claude-3-opus':
        return anthropic('claude-3-opus-20240229');
      case 'claude-3-sonnet':
        return anthropic('claude-3-sonnet-20240229');

      // Default to Mistral Small (fast and efficient)
      default:
        return mistral('mistral-small-latest');
    }
  }

  /**
   * Build the system prompt with document context
   */
  private buildSystemPrompt(docState: DocumentState, options: GenerationOptions): string {
    const basePrompt = `You are an AI assistant helping to write a travel itinerary document.

IMPORTANT: You must respond with valid HTML using only these tags:
- <h1>, <h2>, <h3> for headings
- <p> for paragraphs
- <ul> and <li> for bullet lists
- <strong> for bold text
- <em> for italic text

Do NOT use:
- Markdown syntax (no ** or * or #)
- Any other HTML tags
- Code blocks or formatting

Generate content that fits naturally into a travel itinerary.
Use clear, engaging language suitable for travel planning.
Include practical details like timing, transportation, and tips when relevant.

Example format:
<h1>Weekend in Paris</h1>
<p>A romantic getaway to the City of Light.</p>
<h2>Day 1</h2>
<p>Start your morning at the <strong>Eiffel Tower</strong>. Arrive early to avoid crowds.</p>
<ul>
<li>Visit the observation deck</li>
<li>Take photos at Trocadéro Gardens</li>
</ul>

Current document context:
- Document has ${docState.version} revisions
- ${docState.clients.size} users currently editing`;

    // If we're in replacement mode, add context about what's being replaced
    if (options.replaceRange) {
      const documentHTML = this.convertDocToHTML(docState.doc);

      return `${basePrompt}

REPLACEMENT MODE:
You are replacing a specific section of the document. The user has selected content they want to change.
Please provide ONLY the replacement HTML for that selected section.

Current full document (for context):
${documentHTML}

The section being replaced is at positions ${options.replaceRange.from} to ${options.replaceRange.to}.

${options.context ? `User instruction: ${options.context}` : ''}

Generate replacement content that addresses the user's request while fitting naturally with the rest of the document.`;
    }

    if (options.context) {
      return `${basePrompt}\n\nAdditional context:\n${options.context}`;
    }

    return basePrompt;
  }

  /**
   * Convert ProseMirror document to HTML for context
   * Renders comment marks as special <span> tags for LLM
   */
  private convertDocToHTML(doc: any): string {
    if (!doc || !doc.content) {
      return '<p></p>';
    }

    try {
      let html = '';

      const traverse = (node: any): string => {
        if (node.type === 'text') {
          let text = node.text || '';

          // Apply marks (bold, italic, comments, etc.)
          if (node.marks && Array.isArray(node.marks)) {
            for (const mark of node.marks) {
              if (mark.type === 'strong') {
                text = `<strong>${text}</strong>`;
              } else if (mark.type === 'em') {
                text = `<em>${text}</em>`;
              } else if (mark.type === 'comment') {
                // Render comment as special span for LLM context
                const commentId = mark.attrs?.commentId || 'unknown';
                const content = mark.attrs?.content || '';
                const userId = mark.attrs?.userId || '';
                text = `<span class="ai-comment" data-comment-id="${commentId}" data-user-id="${userId}" data-content="${this.escapeHtml(content)}">${text}</span>`;
              }
            }
          }

          return text;
        }

        if (node.content && Array.isArray(node.content)) {
          const content = node.content.map(traverse).join('');

          switch (node.type) {
            case 'heading':
              const level = node.attrs?.level || 1;
              return `<h${level}>${content}</h${level}>`;
            case 'paragraph':
              return `<p>${content}</p>`;
            case 'bullet_list':
              return `<ul>${content}</ul>`;
            case 'ordered_list':
              return `<ol>${content}</ol>`;
            case 'list_item':
              return `<li>${content}</li>`;
            default:
              return content;
          }
        }

        return '';
      };

      if (doc.content && Array.isArray(doc.content)) {
        html = doc.content.map(traverse).join('\n');
      }

      return html || '<p></p>';
    } catch (error) {
      console.error('[AIUserService] Error converting doc to HTML:', error);
      return '<p></p>';
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generate AI reply for a comment
   * Stores the generated document in the comment's aiReply attribute
   * @param documentId - Document ID
   * @param commentId - Comment ID to reply to
   * @param from - Start position of commented text
   * @param to - End position of commented text
   * @param instruction - User's instruction from comment content
   * @param options - Generation options
   * @returns Generation ID
   */
  async generateCommentReply(
    documentId: string,
    commentId: string,
    from: number,
    to: number,
    instruction: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    const generationId = uuidv4();

    console.log(`[AIUserService] Starting comment reply generation ${generationId} for comment ${commentId}`);

    // Get current document state
    const docState = this.collabManager.getDocument(documentId);
    if (!docState) {
      throw new Error('Document not found');
    }

    // Convert document to HTML with comment annotations
    const documentHTML = this.convertDocToHTML(docState.doc);

    // Build prompt for LLM
    const systemPrompt = `You are an AI assistant helping to write a travel itinerary document.

IMPORTANT: You must respond with valid HTML using only these tags:
- <h1>, <h2>, <h3> for headings
- <p> for paragraphs
- <ul> and <li> for bullet lists
- <strong> for bold text
- <em> for italic text

Do NOT use:
- Markdown syntax (no ** or * or #)
- Any other HTML tags
- Code blocks or formatting

The user has commented on a specific section of their document and requested a change.
You should generate a REPLACEMENT for that commented section that addresses their request.

Current document context:
${documentHTML}

The user's comment is on the text from position ${from} to ${to}.
User's instruction: ${instruction}

Please provide ONLY the replacement HTML for the commented section.
Make sure your response fits naturally with the rest of the document.`;

    const userPrompt = `Generate a replacement for the commented section that addresses this request: ${instruction}`;

    try {
      // Generate AI response
      const model = this.selectModel(options.model || process.env.DEFAULT_AI_MODEL);
      const abortController = new AbortController();

      this.activeGenerations.set(generationId, {
        documentId,
        startTime: Date.now(),
        abortController
      });

      const result = await streamText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: options.temperature || 0.7,
        abortSignal: abortController.signal
      });

      // Collect the full HTML response
      let fullHTML = '';
      for await (const chunk of result.textStream) {
        fullHTML += chunk;
      }

      console.log(`[AIUserService] Generated reply HTML (${fullHTML.length} chars)`);

      // Parse HTML to ProseMirror document
      const aiReplyDoc = this.stepGenerator.parseHTMLToDoc(fullHTML);

      console.log(`[AIUserService] Parsed AI reply document:`, JSON.stringify(aiReplyDoc, null, 2));

      // Now we need to update the comment mark's aiReply attribute
      // This requires finding the comment mark and creating a step to update it
      // For now, emit an event with the reply data
      if (this.io) {
        this.io.to(documentId).emit('ai-comment-reply-ready', {
          generationId,
          commentId,
          aiReplyDoc,
          from,
          to
        });
      }

      this.completeGeneration(generationId);

      return generationId;
    } catch (error: any) {
      console.error(`[AIUserService] Error generating comment reply:`, error);
      this.completeGeneration(generationId);
      throw error;
    }
  }

  /**
   * Get status of an active generation
   */
  getGenerationStatus(generationId: string): GenerationStatus {
    const generation = this.activeGenerations.get(generationId);
    if (!generation) {
      return { status: 'completed' };
    }

    return {
      status: 'active',
      documentId: generation.documentId,
      duration: Date.now() - generation.startTime
    };
  }

  /**
   * Get all active generations
   */
  getActiveGenerations(): string[] {
    return Array.from(this.activeGenerations.keys());
  }
}
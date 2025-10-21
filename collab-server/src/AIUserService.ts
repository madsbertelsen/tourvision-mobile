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

            // Generate a single step for this block at the current document position
            const currentDocSize = editorState.doc.content.size;
            const steps = await this.stepGenerator.generateStepForBlock(
              documentId,
              blockHTML,
              currentDocSize,
              isFirstBlock
            );

            if (steps.length > 0) {
              // Get current document state
              const docState = this.collabManager.getDocument(documentId);
              currentVersion = docState?.version || currentVersion;

              // Send steps immediately
              const result = this.sendSteps(documentId, steps, currentVersion);

              if (result.status === 'accepted') {
                stepsSent += steps.length;
                blocksSent++;
                currentVersion = result.version ?? currentVersion;

                // Apply the step to our server-side EditorState to track positions
                try {
                  const step = ReplaceStep.fromJSON(schema, steps[0]);
                  const tr = editorState.tr;
                  tr.step(step);
                  editorState = editorState.apply(tr);

                  console.log(`[AIUserService] Sent block ${blocksSent} (${steps.length} steps, total: ${stepsSent}), version: ${currentVersion}, docSize: ${editorState.doc.content.size}`);
                } catch (error: any) {
                  console.error(`[AIUserService] Error applying step to EditorState:`, error);
                  console.log(`[AIUserService] Sent ${steps.length} steps (total: ${stepsSent}), new version: ${currentVersion}`);
                }
              } else {
                console.warn(`[AIUserService] Steps rejected:`, result);
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

    if (options.context) {
      return `${basePrompt}\n\nAdditional context:\n${options.context}`;
    }

    return basePrompt;
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
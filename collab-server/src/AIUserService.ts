import { mistral } from '@ai-sdk/mistral';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { streamText, LanguageModel } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { CollaborationManager, DocumentState, ReceiveStepsResult } from './CollaborationManager.js';
import { AIStepGenerator } from './AIStepGenerator.js';

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

      // TESTING: Replace with static content instead of AI
      console.log(`[AIUserService] Using STATIC TEST CONTENT instead of AI...`);

      // Create a simple async iterable that yields our test content
      const testContent = "This is a simple test paragraph without any special formatting.";
      const textStream = (async function* () {
        // Simulate streaming by yielding the content in chunks
        const chunkSize = 10;
        for (let i = 0; i < testContent.length; i += chunkSize) {
          yield testContent.slice(i, i + chunkSize);
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      })();

      /* DISABLED FOR TESTING
      const { textStream } = await streamText({
        model,
        system: systemPrompt,
        prompt: prompt,
        temperature: options.temperature || 0.7,
        maxRetries: 3,
        abortSignal: this.activeGenerations.get(generationId)!.abortController.signal
      });
      */

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
   * Process the AI text stream and generate ProseMirror steps
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

    console.log(`[AIUserService] Processing stream for generation ${generationId}`);

    try {
      // Collect the entire AI response first
      let completeText = '';
      let chunkCount = 0;

      console.log(`[AIUserService] Collecting AI response...`);
      for await (const chunk of textStream) {
        // Check if generation was cancelled
        if (!this.activeGenerations.has(generationId)) {
          console.log(`[AIUserService] Generation ${generationId} was cancelled`);
          break;
        }

        completeText += chunk;
        chunkCount++;

        // Log progress every 10 chunks
        if (chunkCount % 10 === 0) {
          console.log(`[AIUserService] Received ${chunkCount} chunks, total length: ${completeText.length}`);
        }
      }

      console.log(`[AIUserService] Complete response received: ${completeText.length} characters`);
      console.log(`[AIUserService] Response preview: ${completeText.substring(0, 200)}...`);

      // Now generate ProseMirror steps from the complete content
      if (completeText.length > 0) {
        console.log(`[AIUserService] Generating ProseMirror steps for complete content...`);

        const steps = await this.stepGenerator.generateStepsForContent(
          documentId,
          completeText,
          {
            position: options.position,
            replaceRange: options.replaceRange,
            isStreaming: false,
            isFinal: true
          }
        );

        if (steps.length > 0) {
          console.log(`[AIUserService] Generated ${steps.length} steps`);
          console.log(`[AIUserService] Step details:`, JSON.stringify(steps[0], null, 2));

          // Get current document version
          const docState = this.collabManager.getDocument(documentId);
          const currentVersion = docState?.version || startVersion;

          // Send all steps at once
          const result = this.sendSteps(documentId, steps, currentVersion);
          console.log(`[AIUserService] Steps sent with result:`, result);
        } else {
          console.log(`[AIUserService] No steps generated from content`);
        }
      }

      // Mark generation as complete
      console.log(`[AIUserService] Generation ${generationId} complete`);
      this.completeGeneration(generationId);
    } catch (error: any) {
      console.error(`[AIUserService] Stream processing error for ${generationId}:`, error);
      console.error(`[AIUserService] Error details:`, error.message, error.stack);
      this.cancelGeneration(generationId);
      throw error;
    }
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

You should generate content that fits naturally into the document structure.
Use clear, engaging language suitable for travel planning.

When mentioning locations, format them as specific places that can be mapped.
Include practical details like timing, transportation, and tips when relevant.

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
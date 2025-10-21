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
      const model = this.selectModel(options.model);

      // Build the system prompt with document context
      const systemPrompt = this.buildSystemPrompt(docState, options);

      // Stream the AI response
      const { textStream } = await streamText({
        model,
        system: systemPrompt,
        prompt: prompt,
        temperature: options.temperature || 0.7,
        maxRetries: 3,
        abortSignal: this.activeGenerations.get(generationId)!.abortController.signal
      });

      // Process the stream and generate steps
      this.processStream(generationId, documentId, textStream, docState.version, options);

      return generationId;
    } catch (error) {
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

    try {
      let buffer = '';
      let chunkCount = 0;
      const batchSize = options.batchSize || 50; // Characters to batch before creating a step

      for await (const chunk of textStream) {
        // Check if generation was cancelled
        if (!this.activeGenerations.has(generationId)) {
          break;
        }

        buffer += chunk;
        chunkCount++;

        // Generate steps periodically for streaming effect
        if (buffer.length >= batchSize || chunk.includes('\n')) {
          const steps = await this.stepGenerator.generateStepsForContent(
            documentId,
            buffer,
            {
              position: options.position,
              replaceRange: options.replaceRange,
              isStreaming: true
            }
          );

          if (steps.length > 0) {
            // Send steps through collaboration manager
            this.sendSteps(documentId, steps, startVersion + chunkCount);
          }

          buffer = ''; // Clear buffer after processing
        }
      }

      // Process any remaining content
      if (buffer.length > 0) {
        const steps = await this.stepGenerator.generateStepsForContent(
          documentId,
          buffer,
          {
            position: options.position,
            replaceRange: options.replaceRange,
            isStreaming: false,
            isFinal: true
          }
        );

        if (steps.length > 0) {
          this.sendSteps(documentId, steps, startVersion + chunkCount + 1);
        }
      }

      // Mark generation as complete
      this.completeGeneration(generationId);
    } catch (error) {
      console.error(`AI generation error for ${generationId}:`, error);
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
      case 'gpt-4':
      case 'gpt-4-turbo':
        return openai('gpt-4-turbo-preview');
      case 'gpt-3.5':
        return openai('gpt-3.5-turbo');
      case 'claude-3-opus':
        return anthropic('claude-3-opus-20240229');
      case 'claude-3-sonnet':
      default:
        return anthropic('claude-3-sonnet-20240229');
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
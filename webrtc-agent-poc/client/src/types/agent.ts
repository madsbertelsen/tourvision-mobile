/**
 * Agent types for voice-based tool selection and execution
 */

import type { EditorView } from 'prosemirror-view';
import type { Schema } from 'prosemirror-model';
import type { DetectedLocation } from './index';

/**
 * Represents a single tool call from the LLM
 */
export interface ToolCall {
  /** Tool name */
  name: 'replaceText' | 'insertText' | 'insertMap' | 'geocode' | 'createGeoMark' | 'setTransportation';

  /** Tool parameters (structure depends on tool) */
  parameters: Record<string, any>;

  /** Execution status (optional, for tracking progress) */
  status?: 'pending' | 'executing' | 'completed' | 'failed';
}

/**
 * Agent's execution plan after analyzing voice input
 */
export interface AgentPlan {
  /** Current status of the plan */
  status: 'analyzing' | 'ready' | 'executing' | 'complete' | 'failed';

  /** LLM's reasoning/explanation for the plan */
  reasoning: string;

  /** List of tools to execute */
  tools: ToolCall[];

  /** Results from executed tools (populated after execution) */
  executionResults?: ExecutionResult[];

  /** Error message if plan failed */
  error?: string;
}

/**
 * Context needed for tool execution
 */
export interface ExecutionContext {
  /** ProseMirror editor view */
  editorView: EditorView;

  /** ProseMirror schema */
  schema: Schema;

  /** Detected locations from voice input */
  detectedLocations: DetectedLocation[];

  /** Range of last inserted text (for scoped text search in createGeoMark) */
  lastInsertedRange?: { from: number; to: number };

  /** Callback to notify when geo marks change (triggers map updates) */
  notifyGeoMarkChange?: () => void;
}

/**
 * Result from executing a single tool
 */
export interface ExecutionResult {
  /** Name of the tool that was executed */
  toolName: string;

  /** Whether execution succeeded */
  success: boolean;

  /** Success message */
  message?: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Ollama tool definition (JSON schema format)
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      required: string[];
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
        items?: {
          type: string;
        };
      }>;
    };
  };
}

/**
 * Ollama API message
 */
export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: Array<{
    type: 'function';
    function: {
      name: string;
      arguments: Record<string, any>;
    };
  }>;
  tool_name?: string;  // For tool result messages (role: 'tool')
}

/**
 * Ollama API response
 */
export interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
}

/**
 * Intent clarification types
 */

/**
 * Clarified user intent after multi-turn analysis
 */
export interface ClarifiedIntent {
  /** Natural language description of what user wants */
  intent: string;

  /** Confidence level of intent understanding */
  confidence: 'high' | 'medium' | 'low';

  /** LLM's reasoning process */
  reasoning: string;
}

/**
 * Question to ask user when intent is ambiguous
 */
export interface AmbiguityQuestion {
  /** The question to ask */
  question: string;

  /** Multiple choice options for user */
  options: Array<{
    label: string;
    value: string;
  }>;

  /** Whether this ambiguity is asking user to spell a mistranscribed word */
  requiresSpelling?: boolean;
}

/**
 * Result from intent clarification phase
 */
export type IntentResult =
  | { type: 'clear'; intent: ClarifiedIntent }
  | { type: 'ambiguous'; question: AmbiguityQuestion };

/**
 * Conversation turn in multi-turn clarification loop
 */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
}

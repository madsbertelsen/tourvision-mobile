/**
 * Browser IPC Types
 *
 * Type definitions for messages passed between:
 * - Browser context (browser-agent.ts)
 * - Node.js launcher (agent-worker-launcher.ts)
 * - Agent Manager (agent-manager.ts)
 */

/**
 * Messages sent from Browser → Manager (via sendToManager)
 */
export type BrowserToManagerMessage =
  | { type: 'connected'; documentId: string; agentId: string }
  | { type: 'webrtc_offer'; offer: RTCSessionDescriptionInit }
  | { type: 'webrtc_ice_candidate'; candidate: RTCIceCandidateInit }
  | { type: 'metrics'; documentId: string; agentId: string; memory_mb: number; cpu_percent: number }
  | { type: 'llm_call'; documentId: string; agentId: string }
  | { type: 'location_marked'; documentId: string; agentId: string }
  | { type: 'error'; documentId: string; agentId: string; error: string }
  | { type: 'pong' };

/**
 * Messages sent from Manager → Browser (via handleManagerMessage)
 */
export type ManagerToBrowserMessage =
  | { type: 'shutdown' }
  | { type: 'ping' }
  | { type: 'punctuation_trigger'; character: string; timestamp: number }
  | { type: 'webrtc_answer'; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc_ice_candidate'; candidate: RTCIceCandidateInit };

/**
 * Environment variables injected into browser context
 */
export interface BrowserEnvironment {
  DOCUMENT_ID: string;
  AGENT_ID: string;
  WS_PROTOCOL: string;
  WS_HOST: string;
  WS_PORT: string;
  AI_GATEWAY_API_KEY: string;
}

/**
 * Global window extensions for browser context
 */
export interface WindowExtensions {
  sendToManager: (msg: BrowserToManagerMessage) => void;
  handleManagerMessage: (msg: ManagerToBrowserMessage) => void;
  ENV: BrowserEnvironment;
}

declare global {
  interface Window extends WindowExtensions {}
}

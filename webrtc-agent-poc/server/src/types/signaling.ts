/**
 * y-webrtc signaling protocol message types
 */

export interface SignalingMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish' | 'ping';
  topics?: string[];
  topic?: string;
  data?: any;
  clients?: number; // Added by server for publish messages
}

export interface HealthResponse {
  status: string;
  connections: number;
  topics: string[];
  topicCounts: Array<{
    topic: string;
    subscribers: number;
  }>;
}

export interface ServerInfoResponse {
  status: string;
  service: string;
  version: string;
  protocol: string;
  usage: string;
}

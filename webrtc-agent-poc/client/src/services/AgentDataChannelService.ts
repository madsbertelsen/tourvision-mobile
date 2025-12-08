/**
 * AgentDataChannelService
 * Manages WebRTC data channels for agent communication
 *
 * Uses the existing y-webrtc peer connections to add a custom data channel
 * labeled "agent-commands" for sending voice analysis requests from user tab
 * to agent tab.
 *
 * Architecture:
 * - User Tab: Sends analyze-transcript via data channel to agent peer
 * - Agent Tab: Receives requests, processes, returns plan via data channel
 *
 * Benefits over WebSocket:
 * - True P2P (no server intermediary)
 * - Lower latency (direct connection)
 * - Leverages existing WebRTC infrastructure from y-webrtc
 */

import type { WebrtcProvider } from 'y-webrtc';
import type { Awareness } from 'y-protocols/awareness';
import type { AgentPlan } from '../types/agent';

export type AgentCommandMessage =
  | { type: 'analyze-transcript'; requestId: string; transcript: string; documentContext: string }
  | { type: 'plan-ready'; requestId: string; plan: AgentPlan | null; error?: string }
  | { type: 'agent-error'; requestId: string; error: string; details?: any };

interface PendingRequest {
  resolve: (plan: AgentPlan | null) => void;
  reject: (error: Error) => void;
  timeout: number;
}

export class AgentDataChannelService {
  private provider: WebrtcProvider | null = null;
  private awareness: Awareness | null = null;
  private dataChannels = new Map<string, RTCDataChannel>();
  private pendingRequests = new Map<string, PendingRequest>();
  private isAgentMode: boolean;
  private messageHandler: ((message: AgentCommandMessage) => void) | null = null;

  constructor(isAgentMode: boolean) {
    this.isAgentMode = isAgentMode;
  }

  /**
   * Initialize with y-webrtc provider and awareness
   * Called by main.ts after provider is created
   */
  initialize(provider: WebrtcProvider, awareness: Awareness): void {
    this.provider = provider;
    this.awareness = awareness;

    console.log('[AgentDataChannel] Initialized', { isAgentMode: this.isAgentMode });

    // Mark ourselves as agent in awareness if in agent mode
    if (this.isAgentMode) {
      awareness.setLocalStateField('isAgent', true);
      console.log('[AgentDataChannel] Marked as agent in awareness');
    }

    // Monitor peer connections to add data channels
    this.monitorPeerConnections();
  }

  /**
   * Monitor y-webrtc peer connections and add agent-commands data channel
   */
  private monitorPeerConnections(): void {
    if (!this.provider) return;

    console.log('[AgentDataChannel] Provider object:', this.provider);

    // Access y-webrtc's internal room and peer connections
    // y-webrtc uses 'room' property with 'webrtcConns' Map<string, SimplePeer>
    const room = (this.provider as any).room;
    console.log('[AgentDataChannel] Room object:', room);

    if (!room) {
      console.warn('[AgentDataChannel] Cannot access y-webrtc room - provider structure may have changed');
      console.warn('[AgentDataChannel] Provider keys:', Object.keys(this.provider));
      return;
    }

    // Monitor 'peers' event to detect new connections
    this.provider.on('peers', (event: any) => {
      console.log('[AgentDataChannel] Peers changed:', event);
      console.log('[AgentDataChannel] WebRTC peers:', event.webrtcPeers);
      console.log('[AgentDataChannel] BC peers:', event.bcPeers);

      // Get WebRTC peer connections (not BroadcastChannel)
      const webrtcPeers = event.webrtcPeers || [];
      console.log('[AgentDataChannel] Processing', webrtcPeers.length, 'WebRTC peers');

      // For each peer, check if we already have a data channel
      webrtcPeers.forEach((peerId: string) => {
        console.log('[AgentDataChannel] Checking WebRTC peer:', peerId, 'Has channel:', this.dataChannels.has(peerId));

        // Only set up data channel if we don't already have one for this peer
        if (!this.dataChannels.has(peerId)) {
          this.setupDataChannelForPeer(peerId);
        }
      });
    });

    console.log('[AgentDataChannel] Monitoring peer connections');
  }

  /**
   * Set up agent-commands data channel for a specific peer
   */
  private setupDataChannelForPeer(peerId: string): void {
    if (!this.provider) return;

    console.log('[AgentDataChannel] setupDataChannelForPeer called for:', peerId);

    const room = (this.provider as any).room;
    if (!room || !room.webrtcConns) {
      console.warn('[AgentDataChannel] Room or webrtcConns not available');
      return;
    }

    // Get the SimplePeer connection for this peer
    const peerConn = room.webrtcConns.get(peerId);
    if (!peerConn) {
      console.warn('[AgentDataChannel] Peer connection not found:', peerId);
      console.warn('[AgentDataChannel] Available peers:', Array.from(room.webrtcConns.keys()));
      return;
    }

    // Access the underlying RTCPeerConnection
    // y-webrtc wraps SimplePeer in an object with a 'peer' property
    const simplePeer = (peerConn as any).peer;
    if (!simplePeer) {
      console.warn('[AgentDataChannel] SimplePeer not found in peerConn.peer');
      return;
    }

    // SimplePeer exposes _pc property (private, but accessible)
    const rtcPeerConnection: RTCPeerConnection = (simplePeer as any)._pc;
    if (!rtcPeerConnection) {
      console.warn('[AgentDataChannel] RTCPeerConnection not found for peer:', peerId);
      return;
    }

    console.log('[AgentDataChannel] Got RTCPeerConnection for peer:', peerId);
    console.log('[AgentDataChannel] RTCPeerConnection state:', rtcPeerConnection.connectionState);

    // User tab: Create data channel (initiator side)
    // Agent tab: Listen for data channel (receiver side)
    if (!this.isAgentMode) {
      // User tab: Create the data channel
      const dataChannel = rtcPeerConnection.createDataChannel('agent-commands', {
        ordered: true,
        maxRetransmits: 3,
      });

      this.setupDataChannelHandlers(peerId, dataChannel);
      this.dataChannels.set(peerId, dataChannel);

      console.log('[AgentDataChannel] Created data channel for peer:', peerId);
    } else {
      // Agent tab: Listen for incoming data channel
      rtcPeerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        if (dataChannel.label === 'agent-commands') {
          this.setupDataChannelHandlers(peerId, dataChannel);
          this.dataChannels.set(peerId, dataChannel);
          console.log('[AgentDataChannel] Received data channel from peer:', peerId);
        }
      };
    }
  }

  /**
   * Set up event handlers for a data channel
   */
  private setupDataChannelHandlers(peerId: string, dataChannel: RTCDataChannel): void {
    dataChannel.onopen = () => {
      console.log('[AgentDataChannel] Data channel open:', peerId);
    };

    dataChannel.onclose = () => {
      console.log('[AgentDataChannel] Data channel closed:', peerId);
      this.dataChannels.delete(peerId);
    };

    dataChannel.onerror = (error) => {
      console.error('[AgentDataChannel] Data channel error:', peerId, error);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message: AgentCommandMessage = JSON.parse(event.data);
        console.log('[AgentDataChannel] Received message from', peerId, ':', message.type);
        this.handleMessage(message);
      } catch (error) {
        console.error('[AgentDataChannel] Failed to parse message:', error);
      }
    };
  }

  /**
   * Send message to agent via data channel
   * (User tab only)
   *
   * Note: Since WebRTC peer IDs and awareness client IDs use different ID systems,
   * we broadcast to all open data channels. Only the agent tab will process the message.
   */
  private sendToAgent(message: AgentCommandMessage): void {
    if (!this.awareness) {
      throw new Error('[AgentDataChannel] Not initialized');
    }

    // Check that at least one agent exists in awareness
    const states = this.awareness.getStates();
    let hasAgent = false;

    for (const [clientId, state] of states.entries()) {
      if (state.isAgent === true) {
        hasAgent = true;
        console.log('[AgentDataChannel] Found agent in awareness:', clientId);
        break;
      }
    }

    if (!hasAgent) {
      throw new Error('[AgentDataChannel] Agent peer not found in awareness');
    }

    // Broadcast to all open data channels
    // The agent tab will receive and process it
    let sentCount = 0;
    for (const [peerId, dataChannel] of this.dataChannels.entries()) {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(message));
        sentCount++;
        console.log('[AgentDataChannel] Sent to peer:', peerId);
      }
    }

    if (sentCount === 0) {
      throw new Error('[AgentDataChannel] No open data channels found');
    }

    console.log('[AgentDataChannel] Sent to', sentCount, 'peer(s), message type:', message.type);
  }

  /**
   * Send message to user via data channel
   * (Agent tab only)
   */
  private sendToUser(message: AgentCommandMessage): void {
    // Agent tab: Send to first non-agent peer (the user who sent the request)
    // In multi-user scenarios, we'd need to track which user sent which request

    for (const [peerId, dataChannel] of this.dataChannels.entries()) {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(message));
        console.log('[AgentDataChannel] Sent to user:', peerId, message.type);
        return;
      }
    }

    console.error('[AgentDataChannel] No open data channels to send response');
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: AgentCommandMessage): void {
    if (this.isAgentMode) {
      // Agent tab: Handle requests from user
      if (message.type === 'analyze-transcript') {
        // Forward to agent message handler (set by agent.ts)
        this.messageHandler?.(message);
      }
    } else {
      // User tab: Handle responses from agent
      if (message.type === 'plan-ready') {
        this.handlePlanReady(message);
      } else if (message.type === 'agent-error') {
        this.handleAgentError(message);
      }
    }
  }

  /**
   * Set message handler for agent tab
   * (Called by agent.ts)
   */
  setMessageHandler(handler: (message: AgentCommandMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Send analyze-transcript request to agent
   * (User tab only)
   */
  async analyzeTranscript(transcript: string, documentContext: string): Promise<AgentPlan | null> {
    if (this.isAgentMode) {
      throw new Error('[AgentDataChannel] Cannot call analyzeTranscript from agent tab');
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      // Set timeout (30 seconds)
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Agent request timed out after 30 seconds'));
      }, 30000);

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Send message to agent
      try {
        this.sendToAgent({
          type: 'analyze-transcript',
          requestId,
          transcript,
          documentContext,
        });
        console.log('[AgentDataChannel] Sent analyze-transcript:', requestId);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  /**
   * Send plan-ready response to user
   * (Agent tab only)
   */
  sendPlanReady(requestId: string, plan: AgentPlan | null, error?: string): void {
    if (!this.isAgentMode) {
      throw new Error('[AgentDataChannel] Cannot call sendPlanReady from user tab');
    }

    this.sendToUser({
      type: 'plan-ready',
      requestId,
      plan,
      error,
    });
  }

  /**
   * Send agent-error response to user
   * (Agent tab only)
   */
  sendAgentError(requestId: string, error: string, details?: any): void {
    if (!this.isAgentMode) {
      throw new Error('[AgentDataChannel] Cannot call sendAgentError from user tab');
    }

    this.sendToUser({
      type: 'agent-error',
      requestId,
      error,
      details,
    });
  }

  /**
   * Handle plan-ready message (user tab)
   */
  private handlePlanReady(message: { requestId: string; plan: AgentPlan | null; error?: string }): void {
    const pending = this.pendingRequests.get(message.requestId);
    if (!pending) {
      console.warn('[AgentDataChannel] Received plan-ready for unknown request:', message.requestId);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.requestId);

    if (message.error) {
      pending.reject(new Error(message.error));
    } else {
      pending.resolve(message.plan);
    }

    console.log('[AgentDataChannel] Plan ready:', message.requestId);
  }

  /**
   * Handle agent-error message (user tab)
   */
  private handleAgentError(message: { requestId: string; error: string; details?: any }): void {
    const pending = this.pendingRequests.get(message.requestId);
    if (!pending) {
      console.warn('[AgentDataChannel] Received agent-error for unknown request:', message.requestId);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.requestId);
    pending.reject(new Error(`Agent error: ${message.error}`));

    console.error('[AgentDataChannel] Agent error:', message.error, message.details);
  }

  /**
   * Check if agent is connected
   *
   * Returns true if:
   * 1. There's at least one peer marked as agent in awareness
   * 2. We have at least one open data channel
   */
  isAgentConnected(): boolean {
    if (!this.awareness) {
      console.log('[AgentDataChannel] isAgentConnected: No awareness');
      return false;
    }

    const states = this.awareness.getStates();
    console.log('[AgentDataChannel] isAgentConnected: Checking', states.size, 'peers');

    // Check if any peer is marked as agent
    let hasAgent = false;
    for (const [clientId, state] of states.entries()) {
      console.log('[AgentDataChannel] Peer', clientId, 'isAgent:', state.isAgent);
      if (state.isAgent === true) {
        hasAgent = true;
        console.log('[AgentDataChannel] Found agent peer:', clientId);
        break;
      }
    }

    if (!hasAgent) {
      console.log('[AgentDataChannel] No agent peer found in awareness');
      return false;
    }

    // Check if we have any open data channels
    let hasOpenChannel = false;
    for (const [peerId, dataChannel] of this.dataChannels.entries()) {
      console.log('[AgentDataChannel] Data channel', peerId, 'state:', dataChannel.readyState);
      if (dataChannel.readyState === 'open') {
        hasOpenChannel = true;
        console.log('[AgentDataChannel] Found open data channel:', peerId);
      }
    }

    const isConnected = hasAgent && hasOpenChannel;
    console.log('[AgentDataChannel] Is connected:', isConnected, '(hasAgent:', hasAgent, ', hasOpenChannel:', hasOpenChannel, ')');

    return isConnected;
  }
}

// Export singleton instance (will be initialized by main.ts)
let agentDataChannelServiceInstance: AgentDataChannelService | null = null;

export function getAgentDataChannelService(): AgentDataChannelService | null {
  return agentDataChannelServiceInstance;
}

export function initializeAgentDataChannelService(
  provider: WebrtcProvider,
  awareness: Awareness,
  isAgentMode: boolean
): AgentDataChannelService {
  agentDataChannelServiceInstance = new AgentDataChannelService(isAgentMode);
  agentDataChannelServiceInstance.initialize(provider, awareness);
  return agentDataChannelServiceInstance;
}

/**
 * VideoChatService - WebRTC mesh topology video chat for 2-4 users
 *
 * Creates parallel RTCPeerConnections for video using the same signaling server
 * that y-webrtc uses, but with a separate 'video' topic.
 */

export interface VideoSignalingMessage {
  type: 'video-join' | 'video-leave' | 'video-offer' | 'video-answer' | 'video-ice';
  from: string;
  to?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  audioOnly?: boolean;
  userName?: string;
}

export interface VideoParticipant {
  peerId: string;
  userName: string;
  stream: MediaStream | null;
  audioOnly: boolean;
}

export class VideoChatService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private awareness: any;
  private clientId: string;
  private userName: string;
  private iceServers: RTCIceServer[];
  private isActive: boolean = false;
  private isAudioMuted: boolean = false;
  private isVideoMuted: boolean = false;
  private audioOnly: boolean = false;

  // Set externally - publishes to signaling WebSocket
  public publishToTopic: ((topic: string, data: any) => void) | null = null;

  // Event callbacks
  public onLocalStream?: (stream: MediaStream) => void;
  public onRemoteStream?: (peerId: string, stream: MediaStream, userName: string) => void;
  public onPeerDisconnect?: (peerId: string) => void;
  public onError?: (error: Error) => void;
  public onParticipantsChange?: (count: number) => void;

  constructor(clientId: string, userName: string, awareness: any, iceServers: RTCIceServer[]) {
    this.clientId = clientId;
    this.userName = userName;
    this.awareness = awareness;
    this.iceServers = iceServers;
    console.log('[VideoChatService] Initialized with clientId:', clientId);
  }

  /**
   * Join the video call
   */
  async join(audioOnly: boolean = false): Promise<void> {
    if (this.isActive) {
      console.log('[VideoChatService] Already in call');
      return;
    }

    this.audioOnly = audioOnly;
    console.log('[VideoChatService] Joining call, audioOnly:', audioOnly);

    try {
      // Get local media
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: audioOnly ? false : { width: 640, height: 480, facingMode: 'user' }
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[VideoChatService] Got local stream, tracks:', this.localStream.getTracks().map(t => t.kind));

      this.isActive = true;
      this.onLocalStream?.(this.localStream);

      // Update awareness to show we're in video call
      this.updateAwarenessVideoState();

      // Announce join to other participants
      this.publish({
        type: 'video-join',
        from: this.clientId,
        audioOnly: audioOnly,
        userName: this.userName
      });

      // Check for existing participants via awareness and send offers to them
      this.connectToExistingParticipants();

    } catch (error) {
      console.error('[VideoChatService] Failed to join:', error);

      // If video failed, try audio only
      if (!audioOnly && error instanceof Error && error.name === 'NotAllowedError') {
        console.log('[VideoChatService] Video permission denied, falling back to audio only');
        return this.join(true);
      }

      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Leave the video call
   */
  leave(): void {
    if (!this.isActive) return;
    console.log('[VideoChatService] Leaving call');

    // Announce leave
    this.publish({
      type: 'video-leave',
      from: this.clientId
    });

    // Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close all peer connections
    this.peerConnections.forEach((pc, peerId) => {
      pc.close();
      this.onPeerDisconnect?.(peerId);
    });
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.pendingCandidates.clear();

    this.isActive = false;
    this.isAudioMuted = false;
    this.isVideoMuted = false;

    // Update awareness
    this.updateAwarenessVideoState();
    this.onParticipantsChange?.(0);
  }

  /**
   * Handle incoming signaling messages
   */
  handleSignalingMessage(message: VideoSignalingMessage): void {
    // Ignore our own messages
    if (message.from === this.clientId) return;

    // Ignore messages not for us (if 'to' is specified)
    if (message.to && message.to !== this.clientId) return;

    console.log('[VideoChatService] Received:', message.type, 'from:', message.from);

    switch (message.type) {
      case 'video-join':
        this.handlePeerJoin(message.from, message.audioOnly || false, message.userName || 'User');
        break;
      case 'video-leave':
        this.handlePeerLeave(message.from);
        break;
      case 'video-offer':
        this.handleOffer(message.from, message.sdp!, message.userName || 'User');
        break;
      case 'video-answer':
        this.handleAnswer(message.from, message.sdp!);
        break;
      case 'video-ice':
        this.handleIceCandidate(message.from, message.candidate!);
        break;
    }
  }

  /**
   * Handle a peer joining the call
   */
  private async handlePeerJoin(peerId: string, audioOnly: boolean, userName: string): Promise<void> {
    if (!this.isActive) return;
    console.log('[VideoChatService] Peer joined:', peerId, 'audioOnly:', audioOnly);

    // Create peer connection and send offer
    await this.createPeerConnection(peerId, true, userName);
  }

  /**
   * Handle a peer leaving the call
   */
  private handlePeerLeave(peerId: string): void {
    console.log('[VideoChatService] Peer left:', peerId);

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    this.remoteStreams.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.onPeerDisconnect?.(peerId);
    this.onParticipantsChange?.(this.peerConnections.size);
  }

  /**
   * Handle incoming WebRTC offer
   */
  private async handleOffer(peerId: string, sdp: string, userName: string): Promise<void> {
    if (!this.isActive) return;
    console.log('[VideoChatService] Handling offer from:', peerId);

    // Create peer connection (don't create offer)
    const pc = await this.createPeerConnection(peerId, false, userName);

    // Set remote description
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));

    // Apply any pending ICE candidates
    await this.applyPendingCandidates(peerId, pc);

    // Create and send answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.publish({
      type: 'video-answer',
      from: this.clientId,
      to: peerId,
      sdp: answer.sdp,
      userName: this.userName
    });
  }

  /**
   * Handle incoming WebRTC answer
   */
  private async handleAnswer(peerId: string, sdp: string): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      console.warn('[VideoChatService] No peer connection for answer from:', peerId);
      return;
    }

    console.log('[VideoChatService] Handling answer from:', peerId);
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));

    // Apply any pending ICE candidates
    await this.applyPendingCandidates(peerId, pc);
  }

  /**
   * Handle incoming ICE candidate
   */
  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);

    if (!pc || !pc.remoteDescription) {
      // Queue the candidate for later
      console.log('[VideoChatService] Queueing ICE candidate for:', peerId);
      const pending = this.pendingCandidates.get(peerId) || [];
      pending.push(candidate);
      this.pendingCandidates.set(peerId, pending);
      return;
    }

    console.log('[VideoChatService] Adding ICE candidate from:', peerId);
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Apply pending ICE candidates to a peer connection
   */
  private async applyPendingCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const pending = this.pendingCandidates.get(peerId);
    if (pending && pending.length > 0) {
      console.log('[VideoChatService] Applying', pending.length, 'pending ICE candidates for:', peerId);
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.delete(peerId);
    }
  }

  /**
   * Create a peer connection for a remote peer
   */
  private async createPeerConnection(peerId: string, createOffer: boolean, userName: string): Promise<RTCPeerConnection> {
    // Close existing connection if any
    const existing = this.peerConnections.get(peerId);
    if (existing) {
      existing.close();
    }

    console.log('[VideoChatService] Creating peer connection for:', peerId, 'createOffer:', createOffer);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(peerId, pc);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.publish({
          type: 'video-ice',
          from: this.clientId,
          to: peerId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('[VideoChatService] Received track from:', peerId, 'kind:', event.track.kind);
      const stream = event.streams[0];
      if (stream) {
        this.remoteStreams.set(peerId, stream);
        this.onRemoteStream?.(peerId, stream, userName);
        this.onParticipantsChange?.(this.peerConnections.size);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[VideoChatService] Connection state for', peerId, ':', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.handlePeerLeave(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[VideoChatService] ICE state for', peerId, ':', pc.iceConnectionState);
    };

    // Create and send offer if we're the initiator
    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.publish({
        type: 'video-offer',
        from: this.clientId,
        to: peerId,
        sdp: offer.sdp,
        userName: this.userName
      });
    }

    return pc;
  }

  /**
   * Connect to peers already in the call (discovered via awareness)
   */
  private connectToExistingParticipants(): void {
    if (!this.awareness) return;

    const states = this.awareness.getStates();
    states.forEach((state: any, clientId: number) => {
      const peerId = String(clientId);
      if (peerId === this.clientId) return;

      // Check if this peer is in a video call
      if (state?.user?.videoState?.inCall) {
        console.log('[VideoChatService] Found existing participant:', peerId);
        // We already sent video-join, they will send us an offer
      }
    });
  }

  /**
   * Update awareness with current video state
   */
  private updateAwarenessVideoState(): void {
    if (!this.awareness) return;

    const currentState = this.awareness.getLocalState();
    this.awareness.setLocalStateField('user', {
      ...currentState?.user,
      videoState: {
        inCall: this.isActive,
        isAudioEnabled: !this.isAudioMuted,
        isVideoEnabled: !this.isVideoMuted && !this.audioOnly,
        audioOnly: this.audioOnly
      }
    });
  }

  /**
   * Publish a signaling message
   */
  private publish(message: VideoSignalingMessage): void {
    if (!this.publishToTopic) {
      console.warn('[VideoChatService] No publish function set');
      return;
    }
    this.publishToTopic('video', message);
  }

  /**
   * Toggle audio mute
   */
  toggleMute(): boolean {
    if (!this.localStream) return this.isAudioMuted;

    this.isAudioMuted = !this.isAudioMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isAudioMuted;
    });

    this.updateAwarenessVideoState();
    console.log('[VideoChatService] Audio muted:', this.isAudioMuted);
    return this.isAudioMuted;
  }

  /**
   * Toggle video mute
   */
  toggleVideo(): boolean {
    if (!this.localStream || this.audioOnly) return this.isVideoMuted;

    this.isVideoMuted = !this.isVideoMuted;
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = !this.isVideoMuted;
    });

    this.updateAwarenessVideoState();
    console.log('[VideoChatService] Video muted:', this.isVideoMuted);
    return this.isVideoMuted;
  }

  /**
   * Check if currently in a call
   */
  isInCall(): boolean {
    return this.isActive;
  }

  /**
   * Check if audio is muted
   */
  isAudioEnabled(): boolean {
    return !this.isAudioMuted;
  }

  /**
   * Check if video is enabled
   */
  isVideoEnabled(): boolean {
    return !this.isVideoMuted && !this.audioOnly;
  }

  /**
   * Check if audio-only mode
   */
  isAudioOnlyMode(): boolean {
    return this.audioOnly;
  }

  /**
   * Get local stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Get number of remote participants
   */
  getParticipantCount(): number {
    return this.peerConnections.size;
  }

  /**
   * Clean up on destroy
   */
  destroy(): void {
    this.leave();
    this.publishToTopic = null;
    this.onLocalStream = undefined;
    this.onRemoteStream = undefined;
    this.onPeerDisconnect = undefined;
    this.onError = undefined;
    this.onParticipantsChange = undefined;
  }
}

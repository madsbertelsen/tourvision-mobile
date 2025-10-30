/**
 * Y.js provider for WebRTC P2P collaboration
 *
 * This provider connects Y.js documents via WebRTC for real-time P2P collaboration.
 * It handles:
 * - P2P connections via WebRTC
 * - Signaling via public y-webrtc servers
 * - Awareness protocol for cursor/presence tracking
 * - Initial sync from Supabase database
 * - Periodic persistence to Supabase database
 */

import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { SupabaseClient } from '@supabase/supabase-js';

export interface YWebRTCProviderConfig {
  /** Supabase client instance */
  supabase: SupabaseClient;
  /** Trip/document ID */
  documentId: string;
  /** User ID for awareness */
  userId: string;
  /** User name for awareness */
  userName: string;
  /** Auto-save interval in ms (default: 30000 = 30s) */
  autoSaveInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom signaling servers (optional) */
  signalingServers?: string[];
}

export class YWebRTCProvider {
  private ydoc: Y.Doc;
  private supabase: SupabaseClient;
  private documentId: string;
  private userId: string;
  private userName: string;
  private provider: WebrtcProvider;

  private synced: boolean = false;
  private autoSaveInterval: number;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private debug: boolean;

  // Event emitter support
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor(ydoc: Y.Doc, config: YWebRTCProviderConfig) {
    this.ydoc = ydoc;
    this.supabase = config.supabase;
    this.documentId = config.documentId;
    this.userId = config.userId;
    this.userName = config.userName;
    this.autoSaveInterval = config.autoSaveInterval || 30000;
    this.debug = config.debug || false;

    this.log('YWebRTCProvider initialized for document:', this.documentId);

    // Create WebRTC provider
    // Room name includes 'tourvision-' prefix to avoid collisions with other apps
    const roomName = `tourvision-${this.documentId}`;

    this.provider = new WebrtcProvider(roomName, ydoc, {
      signaling: config.signalingServers || [
        'wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com',
      ],
      // Password for room (optional - use document ID as password for basic security)
      password: this.documentId,
      // Awareness is automatically created by WebrtcProvider
      awareness: undefined, // Let provider create it
      // Max connections (optional)
      maxConns: 20,
      // Filter connections (optional)
      filterBcConns: true,
      // Peer options (optional WebRTC config)
      peerOpts: {},
    });

    // Set local awareness state
    this.provider.awareness.setLocalStateField('user', {
      id: this.userId,
      name: this.userName,
      color: this.getRandomColor(),
    });

    // Setup event listeners
    this.setupEventListeners();

    // Initial sync from database
    this.sync();
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[YWebRTCProvider]', ...args);
    }
  }

  private getRandomColor(): string {
    const colors = [
      '#3B82F6', // blue
      '#8B5CF6', // purple
      '#10B981', // green
      '#F59E0B', // amber
      '#EF4444', // red
      '#EC4899', // pink
      '#06B6D4', // cyan
      '#84CC16', // lime
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Setup event listeners for WebRTC provider
   */
  private setupEventListeners() {
    // Synced event
    this.provider.on('synced', (synced: boolean) => {
      this.log('Sync status changed:', synced);
      this.synced = synced;

      if (synced) {
        this.emit('synced', { synced: true });

        // Start auto-save when first synced
        if (!this.autoSaveTimer) {
          this.startAutoSave();
        }
      } else {
        this.emit('synced', { synced: false });
      }
    });

    // Peers changed event
    this.provider.on('peers', (event: any) => {
      this.log('Peers changed:', {
        added: event.added,
        removed: event.removed,
        webrtcPeers: event.webrtcPeers,
      });
    });

    // Connection status
    this.provider.on('status', (event: any) => {
      this.log('Connection status:', event);
    });

    // Awareness changes (users joining/leaving)
    this.provider.awareness.on('change', () => {
      const users = this.getConnectedUsers();
      this.log('Connected users changed:', users.length);
      this.emit('awareness', { users });
    });
  }

  /**
   * Sync initial state from Supabase database
   */
  private async sync() {
    this.log('Loading initial state from database');

    try {
      const { data, error } = await this.supabase
        .from('trips')
        .select('yjs_state, yjs_clock')
        .eq('id', this.documentId)
        .single();

      if (error) {
        console.error('[YWebRTCProvider] Error loading state:', error);
        // Continue anyway - document might be new
        return;
      }

      if (data?.yjs_state) {
        this.log('Applying initial state, clock:', data.yjs_clock);

        // Handle different formats from Supabase client
        let state: Uint8Array;

        if (typeof data.yjs_state === 'string') {
          // Base64 encoded string
          this.log('Y.js state is base64 string, decoding...');
          state = this.base64ToUint8Array(data.yjs_state);
        } else if (data.yjs_state instanceof Uint8Array) {
          // Already a Uint8Array
          this.log('Y.js state is already Uint8Array');
          state = data.yjs_state;
        } else if (Array.isArray(data.yjs_state)) {
          // Array of bytes
          this.log('Y.js state is array, converting...');
          state = new Uint8Array(data.yjs_state);
        } else if (data.yjs_state instanceof ArrayBuffer) {
          // ArrayBuffer
          this.log('Y.js state is ArrayBuffer, converting...');
          state = new Uint8Array(data.yjs_state);
        } else {
          console.error('[YWebRTCProvider] Unknown yjs_state format:', typeof data.yjs_state);
          return;
        }

        this.log('Applying Y.js state, size:', state.length);
        Y.applyUpdate(this.ydoc, state, 'database');
      } else {
        this.log('No initial state found, document is empty');
      }
    } catch (error) {
      console.error('[YWebRTCProvider] Error in sync:', error);
    }
  }

  /**
   * Persist current document state to database
   */
  async persist(): Promise<boolean> {
    this.log('Persisting state to database');

    try {
      const state = Y.encodeStateAsUpdate(this.ydoc);
      const clock = this.ydoc.store.clients.size;

      // Convert to base64 for storage
      const base64State = this.uint8ArrayToBase64(state);

      const { error } = await this.supabase
        .from('trips')
        .update({
          yjs_state: base64State,
          yjs_clock: clock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.documentId);

      if (error) {
        console.error('[YWebRTCProvider] Error persisting state:', error);
        return false;
      }

      this.log('State persisted successfully');
      this.emit('persisted', { success: true });
      return true;
    } catch (error) {
      console.error('[YWebRTCProvider] Error in persist:', error);
      this.emit('persisted', { success: false, error });
      return false;
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      if (this.synced) {
        this.persist();
      }
    }, this.autoSaveInterval);

    this.log('Auto-save started, interval:', this.autoSaveInterval, 'ms');
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.log('Auto-save stopped');
  }

  /**
   * Disconnect and cleanup
   */
  async destroy() {
    this.log('Destroying provider');

    // Final persist before disconnecting
    if (this.synced) {
      await this.persist();
    }

    // Stop auto-save
    this.stopAutoSave();

    // Destroy WebRTC provider
    if (this.provider) {
      this.provider.destroy();
    }

    this.synced = false;
    this.emit('destroyed', {});

    this.log('Provider destroyed');
  }

  /**
   * Event emitter support
   */
  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: Function) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[YWebRTCProvider] Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Get sync status
   */
  get isSynced(): boolean {
    return this.synced;
  }

  /**
   * Get awareness instance (for direct access)
   */
  get awareness() {
    return this.provider.awareness;
  }

  /**
   * Get connected users from awareness
   */
  getConnectedUsers(): any[] {
    const users: any[] = [];
    this.provider.awareness.getStates().forEach((state, clientId) => {
      if (state.user && clientId !== this.ydoc.clientID) {
        users.push({
          clientId,
          ...state.user,
        });
      }
    });
    return users;
  }

  /**
   * Get number of connected peers
   */
  get connectedPeers(): number {
    return this.provider.room?.webrtcConns?.size || 0;
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

/**
 * Y.js provider for Supabase Realtime
 *
 * This provider connects Y.js documents to Supabase Realtime for real-time collaboration.
 * It handles:
 * - Broadcasting Y.js updates via Supabase Realtime channels
 * - Receiving updates from other clients
 * - Awareness protocol for cursor/presence tracking
 * - Initial sync from database
 * - Periodic persistence to database
 */

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export interface YSupabaseProviderConfig {
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
}

export class YSupabaseProvider {
  private ydoc: Y.Doc;
  private supabase: SupabaseClient;
  private documentId: string;
  private userId: string;
  private userName: string;
  private channel: RealtimeChannel | null = null;
  public awareness: awarenessProtocol.Awareness;

  private synced: boolean = false;
  private autoSaveInterval: number;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private debug: boolean;

  // Event emitter support
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor(ydoc: Y.Doc, config: YSupabaseProviderConfig) {
    this.ydoc = ydoc;
    this.supabase = config.supabase;
    this.documentId = config.documentId;
    this.userId = config.userId;
    this.userName = config.userName;
    this.autoSaveInterval = config.autoSaveInterval || 30000;
    this.debug = config.debug || false;

    // Create awareness instance
    this.awareness = new awarenessProtocol.Awareness(ydoc);

    // Set local awareness state
    this.awareness.setLocalStateField('user', {
      id: this.userId,
      name: this.userName,
      color: this.getRandomColor(),
    });

    this.log('YSupabaseProvider initialized');
    this.connect();
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[YSupabaseProvider]', ...args);
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
   * Connect to Supabase Realtime channel
   */
  private async connect() {
    this.log('Connecting to channel:', `doc:${this.documentId}`);

    // Create trip-specific channel
    this.channel = this.supabase.channel(`doc:${this.documentId}`, {
      config: {
        broadcast: { self: false }, // Don't receive our own broadcasts
      },
    });

    // Listen for Y.js updates from other clients
    this.channel.on('broadcast', { event: 'yjs-update' }, (payload: any) => {
      this.log('Received yjs-update from remote');
      try {
        let update: Uint8Array;

        // Supabase Realtime wraps the payload in a nested structure
        // The actual data is in payload.payload.update
        const updateData = payload.payload?.update || payload.update;

        if (!updateData) {
          console.error('[YSupabaseProvider] No update in payload:', payload);
          return;
        }

        // Handle both base64 (new) and array (old) formats for backward compatibility
        if (typeof updateData === 'string') {
          // New format: base64 string
          update = this.base64ToUint8Array(updateData);
        } else if (Array.isArray(updateData)) {
          // Old format: array (backward compatibility)
          update = new Uint8Array(updateData);
        } else {
          console.error('[YSupabaseProvider] Unknown update format:', typeof updateData);
          return;
        }

        Y.applyUpdate(this.ydoc, update, 'remote');
      } catch (error) {
        console.error('[YSupabaseProvider] Error applying update:', error);
      }
    });

    // Listen for awareness updates (cursors, presence)
    this.channel.on('broadcast', { event: 'awareness' }, (payload: any) => {
      this.log('Received awareness update');
      try {
        let update: Uint8Array;

        // Supabase Realtime wraps the payload in a nested structure
        const updateData = payload.payload?.update || payload.update;

        if (!updateData) {
          console.error('[YSupabaseProvider] No awareness update in payload');
          return;
        }

        // Handle both base64 (new) and array (old) formats for backward compatibility
        if (typeof updateData === 'string') {
          // New format: base64 string
          update = this.base64ToUint8Array(updateData);
        } else if (Array.isArray(updateData)) {
          // Old format: array (backward compatibility)
          update = new Uint8Array(updateData);
        } else {
          console.error('[YSupabaseProvider] Unknown awareness format:', typeof updateData);
          return;
        }

        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          update,
          'remote'
        );
      } catch (error) {
        console.error('[YSupabaseProvider] Error applying awareness:', error);
      }
    });

    // Subscribe to channel
    this.channel.subscribe(async (status) => {
      this.log('Channel status:', status);

      if (status === 'SUBSCRIBED') {
        this.log('Channel subscribed, syncing...');
        await this.sync();
        this.synced = true;
        this.emit('synced', { synced: true });

        // Start auto-save
        this.startAutoSave();
      }

      if (status === 'CLOSED') {
        this.log('Channel closed');
        this.synced = false;
        this.emit('synced', { synced: false });
      }
    });

    // Broadcast local Y.js updates
    this.ydoc.on('update', this.handleLocalUpdate);

    // Broadcast awareness changes
    this.awareness.on('change', this.handleAwarenessChange);

    this.log('Connected to Supabase Realtime');
  }

  /**
   * Handle local Y.js document updates
   */
  private handleLocalUpdate = (update: Uint8Array, origin: any) => {
    // Don't broadcast updates that came from remote
    if (origin === 'remote') return;

    this.log('Broadcasting local update, size:', update.length);

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'yjs-update',
        payload: {
          update: this.uint8ArrayToBase64(update),
        },
      });
    }
  };

  /**
   * Handle awareness changes (cursor position, etc.)
   */
  private handleAwarenessChange = () => {
    const states = Array.from(this.awareness.getStates().keys());
    const update = awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      [this.ydoc.clientID]
    );

    this.log('Broadcasting awareness update');

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'awareness',
        payload: {
          update: this.uint8ArrayToBase64(update),
        },
      });
    }
  };

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
        console.error('[YSupabaseProvider] Error loading state:', error);
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
          console.error('[YSupabaseProvider] Unknown yjs_state format:', typeof data.yjs_state);
          return;
        }

        this.log('Applying Y.js state, size:', state.length);
        Y.applyUpdate(this.ydoc, state, 'remote');
      } else {
        this.log('No initial state found, document is empty');
      }

      // TODO: Load incremental updates from yjs_updates table
      // This would allow catching up on changes since last snapshot

    } catch (error) {
      console.error('[YSupabaseProvider] Error in sync:', error);
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

      const { error } = await this.supabase
        .from('trips')
        .update({
          yjs_state: state,
          yjs_clock: clock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.documentId);

      if (error) {
        console.error('[YSupabaseProvider] Error persisting state:', error);
        return false;
      }

      this.log('State persisted successfully');
      this.emit('persisted', { success: true });
      return true;
    } catch (error) {
      console.error('[YSupabaseProvider] Error in persist:', error);
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

    // Unsubscribe from channel first
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    // Remove event listeners before destroying awareness
    this.ydoc.off('update', this.handleLocalUpdate);
    this.awareness.off('change', this.handleAwarenessChange);

    // Destroy awareness (this may trigger final events)
    try {
      this.awareness.destroy();
    } catch (error) {
      // Ignore errors during awareness destruction
      console.warn('[YSupabaseProvider] Error destroying awareness:', error);
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
          console.error(`[YSupabaseProvider] Error in ${event} handler:`, error);
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
   * Get connected users from awareness
   */
  getConnectedUsers(): any[] {
    const users: any[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
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

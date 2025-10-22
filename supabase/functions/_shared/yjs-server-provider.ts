/**
 * Server-side Y.js provider for Supabase Realtime (Edge Function)
 *
 * This is a simplified version of YSupabaseProvider for use in Deno Edge Functions.
 * It allows the AI to participate as a collaborator in the same Y.js document.
 */

import * as Y from 'npm:yjs@13.6.18';
import { createClient, SupabaseClient, RealtimeChannel } from 'https://esm.sh/@supabase/supabase-js@2';

export interface YServerProviderConfig {
  /** Supabase client instance */
  supabase: SupabaseClient;
  /** Trip/document ID */
  documentId: string;
  /** User ID for awareness (use 'ai-assistant' for AI) */
  userId: string;
  /** User name (use 'AI Assistant' for AI) */
  userName: string;
  /** Enable debug logging */
  debug?: boolean;
}

export class YServerProvider {
  private ydoc: Y.Doc;
  private supabase: SupabaseClient;
  private documentId: string;
  private userId: string;
  private userName: string;
  private channel: RealtimeChannel | null = null;
  private debug: boolean;
  private synced: boolean = false;

  constructor(ydoc: Y.Doc, config: YServerProviderConfig) {
    this.ydoc = ydoc;
    this.supabase = config.supabase;
    this.documentId = config.documentId;
    this.userId = config.userId;
    this.userName = config.userName;
    this.debug = config.debug || false;

    this.log('YServerProvider initialized for document:', this.documentId);
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[YServerProvider]', ...args);
    }
  }

  /**
   * Connect to Supabase Realtime channel and sync document
   */
  async connect(): Promise<void> {
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

        // Handle both base64 (new) and array (old) formats for backward compatibility
        if (typeof payload.update === 'string') {
          // New format: base64 string
          update = this.base64ToUint8Array(payload.update);
        } else if (Array.isArray(payload.update)) {
          // Old format: array (backward compatibility)
          update = new Uint8Array(payload.update);
        } else {
          console.error('[YServerProvider] Unknown update format:', typeof payload.update);
          return;
        }

        Y.applyUpdate(this.ydoc, update, 'remote');
      } catch (error) {
        console.error('[YServerProvider] Error applying update:', error);
      }
    });

    // Subscribe to channel and wait for it to be ready
    await new Promise<void>((resolve, reject) => {
      this.channel!.subscribe(async (status) => {
        this.log('Channel status:', status);

        if (status === 'SUBSCRIBED') {
          this.log('Channel subscribed, syncing...');
          try {
            await this.sync();
            this.synced = true;
            this.log('Sync complete, provider ready');
            resolve();
          } catch (error) {
            reject(error);
          }
        }

        if (status === 'CLOSED') {
          this.log('Channel closed');
          this.synced = false;
        }

        if (status === 'CHANNEL_ERROR') {
          reject(new Error('Channel subscription failed'));
        }
      });
    });

    // Broadcast local Y.js updates
    this.ydoc.on('update', this.handleLocalUpdate);

    this.log('Connected and synced');
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
        console.error('[YServerProvider] Error loading state:', error);
        throw error;
      }

      if (data?.yjs_state) {
        this.log('Applying initial state, clock:', data.yjs_clock);

        // Debug: Log what we actually received
        this.log('Y.js state type:', typeof data.yjs_state);
        this.log('Y.js state constructor:', data.yjs_state?.constructor?.name);
        if (typeof data.yjs_state === 'string') {
          this.log('Y.js state string preview:', data.yjs_state.substring(0, 100));
        }

        // Handle different formats from Supabase client
        let state: Uint8Array;

        if (data.yjs_state instanceof Uint8Array) {
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
        } else if (typeof data.yjs_state === 'string') {
          // Could be base64 or hex-encoded
          this.log('Y.js state is string, attempting to decode...');

          // Check if it looks like hex (starts with \x)
          if (data.yjs_state.startsWith('\\x')) {
            this.log('Y.js state appears to be hex-encoded');
            // PostgreSQL bytea format: \x followed by hex
            const hex = data.yjs_state.substring(2);
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
              bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            }
            state = bytes;
          } else {
            // Try base64
            this.log('Y.js state appears to be base64');
            state = this.base64ToUint8Array(data.yjs_state);
          }
        } else {
          console.error('[YServerProvider] Unknown yjs_state format:', typeof data.yjs_state);
          throw new Error('Unknown yjs_state format');
        }

        this.log('Applying Y.js state, size:', state.length);
        Y.applyUpdate(this.ydoc, state, 'remote');
      } else {
        this.log('No initial state found, document is empty');
      }
    } catch (error) {
      console.error('[YServerProvider] Error in sync:', error);
      throw error;
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
        console.error('[YServerProvider] Error persisting state:', error);
        return false;
      }

      this.log('State persisted successfully');
      return true;
    } catch (error) {
      console.error('[YServerProvider] Error in persist:', error);
      return false;
    }
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

    // Remove event listeners
    this.ydoc.off('update', this.handleLocalUpdate);

    // Unsubscribe from channel
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.synced = false;

    this.log('Provider destroyed');
  }

  /**
   * Get sync status
   */
  get isSynced(): boolean {
    return this.synced;
  }

  /**
   * Get the Y.js document
   */
  getDoc(): Y.Doc {
    return this.ydoc;
  }

  /**
   * Convert Uint8Array to base64 string (Deno-compatible)
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
   * Convert base64 string to Uint8Array (Deno-compatible)
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

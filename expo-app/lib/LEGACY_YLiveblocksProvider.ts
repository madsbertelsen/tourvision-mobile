/**
 * Y.js provider for Liveblocks
 *
 * This provider connects Y.js documents to Liveblocks for real-time collaboration.
 * It handles:
 * - Real-time syncing via Liveblocks
 * - Awareness protocol for cursor/presence tracking
 * - Automatic persistence to Liveblocks storage
 * - Fallback persistence to Supabase
 */

import * as Y from 'yjs';
import { LiveblocksProvider } from '@liveblocks/yjs';
import { Room } from '@liveblocks/client';
import { SupabaseClient } from '@supabase/supabase-js';

export interface YLiveblocksProviderConfig {
  /** Liveblocks room instance */
  room: Room;
  /** Supabase client instance (for fallback persistence) */
  supabase: SupabaseClient;
  /** Trip/document ID */
  documentId: string;
  /** User ID for awareness */
  userId: string;
  /** User name for awareness */
  userName: string;
  /** Auto-save to Supabase interval in ms (default: 60000 = 1 min) */
  autoSaveInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export class YLiveblocksProvider {
  private ydoc: Y.Doc;
  private room: Room;
  private provider: LiveblocksProvider<any, any, any, any>;
  private supabase: SupabaseClient;
  private documentId: string;
  private userId: string;
  private userName: string;

  private synced: boolean = false;
  private autoSaveInterval: number;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private debug: boolean;

  // Event emitter support
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor(ydoc: Y.Doc, config: YLiveblocksProviderConfig) {
    this.ydoc = ydoc;
    this.room = config.room;
    this.supabase = config.supabase;
    this.documentId = config.documentId;
    this.userId = config.userId;
    this.userName = config.userName;
    this.autoSaveInterval = config.autoSaveInterval || 60000; // 1 minute
    this.debug = config.debug || false;

    this.log('YLiveblocksProvider initialized for document:', this.documentId);

    // Create Liveblocks Y.js provider
    this.provider = new LiveblocksProvider(this.room, ydoc);

    // Set local awareness state
    this.provider.awareness.setLocalStateField('user', {
      id: this.userId,
      name: this.userName,
      color: this.getRandomColor(),
    });

    // Setup event listeners
    this.setupEventListeners();

    // Load initial state from Supabase
    this.loadInitialState();
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[YLiveblocksProvider]', ...args);
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
   * Setup event listeners for Liveblocks provider
   */
  private setupEventListeners() {
    // Synced event
    this.provider.on('sync', (synced: boolean) => {
      this.log('Sync status changed:', synced);
      this.synced = synced;

      if (synced) {
        this.emit('synced', { synced: true });

        // Start auto-save to Supabase when first synced
        if (!this.autoSaveTimer) {
          this.startAutoSave();
        }
      } else {
        this.emit('synced', { synced: false });
      }
    });

    // Status event
    this.provider.on('status', ({ status }: any) => {
      this.log('Connection status:', status);
      this.emit('status', { status });
    });

    // Awareness changes (users joining/leaving)
    this.provider.awareness.on('change', () => {
      const users = this.getConnectedUsers();
      this.log('Connected users changed:', users.length);
      this.emit('awareness', { users });
    });
  }

  /**
   * Load initial state from Supabase (if Liveblocks doesn't have it)
   */
  private async loadInitialState() {
    // Wait a bit for Liveblocks to sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if document is empty
    const isEmpty = this.ydoc.share.size === 0;

    if (!isEmpty) {
      this.log('Document already has content from Liveblocks');
      return;
    }

    this.log('Loading initial state from Supabase');

    try {
      const { data, error } = await this.supabase
        .from('trips')
        .select('yjs_state, yjs_clock')
        .eq('id', this.documentId)
        .single();

      if (error) {
        console.error('[YLiveblocksProvider] Error loading state:', error);
        return;
      }

      if (data?.yjs_state) {
        this.log('Applying initial state from Supabase, clock:', data.yjs_clock);

        let state: Uint8Array;

        if (typeof data.yjs_state === 'string') {
          state = this.base64ToUint8Array(data.yjs_state);
        } else if (data.yjs_state instanceof Uint8Array) {
          state = data.yjs_state;
        } else if (Array.isArray(data.yjs_state)) {
          state = new Uint8Array(data.yjs_state);
        } else if (data.yjs_state instanceof ArrayBuffer) {
          state = new Uint8Array(data.yjs_state);
        } else {
          console.error('[YLiveblocksProvider] Unknown yjs_state format:', typeof data.yjs_state);
          return;
        }

        this.log('Applying Y.js state from Supabase, size:', state.length);
        Y.applyUpdate(this.ydoc, state, 'supabase');
      } else {
        this.log('No initial state found in Supabase');
      }
    } catch (error) {
      console.error('[YLiveblocksProvider] Error loading initial state:', error);
    }
  }

  /**
   * Persist current document state to Supabase (backup)
   */
  async persist(): Promise<boolean> {
    this.log('Persisting state to Supabase');

    try {
      const state = Y.encodeStateAsUpdate(this.ydoc);
      const clock = this.ydoc.store.clients.size;
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
        console.error('[YLiveblocksProvider] Error persisting state:', error);
        return false;
      }

      this.log('State persisted to Supabase successfully');
      this.emit('persisted', { success: true });
      return true;
    } catch (error) {
      console.error('[YLiveblocksProvider] Error in persist:', error);
      this.emit('persisted', { success: false, error });
      return false;
    }
  }

  /**
   * Start auto-save timer (backup to Supabase)
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

    this.log('Auto-save to Supabase started, interval:', this.autoSaveInterval, 'ms');
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

    // Destroy Liveblocks provider
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
          console.error(`[YLiveblocksProvider] Error in ${event} handler:`, error);
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

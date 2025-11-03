/**
 * YjsRoom - PartyKit-powered Durable Object for Y.js document collaboration
 *
 * This uses PartyKit's YPartyKitServer which handles:
 * - Y.js sync protocol
 * - WebSocket management with reconnection/buffering
 * - State persistence to Durable Object storage
 * - Broadcasting updates to all connected clients
 * - Awareness protocol for cursor/presence
 *
 * Migration from custom implementation: 250 lines → 30 lines
 */

import type * as Party from "partyserver";
import { YServer } from "y-partyserver";

export class YjsRoom extends YServer {
  constructor(readonly room: Party.Room) {
    super(room);
  }

  /**
   * Lifecycle hook: Called when server starts
   * Good place for initialization logic
   */
  async onStart() {
    console.log('[YjsRoom] PartyKit server started for room:', this.room.id);
  }

  /**
   * Lifecycle hook: Called before a connection is established
   * Use this for authentication
   */
  async onBeforeConnect(request: Party.Request): Promise<Party.Request | Response> {
    // Extract token from URL query params
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      console.warn('[YjsRoom] Connection rejected: No token provided');
      return new Response('Authentication required', { status: 401 });
    }

    // TODO: Verify JWT token here
    // For now, we'll accept any token (replace with actual JWT verification)
    console.log('[YjsRoom] Connection authenticated for room:', this.room.id);

    return request;
  }

  /**
   * Lifecycle hook: Called when a connection is established
   */
  async onConnect(connection: Party.Connection) {
    console.log('[YjsRoom] Client connected:', connection.id);
    console.log('[YjsRoom] Total connections:', [...this.room.getConnections()].length);
  }

  /**
   * Lifecycle hook: Called when a connection closes
   */
  async onClose(connection: Party.Connection) {
    console.log('[YjsRoom] Client disconnected:', connection.id);
    console.log('[YjsRoom] Remaining connections:', [...this.room.getConnections()].length);
  }

  /**
   * Lifecycle hook: Called when an error occurs
   */
  async onError(connection: Party.Connection, error: Error) {
    console.error('[YjsRoom] Error for connection', connection.id, ':', error);
  }
}

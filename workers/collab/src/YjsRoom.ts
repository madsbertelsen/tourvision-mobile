/**
 * YjsRoom - PartyKit-powered Durable Object for Y.js document collaboration with persistence
 *
 * Extends PartyKit's YServer to add:
 * - Persistent storage of Y.js documents in Durable Objects
 * - Automatic save after edits (debounced)
 * - Automatic load on room initialization
 * - Y.js sync protocol
 * - WebSocket management with reconnection/buffering
 * - Broadcasting updates to all connected clients
 * - Awareness protocol for cursor/presence
 */

import { YServer } from "y-partyserver";
import * as Y from "yjs";

export class YjsRoom extends YServer {
  /**
   * onLoad - Load persisted document state from Durable Object storage
   * Called when the room is first initialized
   */
  async onLoad() {
    console.log(`[YjsRoom] Loading document: ${this.name}`);

    try {
      // Retrieve the document from Durable Object storage
      const storedDoc = await this.ctx.storage.get<Uint8Array>(`doc:${this.name}`);

      if (storedDoc) {
        // Apply the persisted state to the Y.js document
        Y.applyUpdate(this.document, storedDoc);
        console.log(`[YjsRoom] Document ${this.name} loaded from storage (${storedDoc.length} bytes)`);
      } else {
        console.log(`[YjsRoom] Document ${this.name} is new (no stored state)`);
      }
    } catch (error) {
      console.error(`[YjsRoom] Error loading document ${this.name}:`, error);
    }
  }

  /**
   * onSave - Persist document state to Durable Object storage
   * Called automatically after edits (debounced) and when room empties
   */
  async onSave() {
    console.log(`[YjsRoom] Saving document: ${this.name}`);

    try {
      // Encode the current Y.js document state as a binary update
      const update = Y.encodeStateAsUpdate(this.document);

      // Store it in Durable Object storage
      await this.ctx.storage.put(`doc:${this.name}`, update);

      console.log(`[YjsRoom] Document ${this.name} saved to storage (${update.length} bytes)`);
    } catch (error) {
      console.error(`[YjsRoom] Error saving document ${this.name}:`, error);
    }
  }
}

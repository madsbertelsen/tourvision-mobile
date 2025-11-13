import type { Connection } from "partyserver";
import { routePartykitRequest } from "partyserver";
import * as Y from "yjs";
import { YServer } from "../y-partyserver"; // "y-partyserver";
import type { CallbackOptions } from "../y-partyserver"; //"y-partyserver";

// Import Supabase client for Cloudflare Workers
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Env = {
  Document: DurableObjectNamespace<YServer>;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
};

export class Document extends YServer<Env> {
  // This is optional, but it allows you to configure the callback options
  static callbackOptions: CallbackOptions = {
    debounceWait: 1000,
    debounceMaxWait: 10000,
    timeout: 10000
  };

  // Track connected users for activity detection
  private userCount = 0;
  private supabase: SupabaseClient | null = null;
  private idleTimeoutId: number | null = null;

  async onStart() {
    console.log("onStart", this.name);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, content BLOB)"
    );

    // Initialize Supabase client
    if (this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(
        this.env.SUPABASE_URL,
        this.env.SUPABASE_SERVICE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );
      console.log("[DO] Supabase client initialized");
    } else {
      console.warn("[DO] Supabase credentials not configured");
    }

    return super.onStart();
  }

  async onConnect(connection: Connection) {
    await super.onConnect(connection);
    this.userCount++;

    console.log(`[DO] User connected to ${this.name} (count: ${this.userCount})`);

    // Cancel any pending idle timeout
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
      console.log(`[DO] Cancelled idle timeout for ${this.name}`);
    }

    // First user joined - document became active
    if (this.userCount === 1 && this.supabase) {
      try {
        const { error } = await this.supabase
          .from('document_activity')
          .insert({
            document_id: this.name,
            event_type: 'active',
            user_count: this.userCount
          });

        if (error) {
          console.error(`[DO] Failed to log active event:`, error);
        } else {
          console.log(`[DO] ✅ Document ${this.name} became ACTIVE`);
        }
      } catch (error) {
        console.error(`[DO] Error writing to Supabase:`, error);
      }
    }
  }

  async onDisconnect(connection: Connection) {
    await super.onDisconnect(connection);
    this.userCount = Math.max(0, this.userCount - 1);

    console.log(`[DO] User disconnected from ${this.name} (count: ${this.userCount})`);

    // Last user left - schedule idle notification
    if (this.userCount === 0 && this.supabase) {
      console.log(`[DO] Starting 30s idle timeout for ${this.name}`);

      // Cancel any previous timeout
      if (this.idleTimeoutId !== null) {
        clearTimeout(this.idleTimeoutId);
      }

      // Schedule idle notification after 30 seconds
      this.idleTimeoutId = setTimeout(async () => {
        // Double-check that no users reconnected
        if (this.userCount === 0 && this.supabase) {
          try {
            const { error } = await this.supabase
              .from('document_activity')
              .insert({
                document_id: this.name,
                event_type: 'idle',
                user_count: 0
              });

            if (error) {
              console.error(`[DO] Failed to log idle event:`, error);
            } else {
              console.log(`[DO] ✅ Document ${this.name} became IDLE`);
            }
          } catch (error) {
            console.error(`[DO] Error writing to Supabase:`, error);
          }
        }
        this.idleTimeoutId = null;
      }, 30000) as unknown as number; // 30 second grace period
    }
  }
  async onLoad() {
    console.log("onLoad", this.name);
    // load a document from a database, or some remote resource
    // and apply it on to the Yjs document instance at `this.document`
    const document = [
      ...this.ctx.storage.sql.exec(
        "SELECT * FROM documents WHERE id = ? LIMIT 1",
        this.name
      )
    ][0];

    if (document) {
      Y.applyUpdate(
        this.document,
        new Uint8Array(document.content as ArrayBuffer)
      );
    }
    return;
  }

  async onSave() {
    console.log("onSave", this.name);
    // called every few seconds after edits, and when the room empties
    // you can use this to write to a database or some external storage
    const update = Y.encodeStateAsUpdate(this.document);
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO documents (id, content) VALUES (?, ?)",
      this.name,
      update
    );
  }

  // Handle custom messages - example ping/pong
  onCustomMessage(connection: Connection, message: string): void {
    try {
      const data = JSON.parse(message);

      if (data.action === "ping") {
        // Reply to the sender
        this.sendCustomMessage(
          connection,
          JSON.stringify({ action: "pong", timestamp: Date.now() })
        );

        // Broadcast to everyone else
        this.broadcastCustomMessage(
          JSON.stringify({ action: "notification", text: "Someone pinged!" }),
          connection
        );
      } else if (data.action === "agent_hello") {
        console.log(`[Server] Agent connected: ${data.name}`);

        // Reply to agent
        this.sendCustomMessage(
          connection,
          JSON.stringify({ action: "hello_ack", message: "Welcome, AI Agent!" })
        );

        // Broadcast to all other clients
        this.broadcastCustomMessage(
          JSON.stringify({ action: "notification", text: `${data.name} has joined!` }),
          connection
        );
      } else if (data.action === "agent_ping") {
        console.log(`[Server] Agent ping at ${data.timestamp}`);

        // Reply with pong
        this.sendCustomMessage(
          connection,
          JSON.stringify({ action: "pong", timestamp: Date.now() })
        );
      } else if (data.type === "geocode_task") {
        console.log(`[Server] Geocode task from agent: ${data.locationName} (task: ${data.taskId})`);

        // Check if message is targeted to a specific client
        if (data.targetClientId) {
          console.log(`[Server] 🎯 Forwarding to target client: ${data.targetClientId}`);

          // Find the connection for the target client ID
          // document.conns is Map<Connection, Set<clientId>>
          let targetFound = false;
          const awarenessStates = this.document.awareness.getStates();
          const targetState = awarenessStates.get(data.targetClientId);

          // Iterate through connections to find the one controlling this client ID
          this.document.conns.forEach((controlledIds, conn) => {
            if (controlledIds.has(data.targetClientId)) {
              // Found the connection that controls this client ID
              this.sendCustomMessage(conn, message);
              targetFound = true;
              const clientName = targetState?.user?.name || 'Unknown';
              console.log(`[Server] ✅ Task sent to client ${data.targetClientId} (${clientName})`);
            }
          });

          if (!targetFound) {
            console.warn(`[Server] ⚠️  Target client ${data.targetClientId} not found, broadcasting to all`);
            this.broadcastCustomMessage(message);
          }
        } else {
          // No target specified, broadcast to all
          this.broadcastCustomMessage(message);
        }
      } else if (data.type === "geocode_result") {
        console.log(`[Server] Geocode result from client (task: ${data.taskId})`);

        // Broadcast result back to all connections (so agent receives it)
        this.broadcastCustomMessage(message);
      } else {
        // Unknown message type - broadcast to all other clients
        console.log(`[Server] Unknown message type, broadcasting: ${JSON.stringify(data).substring(0, 100)}`);
        this.broadcastCustomMessage(message);
      }
    } catch (error) {
      console.error("Failed to handle custom message:", error);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
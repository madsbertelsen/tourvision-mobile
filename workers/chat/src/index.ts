export interface Env {
  AI: any; // Cloudflare Workers AI binding
  CHAT_ROOM: DurableObjectNamespace;
}

interface ChatMessage {
  id: string;
  document_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: any;
  created_at: string;
}

export class ChatRoomV2 {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket>;
  private pendingToolCalls: Map<string, {resolve: (result: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout}>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.pendingToolCalls = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    // Expect WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket connection
    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    console.log(`[ChatRoom] WebSocket connection accepted. Total sessions: ${this.sessions.size}`);

    // Send empty chat history (no persistence)
    server.send(JSON.stringify({
      type: "history",
      messages: []
    }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    console.log('[ChatRoom] Received message:', message);
    try {
      const data = JSON.parse(message as string);
      const documentId = this.state.id.toString();
      console.log('[ChatRoom] Parsed message type:', data.type);

      switch (data.type) {
        case "chat_message":
          await this.handleChatMessage(data, ws, documentId);
          break;

        case "tool_result":
          await this.handleToolResult(data);
          break;

        case "request_history":
          ws.send(JSON.stringify({
            type: "history",
            messages: []
          }));
          break;

        default:
          console.warn(`[ChatRoom] Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error("[ChatRoom] Error processing message:", error);
      ws.send(JSON.stringify({
        type: "error",
        error: "Failed to process message"
      }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.sessions.delete(ws);
    console.log(`[ChatRoom] WebSocket closed. Code: ${code}, Reason: ${reason}. Total sessions: ${this.sessions.size}`);
  }

  async webSocketError(ws: WebSocket, error: any) {
    console.error("[ChatRoom] WebSocket error:", error);
    this.sessions.delete(ws);
  }

  /**
   * Handle tool result from client
   */
  private async handleToolResult(data: any) {
    const { tool_id, result, error } = data;
    console.log('[ChatRoom] Received tool result for:', tool_id);

    const pending = this.pendingToolCalls.get(tool_id);
    if (!pending) {
      console.warn('[ChatRoom] No pending tool call found for:', tool_id);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);
    this.pendingToolCalls.delete(tool_id);

    // Resolve or reject based on result
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  /**
   * Request a tool execution from the client and wait for result
   */
  private async requestClientTool(toolName: string, args: any): Promise<any> {
    const toolId = crypto.randomUUID();

    console.log('[ChatRoom] Requesting client tool:', toolName, 'with args:', args);

    // Create promise that will be resolved when client sends result
    const toolPromise = new Promise((resolve, reject) => {
      // Set timeout (10 seconds)
      const timeout = setTimeout(() => {
        this.pendingToolCalls.delete(toolId);
        reject(new Error(`Tool call timeout: ${toolName}`));
      }, 10000);

      this.pendingToolCalls.set(toolId, { resolve, reject, timeout });
    });

    // Send tool request to all connected clients
    this.broadcast(JSON.stringify({
      type: 'tool_request',
      tool_id: toolId,
      tool_name: toolName,
      args: args
    }));

    // Wait for result
    return toolPromise;
  }

  private async handleChatMessage(data: any, sender: WebSocket, documentId: string) {
    console.log('[ChatRoom] handleChatMessage called');
    const { content, user_id, metadata } = data;

    if (!content || !user_id) {
      console.log('[ChatRoom] Missing required fields');
      sender.send(JSON.stringify({
        type: "error",
        error: "Missing required fields: content, user_id"
      }));
      return;
    }

    console.log('[ChatRoom] Creating user message');
    // Create user message (in-memory only)
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      document_id: documentId,
      user_id,
      role: "user",
      content,
      metadata,
      created_at: new Date().toISOString()
    };

    console.log('[ChatRoom] Broadcasting user message');
    // Broadcast user message to all clients
    this.broadcast(JSON.stringify({
      type: "message",
      message: userMessage
    }));

    // Send immediate acknowledgment that AI is processing
    const ackMessageId = crypto.randomUUID();
    const ackMessage: ChatMessage = {
      id: ackMessageId,
      document_id: documentId,
      user_id: user_id,
      role: "assistant",
      content: "...",
      metadata: { processing: true },
      created_at: new Date().toISOString()
    };

    console.log('[ChatRoom] Broadcasting acknowledgment message');
    this.broadcast(JSON.stringify({
      type: "message",
      message: ackMessage
    }));

    console.log('[ChatRoom] Generating AI response');
    // Generate AI response with streaming
    await this.generateAIResponse(documentId, user_id, content);
    console.log('[ChatRoom] AI response complete');
  }

  private async generateAIResponse(documentId: string, userId: string, userMessage: string) {
    try {
      const messages = [
        {
          role: "system",
          content: `You are a helpful travel planning assistant with access to location geocoding tools.

Your role is to:
- Answer questions about their trip
- Provide helpful suggestions and recommendations
- Help them refine their travel plans
- Be concise and friendly

AVAILABLE TOOLS:
1. "geocode" - Get accurate coordinates for any location name
   Use this whenever you mention a place that should be shown on the map.

2. "route" - Calculate travel route between two locations with waypoints
   Use this when user asks about directions, travel routes, or "how to get from X to Y".
   Profiles: walking, driving, car, cycling, bike, transit, bus, train

TOOL CALL FORMAT (CRITICAL - FOLLOW EXACTLY):
<!-- TOOL:tool_name:{"key":"value"} -->

JSON MUST BE VALID:
- Use double quotes around BOTH keys and values
- Correct: {"location":"Paris, France"}
- WRONG: {"location:Paris, France"} (missing quote after key)
- WRONG: {location:"Paris"} (missing quotes around key)

Examples:
<!-- TOOL:geocode:{"location":"Eiffel Tower, Paris, France"} -->
<!-- TOOL:route:{"fromLocation":"Lejre, Denmark","toLocation":"Copenhagen, Denmark","profile":"driving"} -->

The tool will be executed and results provided. Then continue your response.

CRITICAL OUTPUT FORMAT REQUIREMENT:
You MUST format ALL responses as valid ProseMirror HTML. The schema supports these elements:

Block Elements:
- <p>Paragraph text</p> - Standard paragraph
- <h1>, <h2>, <h3>, <h4>, <h5>, <h6> - Headings (level 1-6)
- <blockquote> - Quoted text
- <ul><li>Item</li></ul> - Bullet list with list items
- <ol><li>Item</li></ol> - Numbered list with list items
- <pre><code>Code</code></pre> - Code block
- <hr> - Horizontal rule

Inline Formatting (marks):
- <strong>Bold</strong> or <b>Bold</b> - Bold text
- <em>Italic</em> or <i>Italic</i> - Italic text
- <code>inline code</code> - Inline code
- <a href="url">Link text</a> - Hyperlink
- <br> - Line break

Location References:
When mentioning locations, use geocode tool FIRST, then wrap in geo-mark span.
When user asks about routes/directions, use route tool and add transportation attributes to the destination geo-mark.

Example - Simple Location:
User: "Tell me about visiting Paris"
You:
  1. Call: <!-- TOOL:geocode:{"location":"Paris, France"} -->
  2. Receive: {"place_name":"Paris, France","lat":48.8566,"lng":2.3522}
  3. Generate:
     <p>I'd recommend <span class="geo-mark" data-place-name="Paris, France" data-lat="48.8566" data-lng="2.3522" data-coord-source="geocode">Paris</span> in spring!</p>

Example - Route with Transportation:
User: "Show me route by car from Lejre to Copenhagen"
You:
  1. Call: <!-- TOOL:route:{"fromLocation":"Lejre, Denmark","toLocation":"Copenhagen, Denmark","profile":"driving"} -->
  2. Receive: {"from":{...},"to":{...},"profile":"driving","waypoints":[...],"distance":42000,"duration":2400}
  3. Generate destination geo-mark WITH transportation attributes:
     <p>Here's your driving route from <span class="geo-mark" data-place-name="Lejre, Denmark" data-lat="55.6" data-lng="11.9" data-coord-source="geocode">Lejre</span> to <span class="geo-mark" data-place-name="Copenhagen, Denmark" data-lat="55.67" data-lng="12.56" data-coord-source="geocode" data-transport-from="Lejre, Denmark" data-transport-profile="driving" data-waypoints='[{"lng":11.9,"lat":55.6},{"lng":12.56,"lat":55.67}]'>Copenhagen</span>.</p>
     <p>Distance: 42 km | Duration: 40 minutes</p>

CRITICAL - Transportation Attributes:
When route tool is used, the DESTINATION geo-mark must include:
- data-transport-from="StartLocationName"
- data-transport-profile="driving|walking|cycling|transit"
- data-waypoints='[{"lng":X,"lat":Y},...]' (JSON array of route coordinates)

FORBIDDEN:
- DO NOT use plain text without HTML tags
- DO NOT use markdown syntax
- DO NOT use <think> tags or reasoning tags
- DO NOT skip wrapping text in <p> tags

Keep responses practical and well-structured.`
        },
        { role: "user", content: userMessage }
      ];

      console.log('[ChatRoom] Calling Cloudflare Workers AI...');

      // Stream AI response with Hermes 2 Pro Mistral 7B (fine-tuned for function calling and JSON)
      const response = await this.env.AI.run("@hf/nousresearch/hermes-2-pro-mistral-7b", {
        messages,
        stream: true
      });

      let fullResponse = "";
      const messageId = crypto.randomUUID();
      let chunkCount = 0;
      let buffer = ""; // Buffer for incomplete tags/words

      // Send streaming chunks
      for await (const chunk of response) {
        chunkCount++;

        // Handle different response formats
        let textChunk = "";

        // Check if chunk has 'response' property (old format)
        if (chunk.response) {
          textChunk = chunk.response;
        }
        // Check if chunk is a Uint8Array or similar (new format)
        else if (typeof chunk === 'object' && chunk !== null) {
          // Convert object with numeric keys to string
          const bytes = Object.values(chunk).filter(v => typeof v === 'number');
          if (bytes.length > 0) {
            textChunk = new TextDecoder().decode(new Uint8Array(bytes));

            // Extract actual response from SSE format "data: {json}\n\n"
            const match = textChunk.match(/data: ({.*})\n/);
            if (match) {
              try {
                const parsed = JSON.parse(match[1]);
                if (parsed.response) {
                  textChunk = parsed.response;
                }
              } catch (e) {
                console.warn('[ChatRoom] Failed to parse SSE data:', e);
              }
            }
          }
        }

        if (textChunk) {
          console.log(`[ChatRoom] Chunk ${chunkCount}:`, textChunk);

          // Ensure textChunk is a string
          const chunkStr = String(textChunk);

          // Skip metadata chunks (those that don't contain actual response text)
          // These are chunks like "data: [DONE]" or usage stats
          if (!chunkStr.startsWith('data: ')) {
            fullResponse += chunkStr;
            buffer += chunkStr;

            // Extract complete units (HTML tags or words) from buffer
            const units = this.extractCompleteUnits(buffer);

            if (units.toSend) {
              // Send complete units
              this.broadcast(JSON.stringify({
                type: "ai_chunk",
                message_id: messageId,
                chunk: units.toSend,
                done: false
              }));
            }

            // Keep incomplete portion in buffer
            buffer = units.remaining;
          }
        }
      }

      // Send any remaining buffer content at the end
      if (buffer) {
        this.broadcast(JSON.stringify({
          type: "ai_chunk",
          message_id: messageId,
          chunk: buffer,
          done: false
        }));
      }

      console.log(`[ChatRoom] AI complete. Total chunks: ${chunkCount}, Response length: ${fullResponse.length}`);

      // Fallback if AI returned empty response
      if (!fullResponse.trim()) {
        console.warn('[ChatRoom] AI returned empty response, using fallback');
        fullResponse = "I apologize, but I'm having trouble generating a response right now. Please try again.";
      }

      // Process tool calls in the response
      let processedResponse = await this.processToolCalls(fullResponse);

      // Post-process: Wrap plain text response in HTML if model didn't follow format
      if (!processedResponse.includes('<p>') && !processedResponse.includes('<h')) {
        console.log('[ChatRoom] Response is plain text, wrapping in HTML paragraphs');
        // Split by double newlines (paragraph breaks)
        const paragraphs = processedResponse.split(/\n\n+/).filter(p => p.trim());
        processedResponse = paragraphs.map(p => {
          // Handle headings (lines that end with colon or are all caps)
          if (p.trim().endsWith(':') && p.trim().length < 50) {
            return `<h3>${p.trim()}</h3>`;
          }
          // Regular paragraphs
          return `<p>${p.trim().replace(/\n/g, '<br>')}</p>`;
        }).join('\n');
      }

      // Auto-detect and wrap location names in geo-marks
      // Common location patterns: proper nouns, landmarks, places ending in common suffixes
      const locationPatterns = [
        // Named landmarks/buildings
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Palace|Castle|Museum|Gardens?|Park|Square|Tower|Cathedral|Church|Bridge|Statue|Harbor?|Street|Avenue|Center|Centre|Hall|Market|Temple)))\b/g,
        // City districts/neighborhoods
        /\b((?:Old\s+Town|Downtown|[A-Z][a-z]+(?:town|borg|ville|berg)))\b/g,
      ];

      let enhancedResponse = processedResponse;
      for (const pattern of locationPatterns) {
        enhancedResponse = enhancedResponse.replace(pattern, (match) => {
          // Skip if already wrapped in a geo-mark or HTML tag
          const beforeMatch = enhancedResponse.substring(0, enhancedResponse.indexOf(match));
          if (beforeMatch.lastIndexOf('<span class="geo-mark"') > beforeMatch.lastIndexOf('</span>')) {
            return match;
          }
          if (beforeMatch.lastIndexOf('<') > beforeMatch.lastIndexOf('>')) {
            return match;
          }

          // Wrap in geo-mark span (without coordinates - will be enriched client-side if needed)
          return `<span class="geo-mark" data-place-name="${match}" data-coord-source="llm">${match}</span>`;
        });
      }

      // Assign sequential color indices to all geo-marks (using modulo 5 for color cycling)
      let colorIndex = 0;
      enhancedResponse = enhancedResponse.replace(
        /<span class="geo-mark"([^>]*)>/g,
        (match, attributes) => {
          // Only add color-index if not already present
          if (!attributes.includes('data-color-index')) {
            const index = colorIndex % 5; // Cycle through 5 colors
            colorIndex++;
            return `<span class="geo-mark"${attributes} data-color-index="${index}">`;
          }
          return match;
        }
      );

      // Create complete AI message
      const aiMessage: ChatMessage = {
        id: messageId,
        document_id: documentId,
        user_id: userId,
        role: "assistant",
        content: enhancedResponse,
        metadata: { model: "qwen2.5-coder-32b-instruct" },
        created_at: new Date().toISOString()
      };

      // Send completion
      this.broadcast(JSON.stringify({
        type: "ai_chunk",
        message_id: messageId,
        chunk: "",
        done: true,
        message: aiMessage
      }));
    } catch (error) {
      console.error("[ChatRoom] Error generating AI response:", error);
      this.broadcast(JSON.stringify({
        type: "error",
        error: "Failed to generate AI response"
      }));
    }
  }

  /**
   * Repair common JSON formatting errors from LLM
   * Fixes: {"key:value"} -> {"key":"value"}
   */
  private repairJSON(json: string): string {
    // Fix missing quotes after keys: {"key:value"} -> {"key":"value"}
    // Pattern: {" followed by word characters, then : without closing quote
    const fixedJson = json.replace(/\{"(\w+):([^"}]+)"\}/g, (match, key, value) => {
      // If value doesn't start with a quote, add quotes
      const quotedValue = value.trim().startsWith('"') ? value : `"${value.trim()}"`;
      return `{"${key}":${quotedValue}}`;
    });

    return fixedJson;
  }

  /**
   * Process tool calls in the LLM response
   * Detects <!-- TOOL:name:args --> patterns, executes them via client, and replaces with results
   */
  private async processToolCalls(response: string): Promise<string> {
    const toolCallPattern = /<!-- TOOL:(\w+):(.*?) -->/g;
    let processedResponse = response;
    const toolCalls: Array<{match: string; toolName: string; args: any}> = [];

    // Extract all tool calls
    let match: RegExpExecArray | null;
    while ((match = toolCallPattern.exec(response)) !== null) {
      try {
        const toolName = match[1];
        let argsJson = match[2];

        // Try to repair common JSON errors
        argsJson = this.repairJSON(argsJson);

        // Try to parse JSON
        const args = JSON.parse(argsJson);

        toolCalls.push({
          match: match[0],
          toolName,
          args
        });
      } catch (error) {
        console.error('[ChatRoom] Failed to parse tool call:', match[0]);
        console.error('[ChatRoom] Original JSON:', match[2]);
        console.error('[ChatRoom] After repair:', this.repairJSON(match[2]));
        console.error('[ChatRoom] Error:', error);

        // Still remove the malformed tool call from output
        processedResponse = processedResponse.replace(match[0], '');
      }
    }

    // Execute each tool call sequentially
    for (const toolCall of toolCalls) {
      try {
        console.log('[ChatRoom] Executing tool:', toolCall.toolName, 'with args:', toolCall.args);

        // Request tool execution from client
        const result = await this.requestClientTool(toolCall.toolName, toolCall.args);

        console.log('[ChatRoom] Tool result:', result);

        // Replace tool call with result (or empty string to remove the comment)
        // The LLM should generate geo-marks after receiving tool results
        processedResponse = processedResponse.replace(toolCall.match, '');
      } catch (error) {
        console.error('[ChatRoom] Tool execution failed:', error);
        // Remove the failed tool call from response
        processedResponse = processedResponse.replace(toolCall.match, '');
      }
    }

    return processedResponse;
  }

  /**
   * Extract complete HTML tags and words from buffer
   * Returns what can be sent immediately and what should remain buffered
   */
  private extractCompleteUnits(buffer: string): { toSend: string; remaining: string } {
    let toSend = "";
    let i = 0;

    while (i < buffer.length) {
      const char = buffer[i];

      // Check if we're starting an HTML tag
      if (char === '<') {
        // Find the closing >
        const closeTagIndex = buffer.indexOf('>', i);

        if (closeTagIndex === -1) {
          // Incomplete tag, keep in buffer
          break;
        }

        // Complete tag found, extract it
        const tag = buffer.substring(i, closeTagIndex + 1);
        toSend += tag;
        i = closeTagIndex + 1;
      }
      // Regular text (not inside a tag)
      else {
        // Find the next tag start or whitespace
        let wordEnd = i;
        while (
          wordEnd < buffer.length &&
          buffer[wordEnd] !== '<' &&
          buffer[wordEnd] !== ' ' &&
          buffer[wordEnd] !== '\n' &&
          buffer[wordEnd] !== '\t'
        ) {
          wordEnd++;
        }

        // If we hit a tag or whitespace, we have a complete word
        if (wordEnd > i && (
          wordEnd >= buffer.length ||
          buffer[wordEnd] === '<' ||
          buffer[wordEnd] === ' ' ||
          buffer[wordEnd] === '\n' ||
          buffer[wordEnd] === '\t'
        )) {
          // Extract word and include trailing whitespace if present
          const word = buffer.substring(i, wordEnd);
          toSend += word;
          i = wordEnd;

          // Include trailing whitespace
          if (i < buffer.length && (buffer[i] === ' ' || buffer[i] === '\n' || buffer[i] === '\t')) {
            toSend += buffer[i];
            i++;
          }
        } else if (wordEnd === i) {
          // Just whitespace, include it
          toSend += buffer[i];
          i++;
        } else {
          // Incomplete word at end of buffer, keep for next iteration
          break;
        }
      }
    }

    const remaining = buffer.substring(i);

    return { toSend, remaining };
  }

  private broadcast(message: string) {
    // Get all WebSockets managed by this Durable Object
    const webSockets = this.state.getWebSockets();
    console.log(`[ChatRoom] Broadcasting to ${webSockets.length} WebSockets`);

    for (const ws of webSockets) {
      try {
        console.log('[ChatRoom] Sending to WebSocket');
        ws.send(message);
      } catch (error) {
        console.error("[ChatRoom] Error broadcasting to WebSocket:", error);
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "tourvision-chat",
          timestamp: new Date().toISOString()
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // WebSocket upgrade for chat rooms
    const chatMatch = url.pathname.match(/^\/chat\/(.+)$/);
    if (chatMatch && request.headers.get("Upgrade") === "websocket") {
      const documentId = chatMatch[1];

      // Get or create Durable Object for this document
      const id = env.CHAT_ROOM.idFromName(documentId);
      const stub = env.CHAT_ROOM.get(id);

      // Forward the WebSocket request to the Durable Object
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};

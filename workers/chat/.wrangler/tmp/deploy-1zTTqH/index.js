var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/client-tools.ts
var CLIENT_TOOLS = [
  {
    name: "geocode",
    description: "Get accurate geographic coordinates (latitude, longitude) for any location name. Use this whenever the user mentions a specific place. Returns the full place name, coordinates, and source.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: 'The location name to geocode. Can be a city, landmark, address, or region. Examples: "Copenhagen, Denmark", "Lejre", "Eiffel Tower, Paris", "123 Main St, New York"'
        },
        biasCoords: {
          type: "object",
          description: "(Optional) Approximate coordinates to bias the search. Useful for disambiguating common place names. Format: {lat: number, lng: number}"
        }
      },
      required: ["location"]
    },
    delegateToClient: true
  }
  // Route tool removed - routing is handled by setting transport attributes on geo-marks
  // The frontend will automatically calculate routes when it sees transport attributes
  // Future tool schemas:
  //
  // {
  //   name: 'weather',
  //   description: 'Get weather forecast for a location on a specific date',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       location: { type: 'string', description: 'Location name' },
  //       date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' }
  //     },
  //     required: ['location', 'date']
  //   },
  //   delegateToClient: true
  // },
  //
  // {
  //   name: 'distance',
  //   description: 'Calculate travel distance and duration between two locations',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       from: { type: 'string', description: 'Starting location' },
  //       to: { type: 'string', description: 'Destination location' },
  //       mode: {
  //         type: 'string',
  //         description: 'Travel mode',
  //         enum: ['walking', 'driving', 'cycling', 'transit']
  //       }
  //     },
  //     required: ['from', 'to']
  //   },
  //   delegateToClient: true
  // }
];

// src/index.ts
var ChatRoomV2 = class {
  state;
  env;
  sessions;
  pendingToolCalls;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = /* @__PURE__ */ new Set();
    this.pendingToolCalls = /* @__PURE__ */ new Map();
  }
  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    this.sessions.add(server);
    console.log(`[ChatRoom] WebSocket connection accepted. Total sessions: ${this.sessions.size}`);
    server.send(JSON.stringify({
      type: "history",
      messages: []
    }));
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
  async webSocketMessage(ws, message) {
    console.log("[ChatRoom] Received message:", message);
    try {
      const data = JSON.parse(message);
      const documentId = this.state.id.toString();
      console.log("[ChatRoom] Parsed message type:", data.type);
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
  async webSocketClose(ws, code, reason, wasClean) {
    this.sessions.delete(ws);
    console.log(`[ChatRoom] WebSocket closed. Code: ${code}, Reason: ${reason}. Total sessions: ${this.sessions.size}`);
  }
  async webSocketError(ws, error) {
    console.error("[ChatRoom] WebSocket error:", error);
    this.sessions.delete(ws);
  }
  /**
   * Handle tool result from client
   */
  async handleToolResult(data) {
    const { tool_id, result, error } = data;
    console.log("[ChatRoom] Received tool result for:", tool_id);
    const pending = this.pendingToolCalls.get(tool_id);
    if (!pending) {
      console.warn("[ChatRoom] No pending tool call found for:", tool_id);
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingToolCalls.delete(tool_id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }
  /**
   * Request a tool execution from the client and wait for result
   */
  async requestClientTool(toolName, args) {
    const toolId = crypto.randomUUID();
    console.log("[ChatRoom] Requesting client tool:", toolName, "with args:", args);
    const toolPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingToolCalls.delete(toolId);
        reject(new Error(`Tool call timeout: ${toolName}`));
      }, 1e4);
      this.pendingToolCalls.set(toolId, { resolve, reject, timeout });
    });
    this.broadcast(JSON.stringify({
      type: "tool_request",
      tool_id: toolId,
      tool_name: toolName,
      args
    }));
    return toolPromise;
  }
  async handleChatMessage(data, sender, documentId) {
    console.log("[ChatRoom] handleChatMessage called");
    const { content, user_id, metadata } = data;
    if (!content || !user_id) {
      console.log("[ChatRoom] Missing required fields");
      sender.send(JSON.stringify({
        type: "error",
        error: "Missing required fields: content, user_id"
      }));
      return;
    }
    console.log("[ChatRoom] Creating user message");
    const userMessage = {
      id: crypto.randomUUID(),
      document_id: documentId,
      user_id,
      role: "user",
      content,
      metadata,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.log("[ChatRoom] Broadcasting user message");
    this.broadcast(JSON.stringify({
      type: "message",
      message: userMessage
    }));
    const ackMessageId = crypto.randomUUID();
    const ackMessage = {
      id: ackMessageId,
      document_id: documentId,
      user_id,
      role: "assistant",
      content: "...",
      metadata: { processing: true },
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.log("[ChatRoom] Broadcasting acknowledgment message");
    this.broadcast(JSON.stringify({
      type: "message",
      message: ackMessage
    }));
    console.log("[ChatRoom] Generating AI response");
    await this.generateAIResponse(documentId, user_id, content);
    console.log("[ChatRoom] AI response complete");
  }
  async generateAIResponse(documentId, userId, userMessage) {
    try {
      const messages = [
        {
          role: "system",
          content: `You are a helpful travel planning assistant. When users mention specific locations, use the geocode tool to get accurate coordinates.

Format your responses as HTML paragraphs. After getting coordinates from the geocode tool, wrap location names in geo-mark spans with unique geo-ids:

For single locations:
<p>Here is <span class="geo-mark" data-geo-id="loc1" data-place-name="Paris, France" data-lat="48.8588897" data-lng="2.320041" data-color-index="0">Paris</span>.</p>

For routes between locations, geocode both locations and add transport attributes to the DESTINATION:
<p>Route from <span class="geo-mark" data-geo-id="loc1" data-place-name="Copenhagen, Denmark" data-lat="55.67" data-lng="12.56" data-color-index="0">Copenhagen</span> to <span class="geo-mark" data-geo-id="loc2" data-place-name="Roskilde, Denmark" data-lat="55.64" data-lng="12.08" data-color-index="1" data-transport-from="Copenhagen" data-transport-profile="driving">Roskilde</span> by car.</p>

IMPORTANT:
- Use SHORT display names inside the span (just "Copenhagen", not "Copenhagen, Denmark")
- Keep the full place name in data-place-name attribute
- For data-transport-from, you can use either the geo-id OR the simple display name (the system will match it)
- Add data-color-index incrementing from 0 for each unique location

Transport profiles: "driving" for car, "walking" for on foot, "cycling" for bike, "transit" for public transport.`
        },
        { role: "user", content: userMessage }
      ];
      console.log("[ChatRoom] Calling Cloudflare Workers AI...");
      const tools = CLIENT_TOOLS.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters
      }));
      let currentMessages = [...messages];
      const maxIterations = 5;
      let iterations = 0;
      let finalResponse = "";
      const messageId = crypto.randomUUID();
      while (iterations < maxIterations) {
        iterations++;
        console.log(`[ChatRoom] AI call iteration ${iterations}`);
        const response = await this.env.AI.run(
          "@hf/nousresearch/hermes-2-pro-mistral-7b",
          {
            messages: currentMessages,
            tools
          }
        );
        console.log("[ChatRoom] AI response:", response);
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`[ChatRoom] Processing ${response.tool_calls.length} tool calls`);
          currentMessages.push({
            role: "assistant",
            content: JSON.stringify(response.tool_calls)
          });
          const toolPromises = response.tool_calls.map(async (toolCall) => {
            console.log(`[ChatRoom] Executing tool: ${toolCall.name}`, toolCall.arguments);
            try {
              const toolResult = await this.requestClientTool(
                toolCall.name,
                toolCall.arguments
              );
              console.log(`[ChatRoom] Tool ${toolCall.name} result:`, toolResult);
              return {
                role: "tool",
                name: toolCall.name,
                content: JSON.stringify(toolResult)
              };
            } catch (error) {
              console.error(`[ChatRoom] Tool ${toolCall.name} error:`, error);
              return {
                role: "tool",
                name: toolCall.name,
                content: JSON.stringify({ error: error.message || String(error) })
              };
            }
          });
          const toolResults = await Promise.all(toolPromises);
          for (const result of toolResults) {
            currentMessages.push(result);
          }
          continue;
        }
        if (response.response) {
          finalResponse = response.response;
          console.log("[ChatRoom] Final response received");
          break;
        } else {
          console.warn("[ChatRoom] No response or tool_calls in AI response");
          break;
        }
      }
      if (iterations >= maxIterations) {
        console.error("[ChatRoom] Max iterations reached, stopping");
        finalResponse = "I apologize, but I encountered an issue processing your request. Please try again.";
      }
      console.log("[ChatRoom] Full AI response:", finalResponse);
      if (finalResponse) {
        const chunkMessage = {
          type: "ai_chunk",
          message_id: messageId,
          chunk: finalResponse,
          done: false
        };
        console.log("[ChatRoom] Sending chunk to client:", JSON.stringify(chunkMessage));
        this.broadcast(JSON.stringify(chunkMessage));
      }
      if (!finalResponse.trim()) {
        console.warn("[ChatRoom] AI returned empty response, using fallback");
        finalResponse = "I apologize, but I'm having trouble generating a response right now. Please try again.";
      }
      let processedResponse = await this.processToolCalls(finalResponse);
      console.log("[ChatRoom] Response after processToolCalls:", processedResponse);
      if (!processedResponse.includes("<p>") && !processedResponse.includes("<h")) {
        console.log("[ChatRoom] Response is plain text, wrapping in HTML paragraphs");
        const paragraphs = processedResponse.split(/\n\n+/).filter((p) => p.trim());
        processedResponse = paragraphs.map((p) => {
          if (p.trim().endsWith(":") && p.trim().length < 50) {
            return `<h3>${p.trim()}</h3>`;
          }
          return `<p>${p.trim().replace(/\n/g, "<br>")}</p>`;
        }).join("\n");
      }
      const locationPatterns = [
        // Named landmarks/buildings
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Palace|Castle|Museum|Gardens?|Park|Square|Tower|Cathedral|Church|Bridge|Statue|Harbor?|Street|Avenue|Center|Centre|Hall|Market|Temple)))\b/g,
        // City districts/neighborhoods
        /\b((?:Old\s+Town|Downtown|[A-Z][a-z]+(?:town|borg|ville|berg)))\b/g
      ];
      let enhancedResponse = processedResponse;
      for (const pattern of locationPatterns) {
        enhancedResponse = enhancedResponse.replace(pattern, (match) => {
          const beforeMatch = enhancedResponse.substring(0, enhancedResponse.indexOf(match));
          if (beforeMatch.lastIndexOf('<span class="geo-mark"') > beforeMatch.lastIndexOf("</span>")) {
            return match;
          }
          if (beforeMatch.lastIndexOf("<") > beforeMatch.lastIndexOf(">")) {
            return match;
          }
          return `<span class="geo-mark" data-place-name="${match}" data-coord-source="llm">${match}</span>`;
        });
      }
      let colorIndex = 0;
      enhancedResponse = enhancedResponse.replace(
        /<span class="geo-mark"([^>]*)>/g,
        (match, attributes) => {
          if (!attributes.includes("data-color-index")) {
            const index = colorIndex % 5;
            colorIndex++;
            return `<span class="geo-mark"${attributes} data-color-index="${index}">`;
          }
          return match;
        }
      );
      console.log("[ChatRoom] Final enhanced response being sent:", enhancedResponse);
      const aiMessage = {
        id: messageId,
        document_id: documentId,
        user_id: userId,
        role: "assistant",
        content: enhancedResponse,
        metadata: { model: "hermes-2-pro-mistral-7b" },
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const completionMessage = {
        type: "ai_chunk",
        message_id: messageId,
        chunk: "",
        done: true,
        message: aiMessage
      };
      console.log("[ChatRoom] Sending completion to client:", JSON.stringify(completionMessage));
      this.broadcast(JSON.stringify(completionMessage));
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
  repairJSON(json) {
    const fixedJson = json.replace(/\{"(\w+):([^"}]+)"\}/g, (match, key, value) => {
      const quotedValue = value.trim().startsWith('"') ? value : `"${value.trim()}"`;
      return `{"${key}":${quotedValue}}`;
    });
    return fixedJson;
  }
  /**
   * Process tool calls in the LLM response
   * Detects <!-- TOOL:name:args --> patterns, executes them via client, and replaces with results
   */
  async processToolCalls(response) {
    const toolCallPattern = /<!-- TOOL:(\w+):(.*?) -->/g;
    let processedResponse = response;
    const toolCalls = [];
    let match;
    while ((match = toolCallPattern.exec(response)) !== null) {
      try {
        const toolName = match[1];
        let argsJson = match[2];
        argsJson = this.repairJSON(argsJson);
        const args = JSON.parse(argsJson);
        toolCalls.push({
          match: match[0],
          toolName,
          args
        });
      } catch (error) {
        console.error("[ChatRoom] Failed to parse tool call:", match[0]);
        console.error("[ChatRoom] Original JSON:", match[2]);
        console.error("[ChatRoom] After repair:", this.repairJSON(match[2]));
        console.error("[ChatRoom] Error:", error);
        processedResponse = processedResponse.replace(match[0], "");
      }
    }
    for (const toolCall of toolCalls) {
      try {
        console.log("[ChatRoom] Executing tool:", toolCall.toolName, "with args:", toolCall.args);
        const result = await this.requestClientTool(toolCall.toolName, toolCall.args);
        console.log("[ChatRoom] Tool result:", result);
        processedResponse = processedResponse.replace(toolCall.match, "");
      } catch (error) {
        console.error("[ChatRoom] Tool execution failed:", error);
        processedResponse = processedResponse.replace(toolCall.match, "");
      }
    }
    return processedResponse;
  }
  /**
   * Extract complete HTML tags and words from buffer
   * Returns what can be sent immediately and what should remain buffered
   */
  extractCompleteUnits(buffer) {
    let toSend = "";
    let i = 0;
    while (i < buffer.length) {
      const char = buffer[i];
      if (char === "<") {
        const closeTagIndex = buffer.indexOf(">", i);
        if (closeTagIndex === -1) {
          break;
        }
        const tag = buffer.substring(i, closeTagIndex + 1);
        toSend += tag;
        i = closeTagIndex + 1;
      } else {
        let wordEnd = i;
        while (wordEnd < buffer.length && buffer[wordEnd] !== "<" && buffer[wordEnd] !== " " && buffer[wordEnd] !== "\n" && buffer[wordEnd] !== "	") {
          wordEnd++;
        }
        if (wordEnd > i && (wordEnd >= buffer.length || buffer[wordEnd] === "<" || buffer[wordEnd] === " " || buffer[wordEnd] === "\n" || buffer[wordEnd] === "	")) {
          const word = buffer.substring(i, wordEnd);
          toSend += word;
          i = wordEnd;
          if (i < buffer.length && (buffer[i] === " " || buffer[i] === "\n" || buffer[i] === "	")) {
            toSend += buffer[i];
            i++;
          }
        } else if (wordEnd === i) {
          toSend += buffer[i];
          i++;
        } else {
          break;
        }
      }
    }
    const remaining = buffer.substring(i);
    return { toSend, remaining };
  }
  broadcast(message) {
    const webSockets = this.state.getWebSockets();
    console.log(`[ChatRoom] Broadcasting to ${webSockets.length} WebSockets`);
    for (const ws of webSockets) {
      try {
        console.log("[ChatRoom] Sending to WebSocket");
        ws.send(message);
      } catch (error) {
        console.error("[ChatRoom] Error broadcasting to WebSocket:", error);
      }
    }
  }
};
__name(ChatRoomV2, "ChatRoomV2");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "tourvision-chat",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.pathname === "/api/extract-locations" && request.method === "POST") {
      try {
        const { text } = await request.json();
        if (!text || typeof text !== "string") {
          return new Response(
            JSON.stringify({ error: "Invalid request: text field required" }),
            { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
          );
        }
        console.log("[ExtractLocations] Processing text:", text);
        const response = await env.AI.run(
          "@hf/nousresearch/hermes-2-pro-mistral-7b",
          {
            messages: [
              {
                role: "system",
                content: `You are a travel itinerary assistant. Convert the user's text into a structured ProseMirror document with geo-marks for locations and transportation information.

Return ONLY valid JSON in this exact ProseMirror format:
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {"type": "text", "text": "I will "},
        {"type": "text", "text": "cycle", "marks": [{"type": "transportAction", "attrs": {"mode": "cycling"}}]},
        {"type": "text", "text": " from "},
        {
          "type": "geoMark",
          "attrs": {
            "geoId": "loc-1",
            "placeName": "Lejre",
            "colorIndex": 0
          },
          "content": [{"type": "text", "text": "Lejre"}]
        },
        {"type": "text", "text": " to "},
        {
          "type": "geoMark",
          "attrs": {
            "geoId": "loc-2",
            "placeName": "Copenhagen",
            "colorIndex": 1,
            "transportFrom": "Lejre",
            "transportProfile": "cycling"
          },
          "content": [{"type": "text", "text": "Copenhagen"}]
        }
      ]
    }
  ]
}

Rules:
- Create unique geoId for each location (loc-1, loc-2, etc.)
- Set colorIndex starting from 0 and incrementing
- For destinations, add transportFrom (previous location name) and transportProfile
- Transport profiles: "walking", "driving", "cycling", "transit", "flight"
- Keep the original text's natural language
- Do not include lat/lng - frontend will geocode using placeName

Return ONLY the JSON, no markdown, no explanation.`
              },
              {
                role: "user",
                content: `Convert to ProseMirror format:

"${text}"`
              }
            ]
          }
        );
        console.log("[ExtractLocations] AI response:", response);
        let document = null;
        try {
          let content = response.response || response.content || "";
          content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          document = JSON.parse(content);
          if (!document || document.type !== "doc") {
            console.error("[ExtractLocations] Invalid document structure");
            document = null;
          }
        } catch (parseError) {
          console.error("[ExtractLocations] Failed to parse AI response:", parseError);
          document = null;
        }
        console.log("[ExtractLocations] Generated document:", JSON.stringify(document));
        return new Response(
          JSON.stringify({ document }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      } catch (error) {
        console.error("[ExtractLocations] Error:", error);
        return new Response(
          JSON.stringify({ error: "Internal server error", locations: [] }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
    const chatMatch = url.pathname.match(/^\/chat\/(.+)$/);
    if (chatMatch && request.headers.get("Upgrade") === "websocket") {
      const documentId = chatMatch[1];
      const id = env.CHAT_ROOM.idFromName(documentId);
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  }
};
export {
  ChatRoomV2,
  src_default as default
};
//# sourceMappingURL=index.js.map

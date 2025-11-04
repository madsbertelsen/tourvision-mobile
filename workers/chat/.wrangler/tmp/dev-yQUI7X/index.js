var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-YgZliP/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-YgZliP/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/ChatRoom.ts
var ChatRoom = class {
  constructor(party, env) {
    this.party = party;
    this.env = env;
  }
  async onConnect(conn, ctx) {
    const documentId = this.party.id;
    console.log(
      `[ChatRoom] User ${conn.id} connected to document ${documentId}`
    );
    await this.sendChatHistory(conn, documentId);
  }
  async onMessage(message, sender) {
    try {
      const data = JSON.parse(message);
      const documentId = this.party.id;
      switch (data.type) {
        case "chat_message":
          await this.handleChatMessage(data, sender, documentId);
          break;
        case "request_history":
          await this.sendChatHistory(sender, documentId);
          break;
        default:
          console.warn(`[ChatRoom] Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error("[ChatRoom] Error processing message:", error);
      sender.send(
        JSON.stringify({
          type: "error",
          error: "Failed to process message"
        })
      );
    }
  }
  async onClose(conn) {
    console.log(`[ChatRoom] User ${conn.id} disconnected`);
  }
  /**
   * Handle incoming chat message from user
   */
  async handleChatMessage(data, sender, documentId) {
    const { content, user_id, metadata } = data;
    if (!content || !user_id) {
      sender.send(
        JSON.stringify({
          type: "error",
          error: "Missing required fields: content, user_id"
        })
      );
      return;
    }
    const userMessage = await this.saveMessage({
      document_id: documentId,
      user_id,
      role: "user",
      content,
      metadata
    });
    this.party.broadcast(
      JSON.stringify({
        type: "message",
        message: userMessage
      })
    );
    await this.generateAIResponse(documentId, user_id, content);
  }
  /**
   * Generate AI response using Workers AI with streaming
   */
  async generateAIResponse(documentId, userId, userMessage) {
    try {
      const history = await this.getChatHistory(documentId, 10);
      const messages = [
        {
          role: "system",
          content: "You are a helpful travel planning assistant. Help users plan their trips, suggest destinations, and provide travel advice."
        },
        ...history.map((msg) => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content
        }))
      ];
      const response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages,
        stream: true
      });
      let fullResponse = "";
      const messageId = crypto.randomUUID();
      for await (const chunk of response) {
        if (chunk.response) {
          fullResponse += chunk.response;
          this.party.broadcast(
            JSON.stringify({
              type: "ai_chunk",
              message_id: messageId,
              chunk: chunk.response,
              done: false
            })
          );
        }
      }
      const aiMessage = await this.saveMessage({
        document_id: documentId,
        user_id: userId,
        // Associate with user who asked
        role: "assistant",
        content: fullResponse,
        metadata: { model: "llama-3.1-8b-instruct" }
      });
      this.party.broadcast(
        JSON.stringify({
          type: "ai_chunk",
          message_id: messageId,
          chunk: "",
          done: true,
          message: aiMessage
        })
      );
    } catch (error) {
      console.error("[ChatRoom] Error generating AI response:", error);
      this.party.broadcast(
        JSON.stringify({
          type: "error",
          error: "Failed to generate AI response"
        })
      );
    }
  }
  /**
   * Send chat history to a specific connection
   */
  async sendChatHistory(conn, documentId) {
    try {
      const history = await this.getChatHistory(documentId, 50);
      conn.send(
        JSON.stringify({
          type: "history",
          messages: history
        })
      );
    } catch (error) {
      console.error("[ChatRoom] Error sending history:", error);
      conn.send(
        JSON.stringify({
          type: "error",
          error: "Failed to load chat history"
        })
      );
    }
  }
  /**
   * Get chat history from Supabase
   */
  async getChatHistory(documentId, limit = 50) {
    const response = await fetch(
      `${this.env.SUPABASE_URL}/rest/v1/document_chats?document_id=eq.${documentId}&order=created_at.asc&limit=${limit}`,
      {
        headers: {
          apikey: this.env.SUPABASE_KEY,
          Authorization: `Bearer ${this.env.SUPABASE_KEY}`
        }
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch chat history: ${response.statusText}`);
    }
    return response.json();
  }
  /**
   * Save message to Supabase
   */
  async saveMessage(message) {
    const response = await fetch(
      `${this.env.SUPABASE_URL}/rest/v1/document_chats`,
      {
        method: "POST",
        headers: {
          apikey: this.env.SUPABASE_KEY,
          Authorization: `Bearer ${this.env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          ...message,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.statusText}`);
    }
    const [savedMessage] = await response.json();
    return savedMessage;
  }
};
__name(ChatRoom, "ChatRoom");

// src/index.ts
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
        {
          headers: { "Content-Type": "application/json" }
        }
      );
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

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-YgZliP/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-YgZliP/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  ChatRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map

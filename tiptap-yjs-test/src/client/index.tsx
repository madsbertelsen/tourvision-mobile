import { createRoot } from "react-dom/client";
import { useEffect, useState, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import { baseKeymap } from "prosemirror-commands";
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from "y-prosemirror";
import YProvider from "../y-partyserver/provider";
import * as Y from "yjs";

import "./styles.css";

// 5 pastel colors
const colours = ["#FFC0CB", "#FFD700", "#98FB98", "#87CEFA", "#FFA07A"];

// Pick a random color from the list
const MY_COLOR = colours[Math.floor(Math.random() * colours.length)];

// Generate a random username
const MY_USERNAME = `User-${Math.floor(Math.random() * 1000)}`;

function ProseMirrorEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Array<{ id: string; text: string }>>(
    []
  );
  const [provider, setProvider] = useState<YProvider | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Initialize Y.Doc, YProvider, and ProseMirror
  useEffect(() => {
    if (!editorRef.current) return;

    console.log("Initializing Y.Doc, YProvider, and ProseMirror");

    // Create Y.Doc
    const yDoc = new Y.Doc();
    const yXmlFragment = yDoc.getXmlFragment("prosemirror");

    // Create YProvider
    const prov = new YProvider(
      window.location.host,
      "y-partyserver-text-editor-example",
      yDoc,
      {
        party: "document"
      }
    );

    // Set local awareness state
    prov.awareness.setLocalStateField("user", {
      name: MY_USERNAME,
      color: MY_COLOR
    });

    setProvider(prov);

    // Listen for custom messages
    const handleCustomMessage = (message: string) => {
      try {
        console.log("Received custom message:", message);
        const data = JSON.parse(message);
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            text: `${new Date().toLocaleTimeString()}: ${JSON.stringify(data)}`
          }
        ]);
      } catch (error) {
        console.error("Failed to parse custom message:", error);
      }
    };

    prov.on("custom-message", handleCustomMessage);
    prov.on("sync", (isSynced: boolean) => {
      console.log("Provider sync status:", isSynced);
    });
    prov.on("status", ({ status }: { status: string }) => {
      console.log("Provider status:", status);
    });

    // Custom cursor builder for remote users
    const cursorBuilder = (user: any) => {
      const cursor = document.createElement("span");
      cursor.classList.add("ProseMirror-yjs-cursor");
      cursor.style.borderLeft = `2px solid ${user.color}`;
      cursor.style.borderColor = user.color;
      cursor.style.position = "relative";

      const userLabel = document.createElement("div");
      userLabel.style.position = "absolute";
      userLabel.style.top = "-1.4em";
      userLabel.style.left = "-1px";
      userLabel.style.fontSize = "12px";
      userLabel.style.backgroundColor = user.color;
      userLabel.style.color = "white";
      userLabel.style.padding = "2px 6px";
      userLabel.style.borderRadius = "3px";
      userLabel.style.whiteSpace = "nowrap";
      userLabel.style.fontWeight = "500";
      userLabel.textContent = user.name;

      cursor.appendChild(userLabel);
      return cursor;
    };

    // Create ProseMirror EditorState with Y.js plugins
    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(prov.awareness, { cursorBuilder }),
        yUndoPlugin(),
        history(),
        keymap({ "Mod-z": undo, "Mod-y": redo }),
        keymap(baseKeymap)
      ]
    });

    // Create ProseMirror EditorView
    const view = new EditorView(editorRef.current, {
      state
    });

    viewRef.current = view;

    return () => {
      console.log("Cleaning up ProseMirror, Y.Doc, and YProvider");
      view.destroy();
      prov.off("custom-message", handleCustomMessage);
      prov.disconnect();
      yDoc.destroy();
    };
  }, []);

  const sendPing = () => {
    if (provider) {
      console.log("Sending ping message");
      provider.sendMessage(JSON.stringify({ action: "ping" }));
    } else {
      console.error("Provider not ready");
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>A ProseMirror Editor</h1>
      {!provider && <p>Connecting to server...</p>}
      <div
        ref={editorRef}
        style={{
          border: "1px solid #ccc",
          padding: "10px",
          minHeight: "200px"
        }}
      />

      <div style={{ marginTop: 20 }}>
        <h2>Custom Messages Demo</h2>
        <button
          type="button"
          onClick={sendPing}
          style={{ padding: "10px 20px" }}
          disabled={!provider}
        >
          Send Ping
        </button>
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid #ccc",
            maxHeight: 200,
            overflowY: "auto"
          }}
        >
          <h3>Messages:</h3>
          {messages.length === 0 ? (
            <p>No messages yet</p>
          ) : (
            messages.map((msg) => <div key={msg.id}>{msg.text}</div>)
          )}
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<ProseMirrorEditor />);

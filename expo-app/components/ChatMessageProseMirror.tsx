import React from 'react';
import { DOMSerializer } from 'prosemirror-model';
import { schema } from '@/utils/prosemirror-schema';
import '../styles/chat-prosemirror.css';

interface ChatMessageProseMirrorProps {
  content: any; // ProseMirror JSON document
}

export function ChatMessageProseMirror({ content }: ChatMessageProseMirrorProps) {
  // Convert ProseMirror JSON to DOM
  const doc = schema.nodeFromJSON(content);
  const serializer = DOMSerializer.fromSchema(schema);
  const domFragment = serializer.serializeFragment(doc.content);

  // Create a container and append the DOM fragment
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      // Clear previous content
      containerRef.current.innerHTML = '';
      // Append new DOM fragment
      containerRef.current.appendChild(domFragment);
    }
  }, [domFragment]);

  return (
    <div
      ref={containerRef}
      className="chat-prosemirror-readonly ProseMirror"
      style={{
        userSelect: 'text',
        cursor: 'default',
        fontSize: '15px',
        lineHeight: '1.5',
        color: '#111827'
      }}
    />
  );
}

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

      // Add custom copy handler to preserve ProseMirror structure
      const handleCopy = (e: ClipboardEvent) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();

        // Create a temporary div to hold the fragment
        const temp = document.createElement('div');
        temp.appendChild(fragment);

        // Set both HTML and plain text
        e.clipboardData?.setData('text/html', temp.innerHTML);
        e.clipboardData?.setData('text/plain', selection.toString());
        e.preventDefault();
      };

      containerRef.current.addEventListener('copy', handleCopy);

      return () => {
        containerRef.current?.removeEventListener('copy', handleCopy);
      };
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

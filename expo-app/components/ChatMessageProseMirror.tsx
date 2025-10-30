import React from 'react';
import { ProseMirror, ProseMirrorDoc } from '@handlewithcare/react-prosemirror';
import { EditorState } from 'prosemirror-state';
import { schema } from '@/utils/prosemirror-schema';
import '../styles/chat-prosemirror.css';

interface ChatMessageProseMirrorProps {
  content: any; // ProseMirror JSON document
}

export function ChatMessageProseMirror({ content }: ChatMessageProseMirrorProps) {
  // Create an editor state from the content
  const editorState = EditorState.create({
    doc: schema.nodeFromJSON(content),
    schema,
    // No plugins needed for read-only display
  });

  return (
    <div style={{
      userSelect: 'text',
      cursor: 'text',
      fontSize: '15px',
      lineHeight: '1.5',
      color: '#111827'
    }}>
      <ProseMirror
        state={editorState}
        editable={false}
      >
        <ProseMirrorDoc />
      </ProseMirror>
    </div>
  );
}

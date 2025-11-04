import { schema } from '@/utils/prosemirror-schema';
import { ProseMirror } from '@nytimes/react-prosemirror';
import { EditorState } from 'prosemirror-state';
import React, { useMemo, useState } from 'react';
import '../styles/chat-prosemirror.css';

interface ChatMessageProseMirrorProps {
  content: any; // ProseMirror JSON document
}

export function ChatMessageProseMirror({ content }: ChatMessageProseMirrorProps) {
  const [mount, setMount] = useState<HTMLDivElement | null>(null);

  // Create EditorState from content
  const editorState = useMemo(() => {
    console.log('[ChatMessageProseMirror] content', content);
    const doc = schema.nodeFromJSON(content);
    return EditorState.create({
      doc,
      schema
    });
  }, [content]);

  return (
    <div className="chat-prosemirror-readonly">
      {mount && (
        <ProseMirror
          mount={mount}
          state={editorState}
          editable={() => false}
        />
      )}
      <div ref={setMount} />
    </div>
  );
}

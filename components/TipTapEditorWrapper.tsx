import React from 'react';
import TipTapEditorDOM from './dom/TipTapEditorDOM';
import { JSONContent } from '@tiptap/react';

interface TipTapEditorWrapperProps {
  content?: JSONContent | string;
  onChange?: (content: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
  height?: number;
}

export function TipTapEditorWrapper({
  content,
  onChange,
  editable = true,
  placeholder = 'Start typing...',
  height = 400,
}: TipTapEditorWrapperProps) {
  // Directly use the DOM component
  return (
    <TipTapEditorDOM
      content={content}
      onChange={onChange}
      editable={editable}
      placeholder={placeholder}
      dom={{
        style: { width: '100%', height },
      }}
    />
  );
}


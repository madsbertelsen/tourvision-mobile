'use dom';

import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DiffVisualization from './tiptap-diff-extension';

interface TestDiffEditorProps {
  initialDocument: any;
  onChange?: (doc: any) => void;
  editable?: boolean;
}

export default function TestDiffEditorDOM({
  initialDocument,
  onChange,
  editable = true
}: TestDiffEditorProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      DiffVisualization,
    ],
    content: initialDocument,
    editable: editable && !isPreviewMode,
    onUpdate: ({ editor }) => {
      if (onChange && !isPreviewMode) {
        onChange(editor.getJSON());
      }
    },
  });

  // Expose methods to parent via window messaging
  useEffect(() => {
    if (!editor) return;

    const applyTransactionSteps = (steps: any[], inverseSteps?: any[]) => {
      console.log('TestDiffEditorDOM - applyTransactionSteps called with:', steps);
      setIsPreviewMode(true);
      const result = editor.chain().focus().applyTransactionSteps(steps, inverseSteps).run();
      console.log('TestDiffEditorDOM - applyTransactionSteps result:', result);
      return result;
    };

    const revertTransactionSteps = () => {
      console.log('TestDiffEditorDOM - revertTransactionSteps called');
      const result = editor.chain().focus().revertTransactionSteps().run();
      console.log('TestDiffEditorDOM - revertTransactionSteps result:', result);
      setIsPreviewMode(false);
      return result;
    };

    // Make functions available globally for the parent
    (window as any).testDiffEditor = {
      applyTransactionSteps,
      revertTransactionSteps,
    };

    // Notify parent that editor is ready
    window.parent.postMessage({ type: 'editor-ready' }, '*');

    return () => {
      delete (window as any).testDiffEditor;
    };
  }, [editor]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div style={{ padding: '16px' }}>
      <EditorContent
        editor={editor}
        style={{
          minHeight: '350px',
          outline: 'none',
        }}
      />
      {isPreviewMode && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: '#10b981',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
        }}>
          PREVIEW MODE
        </div>
      )}
    </div>
  );
}
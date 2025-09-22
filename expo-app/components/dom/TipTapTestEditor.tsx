'use dom';

import React, { useImperativeHandle, forwardRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DiffVisualization from './tiptap-diff-extension';

interface TipTapTestEditorProps {
  initialDocument: any;
  onReady?: () => void;
  editable?: boolean;
}

export interface TipTapTestEditorHandle {
  applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => boolean;
  revertTransactionSteps: () => boolean;
}

const TipTapTestEditor = forwardRef<TipTapTestEditorHandle, TipTapTestEditorProps>(
  ({ initialDocument, onReady, editable = true }, ref) => {
    const [isPreviewMode, setIsPreviewMode] = useState(false);

    const editor = useEditor({
      extensions: [
        StarterKit,
        DiffVisualization,
      ],
      content: initialDocument,
      editable: editable && !isPreviewMode,
      onCreate: () => {
        console.log('TipTap editor created');
        onReady?.();
      },
      onUpdate: ({ editor }) => {
        console.log('Editor updated, preview mode:', isPreviewMode);
      },
    });

    useImperativeHandle(ref, () => ({
      applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => {
        if (!editor) return false;
        
        console.log('TipTapTestEditor - Applying transaction steps:', steps);
        setIsPreviewMode(true);
        editor.setEditable(false);
        
        const result = editor.chain()
          .focus()
          .applyTransactionSteps(steps, inverseSteps)
          .run();
        
        console.log('Apply result:', result);
        return result;
      },
      revertTransactionSteps: () => {
        if (!editor) return false;
        
        console.log('TipTapTestEditor - Reverting transaction steps');
        const result = editor.chain()
          .focus()
          .revertTransactionSteps()
          .run();
        
        setIsPreviewMode(false);
        editor.setEditable(editable);
        console.log('Revert result:', result);
        return result;
      }
    }), [editor, editable]);

    if (!editor) {
      return <div>Loading editor...</div>;
    }

    return (
      <div style={{ padding: '16px', position: 'relative' }}>
        <EditorContent
          editor={editor}
          style={{
            minHeight: '300px',
            outline: 'none',
            fontSize: '16px',
            lineHeight: '1.5',
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
);

TipTapTestEditor.displayName = 'TipTapTestEditor';

export default TipTapTestEditor;
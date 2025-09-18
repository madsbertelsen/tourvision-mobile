'use dom';

import React, { useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { JSONContent } from '@tiptap/react';
import { DiffVisualization } from './tiptap-diff-extension';
import {
  DestinationNode,
  DayNode,
  TransportationNode,
  GroupSplitNode,
  TipNode
} from './extensions';
import './itinerary-editor-styles.css';

interface ItineraryEditorProps {
  content?: JSONContent | string;
  onChange?: (content: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
}

const ItineraryEditorDOM = forwardRef<any, ItineraryEditorProps>((
  {
    content = '',
    onChange,
    editable = true,
    placeholder = 'Start planning your itinerary...'
  },
  ref
) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // Disable default blockquote and code blocks for cleaner document
        blockquote: false,
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline hover:text-blue-600',
        },
      }),
      DiffVisualization,
      DestinationNode,
      DayNode,
      TransportationNode,
      GroupSplitNode,
      TipNode,
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: 'itinerary-document-editor',
      },
    },
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getJSON());
      }
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getJSON()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    setDiffDecorations: (decorations: any[]) => {
      console.log('ItineraryEditorDOM - setDiffDecorations called with:', decorations);
      if (editor && decorations) {
        const result = editor.commands.setDiffDecorations(decorations);
        console.log('ItineraryEditorDOM - setDiffDecorations result:', result);
      } else {
        console.log('ItineraryEditorDOM - Missing editor or decorations', { editor: !!editor, decorations: !!decorations });
      }
    },
    clearDiffDecorations: () => {
      console.log('ItineraryEditorDOM - clearDiffDecorations called');
      if (editor) {
        const result = editor.commands.clearDiffDecorations();
        console.log('ItineraryEditorDOM - clearDiffDecorations result:', result);
      }
    },
  }), [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="itinerary-editor-wrapper">
      <style jsx>{`
        .itinerary-editor-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        .itinerary-document-editor {
          min-height: 500px;
          outline: none;
          font-size: 16px;
          line-height: 1.6;
          color: #111827;
        }

        .itinerary-document-editor h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 1rem;
          color: #111827;
          letter-spacing: -0.025em;
          line-height: 1.2;
        }

        .itinerary-document-editor h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 1rem;
          color: #1F2937;
          line-height: 1.3;
        }

        .itinerary-document-editor h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: #374151;
          line-height: 1.4;
        }

        .itinerary-document-editor p {
          margin-bottom: 1rem;
          color: #4B5563;
        }

        .itinerary-document-editor ul {
          list-style-type: disc;
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }

        .itinerary-document-editor ol {
          list-style-type: decimal;
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }

        .itinerary-document-editor li {
          margin-bottom: 0.5rem;
          color: #4B5563;
        }

        /* Day Node Styles */
        .day-node {
          margin: 2rem 0;
          padding: 1.5rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .day-node-header {
          color: white;
          margin-bottom: 1rem;
        }

        .day-node-header h2 {
          color: white;
          margin: 0;
        }

        .day-node-date {
          opacity: 0.9;
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }

        .day-node-content {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          min-height: 100px;
        }

        /* Destination Node Styles */
        .destination-node {
          margin: 1.5rem 0;
          border-radius: 12px;
          background: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          transition: box-shadow 0.2s;
        }

        .destination-node:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        /* Transportation Node Styles */
        .transportation-node {
          margin: 1rem 0;
          padding: 0.75rem 1rem;
          background: #F9FAFB;
          border-left: 3px solid #3B82F6;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        /* Group Split Node Styles */
        .group-split-node {
          margin: 2rem 0;
          padding: 1.5rem;
          background: #FEF3C7;
          border: 2px solid #F59E0B;
          border-radius: 12px;
        }

        .group-split-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
          font-weight: 600;
          color: #92400E;
        }

        /* Tip Node Styles */
        .tip-node {
          margin: 1rem 0;
          padding: 1rem;
          background: #DBEAFE;
          border-left: 4px solid #3B82F6;
          border-radius: 8px;
        }

        .tip-node-header {
          font-weight: 600;
          color: #1E40AF;
          margin-bottom: 0.5rem;
        }

        /* Focus Styles */
        .itinerary-document-editor:focus-visible {
          outline: none;
        }

        .itinerary-document-editor.ProseMirror-focused {
          outline: none;
        }

        /* Selection Styles */
        .itinerary-document-editor ::selection {
          background: #BFDBFE;
        }

        /* Placeholder */
        .itinerary-document-editor.ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9CA3AF;
          pointer-events: none;
          height: 0;
        }

        /* Editable vs Non-editable Styles */
        .itinerary-document-editor[contenteditable="false"] {
          cursor: default;
        }

        .itinerary-document-editor[contenteditable="true"] {
          cursor: text;
        }

        /* Print Styles */
        @media print {
          .itinerary-document-editor {
            font-size: 14px;
          }

          .day-node {
            page-break-inside: avoid;
          }

          .destination-node {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <EditorContent
        editor={editor}
        className="itinerary-editor-content"
      />
    </div>
  );
});

ItineraryEditorDOM.displayName = 'ItineraryEditorDOM';

export default ItineraryEditorDOM;
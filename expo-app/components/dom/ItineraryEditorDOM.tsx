'use dom';

import React, { useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { JSONContent } from '@tiptap/react';
import { DiffVisualization } from './tiptap-diff-extension';
import {
  DestinationNode,
  DayNode,
  TransportationNode,
  GroupSplitNode,
  TipNode,
  LocationMark
} from './extensions';
import { LocationSearch } from './LocationSearch';
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
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectedTextForChat, setSelectedTextForChat] = useState('');
  const [showChatWithSelection, setShowChatWithSelection] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

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
      LocationMark,
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
      // Don't trigger onChange during preview mode
      if (onChange && !isPreviewMode) {
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

  // Listen for diff decoration messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('ItineraryEditorDOM - Received message:', event.data?.type);

      if (event.data?.type === 'set-diff-decorations' && editor) {
        console.log('ItineraryEditorDOM - Processing set-diff-decorations message with:', event.data.decorations);
        const result = editor.chain().focus().setDiffDecorations(event.data.decorations).run();
        console.log('ItineraryEditorDOM - setDiffDecorations result:', result);
      } else if (event.data?.type === 'clear-diff-decorations' && editor) {
        console.log('ItineraryEditorDOM - Processing clear-diff-decorations message');
        const result = editor.chain().focus().clearDiffDecorations().run();
        console.log('ItineraryEditorDOM - clearDiffDecorations result:', result);
      } else if (event.data?.type === 'show-proposed-content' && editor) {
        console.log('ItineraryEditorDOM - Processing show-proposed-content message');
        const { proposedContent, currentContent } = event.data;

        // Store original content for restoration
        if (!editorRef.current) {
          editorRef.current = { originalContent: editor.getJSON() };
        }

        // Temporarily show the proposed content
        if (proposedContent) {
          console.log('ItineraryEditorDOM - Setting proposed content');
          // Set the content to the proposed version
          editor.commands.setContent(proposedContent);

          // For now, skip the decorations to avoid position errors
          // We can see the changes by comparing the document content
          console.log('ItineraryEditorDOM - Proposed content set successfully');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [editor]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    setDiffDecorations: (decorations: any[]) => {
      console.log('ItineraryEditorDOM - setDiffDecorations called with:', decorations);
      if (editor && decorations) {
        // Use the chain to ensure command is available
        const result = editor.chain().focus().setDiffDecorations(decorations).run();
        console.log('ItineraryEditorDOM - setDiffDecorations result:', result);
      } else {
        console.log('ItineraryEditorDOM - Missing editor or decorations', { editor: !!editor, decorations: !!decorations });
      }
    },
    clearDiffDecorations: () => {
      console.log('ItineraryEditorDOM - clearDiffDecorations called');
      if (editor) {
        // Use the chain to ensure command is available
        const result = editor.chain().focus().clearDiffDecorations().run();
        console.log('ItineraryEditorDOM - clearDiffDecorations result:', result);
      }
    },
    applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => {
      console.log('ItineraryEditorDOM - applyTransactionSteps called with:', steps);
      if (editor && steps) {
        setIsPreviewMode(true); // Enter preview mode
        const result = editor.chain().focus().applyTransactionSteps(steps, inverseSteps).run();
        console.log('ItineraryEditorDOM - applyTransactionSteps result:', result);
        return result;
      }
      return false;
    },
    revertTransactionSteps: () => {
      console.log('ItineraryEditorDOM - revertTransactionSteps called');
      if (editor) {
        const result = editor.chain().focus().revertTransactionSteps().run();
        console.log('ItineraryEditorDOM - revertTransactionSteps result:', result);
        setIsPreviewMode(false); // Exit preview mode
        return result;
      }
      return false;
    },
    showProposedContent: (proposedContent: JSONContent, currentContent: JSONContent) => {
      console.log('ItineraryEditorDOM - showProposedContent called');
      if (editor && proposedContent) {
        // Store original if not already stored
        if (!editorRef.current) {
          editorRef.current = { originalContent: editor.getJSON() };
        }

        // Set the proposed content
        editor.commands.setContent(proposedContent);
        console.log('ItineraryEditorDOM - Proposed content applied');

        // Skip decorations for now to avoid position errors
      }
    },
  }), [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="itinerary-editor-wrapper">
      {editor && editable && (
        <BubbleMenu
          editor={editor}
        >
          <div
            style={{
              display: 'flex',
              gap: '4px',
              padding: '4px',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
          >
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive('bold') ? 'is-active' : ''}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: editor.isActive('bold') ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Bold (Cmd+B)"
            >
              B
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive('italic') ? 'is-active' : ''}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: editor.isActive('italic') ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: 'white',
                fontStyle: 'italic',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Italic (Cmd+I)"
            >
              I
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive('strike') ? 'is-active' : ''}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: editor.isActive('strike') ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: 'white',
                textDecoration: editor.isActive('strike') ? 'line-through' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Strikethrough"
            >
              S
            </button>
            <div style={{ width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.3)', margin: '4px' }} />
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: editor.isActive('heading', { level: 1 }) ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Heading 1"
            >
              H1
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: editor.isActive('heading', { level: 2 }) ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Heading 2"
            >
              H2
            </button>
            <div style={{ width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.3)', margin: '4px' }} />
            <button
              onClick={() => {
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, ' ');
                setSelectedText(text);
                setShowLocationSearch(true);
              }}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: editor.isActive('location') ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Add Location"
            >
              📍
            </button>
            <button
              onClick={() => {
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, ' ');
                setSelectedTextForChat(text);
                setShowChatWithSelection(true);
                // Send message to parent component
                if (window.parent !== window) {
                  window.parent.postMessage({
                    type: 'chat-with-selection',
                    text: text
                  }, '*');
                }
              }}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Ask AI about this"
            >
              💬
            </button>
          </div>
        </BubbleMenu>
      )}
      {showLocationSearch && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999999,
            }}
            onClick={() => setShowLocationSearch(false)}
          />
          <LocationSearch
            initialQuery={selectedText}
            onSelect={(location) => {
              editor.chain().focus().setLocation(location).run();
              setShowLocationSearch(false);
            }}
            onClose={() => setShowLocationSearch(false)}
          />
        </>
      )}
      <style>{`
        .itinerary-editor-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        .itinerary-document-editor {
          min-height: 500px;
          outline: none;
          font-size: 16px;
          line-height: 1.6;
          color: #111827;
          padding: 0 32px;
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

        /* Bubble Menu Styles */
        .tippy-box {
          background-color: transparent !important;
        }

        .tippy-content {
          padding: 0 !important;
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

/**
 * Calculate inline diff decorations by comparing current and proposed content
 */
function calculateInlineDiffDecorations(currentContent: any, proposedContent: any): any[] {
  const decorations: any[] = [];

  if (!currentContent || !proposedContent) {
    return decorations;
  }

  const currentNodes = currentContent.content || [];
  const proposedNodes = proposedContent.content || [];

  // Track position in the proposed document
  let pos = 1; // Start after doc opening

  // Helper to calculate node size
  const calculateNodeSize = (node: any): number => {
    if (!node) return 0;
    if (node.type === 'text') return node.text?.length || 0;

    let size = 2; // Node markers
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        size += calculateNodeSize(child);
      }
    }
    return size;
  };

  // Compare nodes and find additions
  for (let i = 0; i < proposedNodes.length; i++) {
    const proposedNode = proposedNodes[i];
    const currentNode = i < currentNodes.length ? currentNodes[i] : null;

    const nodeSize = calculateNodeSize(proposedNode);

    // Check if this is a new node (doesn't exist in current)
    if (!currentNode || i >= currentNodes.length) {
      // This is an addition - mark the entire node range
      decorations.push({
        from: pos,
        to: pos + nodeSize,
        type: 'addition',
        content: extractTextFromNode(proposedNode)
      });
    } else if (JSON.stringify(currentNode) !== JSON.stringify(proposedNode)) {
      // This is a modification
      decorations.push({
        from: pos,
        to: pos + nodeSize,
        type: 'modification',
        content: extractTextFromNode(proposedNode)
      });
    }

    pos += nodeSize;
  }

  console.log('calculateInlineDiffDecorations - Generated decorations:', decorations);
  return decorations;
}

/**
 * Extract text content from a node
 */
function extractTextFromNode(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';

  if (node.content && Array.isArray(node.content)) {
    return node.content.map((child: any) => extractTextFromNode(child)).join('');
  }

  return '';
}

export default ItineraryEditorDOM;
'use dom';

import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { JSONContent } from '@tiptap/react';
import { 
  DestinationNode,
  DayNode,
  TransportationNode,
  GroupSplitNode,
  TipNode
} from './extensions';

interface TipTapEditorProps {
  content?: JSONContent | string;
  onChange?: (content: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
}

export function TipTapEditor({ 
  content = '', 
  onChange, 
  editable = true,
  placeholder = 'Start writing your itinerary...'
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline',
        },
      }),
      DestinationNode,
      DayNode,
      TransportationNode,
      GroupSplitNode,
      TipNode,
    ],
    content,
    editable,
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

  const handleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run();
  }, [editor]);

  const handleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run();
  }, [editor]);

  const handleHeading = useCallback((level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  const handleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run();
  }, [editor]);

  const handleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run();
  }, [editor]);

  const handleLink = useCallback(() => {
    const previousUrl = editor?.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const handleAddDay = useCallback(() => {
    const dayNumber = window.prompt('Day number:', '1');
    const title = window.prompt('Day title:', 'Exploring Paris');
    const date = window.prompt('Date:', new Date().toISOString().split('T')[0]);
    
    if (dayNumber && title) {
      editor?.chain().focus().insertContent({
        type: 'day',
        attrs: {
          dayNumber: parseInt(dayNumber),
          title,
          date,
        },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Add your day activities here...' }],
          },
        ],
      }).run();
    }
  }, [editor]);

  const handleAddDestination = useCallback(() => {
    const name = window.prompt('Destination name:', 'Eiffel Tower');
    const context = window.prompt('Location context:', 'Paris, France');
    
    if (name) {
      editor?.chain().focus().insertContent({
        type: 'destination',
        attrs: {
          destinationId: `dest-${Date.now()}`,
          name,
          context,
          colorIndex: Math.floor(Math.random() * 8),
        },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Add destination details here...' }],
          },
        ],
      }).run();
    }
  }, [editor]);

  const handleAddTransport = useCallback(() => {
    const from = window.prompt('From:', 'Hotel');
    const to = window.prompt('To:', 'Eiffel Tower');
    const mode = window.prompt('Mode (walking/metro/bus/taxi/uber/bike/car):', 'metro');
    const duration = window.prompt('Duration:', '15 min');
    
    if (from && to) {
      editor?.chain().focus().insertContent({
        type: 'transportation',
        attrs: {
          transportId: `transport-${Date.now()}`,
          fromDestination: from,
          toDestination: to,
          mode: mode || 'walking',
          duration: duration || '10 min',
        },
      }).run();
    }
  }, [editor]);

  const handleAddTip = useCallback(() => {
    const category = window.prompt('Category (booking/timing/budget/local/food/transportation):', 'local');
    const tipText = window.prompt('Tip text:', 'Remember to book tickets in advance');
    
    if (tipText) {
      editor?.chain().focus().insertContent({
        type: 'tip',
        attrs: {
          tipId: `tip-${Date.now()}`,
          category: category || 'local',
        },
        content: [{ type: 'text', text: tipText }],
      }).run();
    }
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="tiptap-editor" style={{ width: '100%', height: '100%' }}>
      {editable && (
        <div className="toolbar" style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '12px',
          borderBottom: '1px solid #e5e5e5',
          backgroundColor: '#f9f9f9',
        }}>
          <button
            onClick={handleBold}
            className={editor.isActive('bold') ? 'is-active' : ''}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: editor.isActive('bold') ? '#007AFF' : 'white',
              color: editor.isActive('bold') ? 'white' : 'black',
              fontWeight: 'bold',
            }}
          >
            B
          </button>
          <button
            onClick={handleItalic}
            className={editor.isActive('italic') ? 'is-active' : ''}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: editor.isActive('italic') ? '#007AFF' : 'white',
              color: editor.isActive('italic') ? 'white' : 'black',
              fontStyle: 'italic',
            }}
          >
            I
          </button>
          <button
            onClick={() => handleHeading(1)}
            className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: editor.isActive('heading', { level: 1 }) ? '#007AFF' : 'white',
              color: editor.isActive('heading', { level: 1 }) ? 'white' : 'black',
            }}
          >
            H1
          </button>
          <button
            onClick={() => handleHeading(2)}
            className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: editor.isActive('heading', { level: 2 }) ? '#007AFF' : 'white',
              color: editor.isActive('heading', { level: 2 }) ? 'white' : 'black',
            }}
          >
            H2
          </button>
          <button
            onClick={handleBulletList}
            className={editor.isActive('bulletList') ? 'is-active' : ''}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: editor.isActive('bulletList') ? '#007AFF' : 'white',
              color: editor.isActive('bulletList') ? 'white' : 'black',
            }}
          >
            •
          </button>
          <button
            onClick={handleOrderedList}
            className={editor.isActive('orderedList') ? 'is-active' : ''}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: editor.isActive('orderedList') ? '#007AFF' : 'white',
              color: editor.isActive('orderedList') ? 'white' : 'black',
            }}
          >
            1.
          </button>
          <button
            onClick={handleLink}
            className={editor.isActive('link') ? 'is-active' : ''}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: editor.isActive('link') ? '#007AFF' : 'white',
              color: editor.isActive('link') ? 'white' : 'black',
            }}
          >
            🔗
          </button>
          <div style={{ borderLeft: '1px solid #ccc', height: '24px', margin: '0 8px' }} />
          <button
            onClick={handleAddDay}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: 'black',
            }}
            title="Add Day"
          >
            📅 Day
          </button>
          <button
            onClick={handleAddDestination}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: 'black',
            }}
            title="Add Destination"
          >
            📍 Place
          </button>
          <button
            onClick={handleAddTransport}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: 'black',
            }}
            title="Add Transportation"
          >
            🚇 Transport
          </button>
          <button
            onClick={handleAddTip}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: 'black',
            }}
            title="Add Tip"
          >
            💡 Tip
          </button>
        </div>
      )}
      <EditorContent 
        editor={editor} 
        style={{
          padding: '16px',
          minHeight: '300px',
          outline: 'none',
        }}
        className="prose prose-sm max-w-none"
      />
      <style>{`
        .ProseMirror {
          outline: none;
          min-height: 300px;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h1 {
          font-size: 2em;
          font-weight: bold;
          margin: 0.67em 0;
        }
        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin: 0.83em 0;
        }
        .ProseMirror h3 {
          font-size: 1.17em;
          font-weight: bold;
          margin: 1em 0;
        }
        .ProseMirror p {
          margin: 1em 0;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 2em;
          margin: 1em 0;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 2em;
          margin: 1em 0;
        }
        .ProseMirror li {
          margin: 0.5em 0;
        }
        .ProseMirror a {
          color: #007AFF;
          text-decoration: underline;
        }
        .ProseMirror strong {
          font-weight: bold;
        }
        .ProseMirror em {
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
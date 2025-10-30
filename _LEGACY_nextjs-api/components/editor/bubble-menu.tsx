'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Link2, Link2Off, Check, X } from 'lucide-react';

interface BubbleMenuComponentProps {
  editor: Editor | null;
}

export function BubbleMenuComponent({ editor }: BubbleMenuComponentProps) {
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!editor) return;

    // Check if current selection has a link
    const { from } = editor.state.selection;
    const marks = editor.state.doc.resolve(from).marks();
    const linkMark = marks.find((mark) => mark.type.name === 'link');

    if (linkMark) {
      setLinkUrl(linkMark.attrs.href || '');
    } else {
      setLinkUrl('');
    }
  }, [editor, editor?.state.selection]);

  const setLink = useCallback(() => {
    if (!editor) return;

    // If no URL provided, remove the link
    if (!linkUrl) {
      editor.chain().focus().unsetLink().run();
      setIsLinkMode(false);
      return;
    }

    // Update or add link
    editor.chain().focus().setLink({ href: linkUrl }).run();

    setIsLinkMode(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
    setIsLinkMode(false);
    setLinkUrl('');
  }, [editor]);

  const cancelLinkMode = useCallback(() => {
    setIsLinkMode(false);
    setLinkUrl('');
  }, []);

  if (!editor) {
    return null;
  }

  return (
    <TiptapBubbleMenu
      editor={editor}
      options={{
        placement: 'top',
      }}
      className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
    >
      {!isLinkMode ? (
        <>
          {/* Bold button */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
              editor.isActive('bold') ? 'bg-gray-200 dark:bg-gray-600' : ''
            }`}
            type="button"
            aria-label="Toggle bold"
          >
            <Bold size={18} />
          </button>

          {/* Italic button */}
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
              editor.isActive('italic') ? 'bg-gray-200 dark:bg-gray-600' : ''
            }`}
            type="button"
            aria-label="Toggle italic"
          >
            <Italic size={18} />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Link button */}
          <button
            onClick={() => {
              const { from } = editor.state.selection;
              const marks = editor.state.doc.resolve(from).marks();
              const linkMark = marks.find((mark) => mark.type.name === 'link');

              if (linkMark) {
                setLinkUrl(linkMark.attrs.href || '');
              }
              setIsLinkMode(true);
            }}
            className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
              editor.isActive('link') ? 'bg-gray-200 dark:bg-gray-600' : ''
            }`}
            type="button"
            aria-label="Add or edit link"
          >
            <Link2 size={18} />
          </button>

          {/* Remove link button - only show if there's an active link */}
          {editor.isActive('link') && (
            <button
              onClick={removeLink}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600"
              type="button"
              aria-label="Remove link"
            >
              <Link2Off size={18} />
            </button>
          )}
        </>
      ) : (
        /* Link input mode */
        <div className="flex items-center gap-2 p-1">
          <input
            type="url"
            placeholder="Enter URL..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setLink();
              } else if (e.key === 'Escape') {
                cancelLinkMode();
              }
            }}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={setLink}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-green-600"
            type="button"
            aria-label="Apply link"
          >
            <Check size={18} />
          </button>
          <button
            onClick={cancelLinkMode}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600"
            type="button"
            aria-label="Cancel"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </TiptapBubbleMenu>
  );
}

'use dom';

import React, { useEffect, useRef, useState } from 'react';
import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { DOMParser, Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';

// CSS for the editor
const editorStyles = `
  .ProseMirror {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    padding: 16px;
    min-height: 200px;
    outline: none;
  }

  .ProseMirror h1 {
    font-size: 28px;
    font-weight: bold;
    margin: 20px 0 16px 0;
    color: #1a1a1a;
  }

  .ProseMirror h2 {
    font-size: 24px;
    font-weight: 600;
    margin: 18px 0 12px 0;
    color: #2a2a2a;
  }

  .ProseMirror h3 {
    font-size: 20px;
    font-weight: 600;
    margin: 16px 0 8px 0;
    color: #3a3a3a;
  }

  .ProseMirror p {
    margin: 12px 0;
  }

  .ProseMirror ul, .ProseMirror ol {
    margin: 12px 0;
    padding-left: 24px;
  }

  .ProseMirror li {
    margin: 6px 0;
  }

  .ProseMirror em {
    font-style: italic;
  }

  .ProseMirror strong {
    font-weight: 600;
  }

  /* Geo mark styling */
  .geo-mark {
    background-color: #e8f4fd;
    border-radius: 4px;
    padding: 2px 6px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    display: inline-block;
  }

  .geo-mark:hover {
    background-color: #d0e9fc;
  }

  /* Color variations for geo marks */
  .geo-mark[data-color-index="0"] { background-color: #dbeafe; }
  .geo-mark[data-color-index="1"] { background-color: #d1fae5; }
  .geo-mark[data-color-index="2"] { background-color: #fed7aa; }
  .geo-mark[data-color-index="3"] { background-color: #fecaca; }
  .geo-mark[data-color-index="4"] { background-color: #e9d5ff; }
  .geo-mark[data-color-index="5"] { background-color: #fce7f3; }
  .geo-mark[data-color-index="6"] { background-color: #cffafe; }
  .geo-mark[data-color-index="7"] { background-color: #ecfccb; }
  .geo-mark[data-color-index="8"] { background-color: #fef3c7; }
  .geo-mark[data-color-index="9"] { background-color: #f3f4f6; }

  /* Typewriter effect cursor */
  .typewriter-cursor {
    display: inline-block;
    width: 2px;
    height: 1.2em;
    background-color: #3b82f6;
    animation: blink 1s infinite;
    vertical-align: text-bottom;
    margin-left: 2px;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  /* Smooth text appearance */
  .typewriter-new {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

interface ItineraryViewerDOMProps {
  htmlContent: string;
  isStreaming: boolean;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
}

export default function ItineraryViewerDOM({
  htmlContent,
  isStreaming,
  onLocationClick,
}: ItineraryViewerDOMProps) {
  const editorRef = useRef<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lastContent, setLastContent] = useState('');
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Initialize the editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Add styles to the document if not already present
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.textContent = editorStyles;
      document.head.appendChild(styleRef.current);
    }

    // Create custom schema with support for spans with attributes
    const customSchema = new Schema({
      nodes: {
        ...basicSchema.spec.nodes.toObject(),
      },
      marks: {
        ...basicSchema.spec.marks.toObject(),
        geo_mark: {
          attrs: {
            class: { default: 'geo-mark' },
            'data-geo': { default: 'true' },
            'data-lat': { default: 'PENDING' },
            'data-lng': { default: 'PENDING' },
            'data-place-name': { default: '' },
            'data-color-index': { default: null },
            title: { default: '' },
          },
          parseDOM: [
            {
              tag: 'span.geo-mark',
              getAttrs(dom) {
                const el = dom as HTMLElement;
                return {
                  class: el.className,
                  'data-geo': el.getAttribute('data-geo'),
                  'data-lat': el.getAttribute('data-lat'),
                  'data-lng': el.getAttribute('data-lng'),
                  'data-place-name': el.getAttribute('data-place-name'),
                  'data-color-index': el.getAttribute('data-color-index'),
                  title: el.getAttribute('title'),
                };
              },
            },
          ],
          toDOM(mark) {
            return [
              'span',
              {
                class: mark.attrs.class,
                'data-geo': mark.attrs['data-geo'],
                'data-lat': mark.attrs['data-lat'],
                'data-lng': mark.attrs['data-lng'],
                'data-place-name': mark.attrs['data-place-name'],
                'data-color-index': mark.attrs['data-color-index'],
                title: mark.attrs.title,
              },
            ];
          },
        },
      },
    });

    // Create the editor state
    const state = EditorState.create({
      schema: customSchema,
      plugins: [
        keymap(baseKeymap),
      ],
    });

    // Create the editor view
    const view = new EditorView(containerRef.current, {
      state,
      editable: () => false, // Read-only
      handleDOMEvents: {
        click: (view, event) => {
          const target = event.target as HTMLElement;
          if (target.classList.contains('geo-mark')) {
            const lat = target.getAttribute('data-lat');
            const lng = target.getAttribute('data-lng');
            const placeName = target.getAttribute('data-place-name') || target.textContent;

            if (lat && lng && lat !== 'PENDING' && lng !== 'PENDING' && onLocationClick) {
              onLocationClick(placeName || '', lat, lng);
            }
          }
          return false;
        },
      },
    });

    editorRef.current = view;

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Update content when it changes
  useEffect(() => {
    if (!editorRef.current || !htmlContent) return;

    // For streaming, we want to show incremental updates
    if (isStreaming) {
      // Find the new content that was added
      const newContent = htmlContent.slice(lastContent.length);

      if (newContent) {
        // Parse the full HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Create a new document from the HTML
        const parser = DOMParser.fromSchema(editorRef.current.state.schema);
        const doc = parser.parse(tempDiv);

        // Update the editor with the new content
        const tr = editorRef.current.state.tr.replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          doc.content
        );

        editorRef.current.dispatch(tr);

        // Scroll to bottom to show new content
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }

        setLastContent(htmlContent);
      }
    } else {
      // Not streaming, just replace all content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;

      const parser = DOMParser.fromSchema(editorRef.current.state.schema);
      const doc = parser.parse(tempDiv);

      const tr = editorRef.current.state.tr.replaceWith(
        0,
        editorRef.current.state.doc.content.size,
        doc.content
      );

      editorRef.current.dispatch(tr);
      setLastContent(htmlContent);
    }
  }, [htmlContent, isStreaming, lastContent]);

  // Add typewriter cursor when streaming
  useEffect(() => {
    if (!editorRef.current) return;

    if (isStreaming) {
      // Add a blinking cursor at the end of content
      const cursor = document.createElement('span');
      cursor.className = 'typewriter-cursor';
      cursor.innerHTML = '&nbsp;';

      // Try to append cursor to the last text node
      const proseMirror = containerRef.current?.querySelector('.ProseMirror');
      if (proseMirror) {
        const lastChild = proseMirror.lastElementChild;
        if (lastChild) {
          lastChild.appendChild(cursor);
        }
      }

      return () => {
        cursor.remove();
      };
    }
  }, [isStreaming, htmlContent]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    />
  );
}
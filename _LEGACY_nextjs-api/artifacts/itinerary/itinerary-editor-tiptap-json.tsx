'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import React, { memo, useEffect, useRef } from 'react';
import type { Suggestion } from '@/lib/db/schema';
import { useDebouncedCallback } from 'use-debounce';
import { BubbleMenuComponent } from '@/components/editor/bubble-menu';
import { DragHandleComponent } from '@/components/editor/drag-handle';
import { EditorFloatingMenu } from '@/components/editor/editor-floating-menu';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { PressHoldDrag } from '@/lib/editor/press-hold-drag-extension';
import { SuggestionsExtension } from '@/lib/editor/tiptap-suggestions-extension';
import {
  Details,
  DetailsSummary,
  DetailsContent,
} from '@tiptap/extension-details';
import { Transportation } from '@/lib/editor/transportation-extension';
import { DestinationNode } from '@/lib/editor/destination-node-extension';
import { SlashCommands } from '@/lib/editor/slash-commands';
import { TransportInsertion } from '@/lib/editor/transport-insertion-extension';
import type { LocationColorMap } from '@/artifacts/itinerary/location-color-assignment';
import type { TipTapDocument } from './types/tiptap-json';

// Custom Link extension that preserves locationData (without visual highlighting)
const CustomLink = Link.extend({
  name: 'link', // Keep the same name to override the default

  addAttributes() {
    return {
      ...this.parent?.(),
      // Store location metadata directly in the link attrs (for data purposes only)
      locationData: {
        default: null,
        parseHTML: (element) => {
          const dataAttr = element.getAttribute('data-location');
          if (dataAttr) {
            try {
              return JSON.parse(dataAttr);
            } catch {
              return null;
            }
          }
          return null;
        },
        renderHTML: (attributes) => {
          if (!attributes.locationData) {
            return {};
          }
          // Only store the data, no visual styling
          return {
            'data-location': JSON.stringify(attributes.locationData),
            'data-color-index': attributes.locationData.colorIndex,
          };
        },
      },
    };
  },
});

type EditorProps = {
  content: string; // JSON string
  onSaveContent: (updatedContent: string, debounce: boolean) => void; // Saves JSON string
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Array<Suggestion>;
  colorMap?: LocationColorMap | null;
};

function PureItineraryTipTapEditor({
  content,
  onSaveContent,
  suggestions,
  status,
  isCurrentVersion,
  currentVersionIndex,
  colorMap = null,
}: EditorProps) {
  const isInitialMount = useRef(true);
  const lastContent = useRef(content);
  const colorMapRef = useRef(colorMap);

  // Update color map ref when it changes
  useEffect(() => {
    colorMapRef.current = colorMap;
  }, [colorMap]);

  // Debounced save function
  const debouncedSave = useDebouncedCallback((jsonContent: string) => {
    onSaveContent(jsonContent, false);
  }, 500);

  const extensions = [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
        HTMLAttributes: {
          class: 'draggable-node',
        },
      },
      paragraph: {
        HTMLAttributes: {
          class: 'draggable-node',
        },
      },
      codeBlock: {
        HTMLAttributes: {
          class: 'draggable-node',
        },
      },
      // Disable the default link extension since we're using CustomLink
      link: false,
    }),
    PressHoldDrag.configure({
      holdDuration: 500, // 500ms hold to start dragging
      threshold: 5, // 5px movement threshold
    }),
    CustomLink.configure({
      openOnClick: false, // Disable clicking on links in the editor
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        class: 'hover:opacity-75 transition-opacity duration-200',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
    Placeholder.configure({
      placeholder: 'Start writing your itinerary...',
    }),
    // We use DestinationNode instead of generic Details for destinations
    // But keep Details for other collapsible content if needed
    Details.configure({
      persist: false,  // Don't persist open/closed state to database
      HTMLAttributes: {
        class: 'details-node draggable-node',
      },
    }),
    DetailsSummary.configure({
      HTMLAttributes: {
        class: 'details-summary',
      },
    }),
    DetailsContent.configure({
      HTMLAttributes: {
        class: 'details-content',
      },
    }),
    Transportation,
    DestinationNode,
    SlashCommands,
    TransportInsertion,
    // LocationDecorationsExtension not needed for JSON version - colors are in locationData
    SuggestionsExtension.configure({
      suggestions: suggestions,
    }),
  ];

  // Debug initial content
  console.log('[ItineraryEditorJSON] Initial content:', {
    type: typeof content,
    length: content?.length,
    isJSON: isValidJSON(content),
    preview: content?.substring(0, 200),
  });

  // Check if content is double-stringified
  let actualContent = content;
  if (
    content &&
    typeof content === 'string' &&
    content.startsWith('"') &&
    content.endsWith('"')
  ) {
    try {
      // Try to parse as double-stringified JSON
      const parsed = JSON.parse(content);
      if (typeof parsed === 'string' && isValidJSON(parsed)) {
        console.log(
          '[ItineraryEditorJSON] Content was double-stringified, unwrapping',
        );
        actualContent = parsed;
      }
    } catch {
      // Not double-stringified, use as-is
    }
  }

  const initialContent = actualContent ? parseContent(actualContent) : '';
  console.log('[ItineraryEditorJSON] Parsed initial content:', {
    type: typeof initialContent,
    isString: typeof initialContent === 'string',
    isObject: typeof initialContent === 'object',
    hasType:
      initialContent && typeof initialContent === 'object'
        ? initialContent.type
        : undefined,
    preview:
      typeof initialContent === 'string'
        ? initialContent.substring(0, 100)
        : JSON.stringify(initialContent).substring(0, 100),
  });

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: true,
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none focus:outline-none',
      },
    },
    onUpdate: ({ editor, transaction }) => {
      // Skip saving if explicitly marked
      if (transaction.getMeta('no-save')) {
        return;
      }

      // Get JSON content from the editor
      const jsonContent = JSON.stringify(editor.getJSON());

      // DEBUG: Log JSON structure to verify locationData is preserved
      console.log('[ItineraryEditorJSON] Saving JSON:', {
        hasLocationData: jsonContent.includes('locationData'),
        sampleLength: jsonContent.length,
        preview: jsonContent.substring(0, 200),
      });

      // Only save if content actually changed and not during streaming
      if (status !== 'streaming' && jsonContent !== lastContent.current) {
        lastContent.current = jsonContent;

        // Check if we should debounce
        if (transaction.getMeta('no-debounce')) {
          onSaveContent(jsonContent, false);
        } else {
          debouncedSave(jsonContent);
        }
      }
    },
    immediatelyRender: false, // Important for Next.js SSR
  });

  // Update editor content when prop changes
  useEffect(() => {
    if (!editor || !content) return;

    // Skip initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Don't skip if the editor is empty but we have content to load
      const currentContent = JSON.stringify(editor.getJSON());
      if (
        currentContent &&
        currentContent !== '{"type":"doc","content":[{"type":"paragraph"}]}'
      ) {
        return;
      }
    }

    // Check for double-stringified content here too
    let actualContent = content;
    if (
      content &&
      typeof content === 'string' &&
      content.startsWith('"') &&
      content.endsWith('"')
    ) {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'string' && isValidJSON(parsed)) {
          actualContent = parsed;
        }
      } catch {
        // Not double-stringified
      }
    }

    // Only update if content is different from what's in the editor
    const currentContent = JSON.stringify(editor.getJSON());

    // DEBUG: Log incoming content
    console.log('[ItineraryEditorJSON] Loading content in useEffect:', {
      hasLocationData: actualContent.includes('locationData'),
      isJSON: isValidJSON(actualContent),
      length: actualContent.length,
      needsUpdate: currentContent !== actualContent,
    });

    if (status === 'streaming' || currentContent !== actualContent) {
      // Preserve cursor position
      const { from, to } = editor.state.selection;

      // Set content as JSON
      const parsedContent = parseContent(actualContent);
      editor.commands.setContent(parsedContent);

      // Try to restore cursor position if not streaming
      if (status !== 'streaming') {
        editor.commands.setTextSelection({ from, to });
      }

      lastContent.current = actualContent;
    }
  }, [content, editor, status]);

  // Color map is handled through locationData in JSON, not through decorations

  // Update suggestions when they change
  useEffect(() => {
    if (editor && suggestions && suggestions.length > 0) {
      editor
        .chain()
        .command(({ tr }) => {
          tr.setMeta('suggestions', suggestions);
          return true;
        })
        .run();
    }
  }, [editor, suggestions]);

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full h-full">
      <BubbleMenuComponent editor={editor} />
      <EditorFloatingMenu editor={editor} />
      <DragHandleComponent editor={editor} />
      <EditorContent
        editor={editor}
        className="relative prose dark:prose-invert"
      />
      {suggestions && suggestions.length > 0 ? (
        <div className="md:hidden h-dvh w-12 shrink-0" />
      ) : null}
    </div>
  );
}

// Helper to check if content is valid JSON
function isValidJSON(str: string): boolean {
  try {
    const parsed = JSON.parse(str);
    return parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

// Helper to remove links from destination summaries
function processDestinationSummaries(doc: TipTapDocument): TipTapDocument {
  function processNode(node: any): any {
    // If this is a details node with destination class
    if (
      node.type === 'details' &&
      node.attrs?.class?.includes('destination-node')
    ) {
      return {
        ...node,
        content: node.content?.map((child: any) => {
          // Process detailsSummary to remove links
          if (child.type === 'detailsSummary') {
            return {
              ...child,
              content: child.content?.map((summaryChild: any) => {
                // If it's a text node with link marks, remove the link marks
                if (summaryChild.type === 'text' && summaryChild.marks) {
                  return {
                    ...summaryChild,
                    marks: summaryChild.marks.filter(
                      (mark: any) => mark.type !== 'link',
                    ),
                  };
                }
                // Process nested content
                if (summaryChild.content) {
                  return processNode(summaryChild);
                }
                return summaryChild;
              }),
            };
          }
          // Process other content normally
          if (child.content) {
            return processNode(child);
          }
          return child;
        }),
      };
    }

    // Process other nodes recursively
    if (node.content && Array.isArray(node.content)) {
      return {
        ...node,
        content: node.content.map(processNode),
      };
    }

    return node;
  }

  return processNode(doc);
}

// Helper to parse content (JSON or fallback to HTML)
function parseContent(content: string): TipTapDocument | string {
  if (!content) {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [],
        },
      ],
    };
  }

  // First try to parse as JSON
  if (isValidJSON(content)) {
    const parsed = JSON.parse(content);
    console.log('[ItineraryEditorJSON] Successfully parsed JSON:', {
      hasType: !!parsed.type,
      hasContent: !!parsed.content,
      contentLength: parsed.content?.length,
    });
    // Process to remove links from destination summaries
    return processDestinationSummaries(parsed);
  }

  // During streaming, we might get partial JSON - try to extract visible text
  // Look for patterns that indicate we're getting partial itinerary content
  if (
    content.includes('"type":"doc"') ||
    content.includes('"type":"paragraph"') ||
    content.includes('"type":"text"')
  ) {
    console.log(
      '[ItineraryEditorJSON] Detected partial JSON during streaming, showing raw text',
    );
    // Extract any visible text content from the partial JSON
    const textMatches = content.match(/"text":"([^"]*)"/g);
    if (textMatches && textMatches.length > 0) {
      const extractedText = textMatches
        .map((match) => match.replace(/"text":"/, '').replace(/"$/, ''))
        .join('\n\n');

      return {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: extractedText || 'Loading itinerary...',
              },
            ],
          },
        ],
      };
    }
  }

  // If it looks like HTML, return as-is (TipTap will parse it)
  if (content.includes('<') && content.includes('>')) {
    console.log('[ItineraryEditorJSON] Fallback to HTML parsing');
    return content;
  }

  console.log(
    '[ItineraryEditorJSON] Content is neither JSON nor HTML, using as plain text',
  );
  // Default to paragraph with the text
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: content || 'Loading itinerary...',
          },
        ],
      },
    ],
  };
}

// Memoize component to prevent unnecessary re-renders
export const ItineraryTipTapEditorJSON = memo(
  PureItineraryTipTapEditor,
  (prevProps, nextProps) => {
    if (prevProps.suggestions !== nextProps.suggestions) return false;

    if (prevProps.status === 'streaming' && nextProps.status === 'streaming') {
      return prevProps.content === nextProps.content;
    }

    return (
      prevProps.content === nextProps.content &&
      prevProps.onSaveContent === nextProps.onSaveContent &&
      prevProps.status === nextProps.status &&
      prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
      prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
      prevProps.colorMap === nextProps.colorMap
    );
  },
);

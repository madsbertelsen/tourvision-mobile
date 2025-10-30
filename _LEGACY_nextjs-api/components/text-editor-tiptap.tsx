'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import React, { memo, useEffect, useRef } from 'react';
import type { Suggestion } from '@/lib/db/schema';
import { useDebouncedCallback } from 'use-debounce';
import { BubbleMenuComponent } from '@/components/editor/bubble-menu';
import { 
  createTipTapExtensions, 
  editorPropsConfig, 
  TRANSACTION_KEYS 
} from '@/lib/editor/tiptap-config';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Array<Suggestion>;
};

function PureTipTapEditor({
  content,
  onSaveContent,
  suggestions,
  status,
  isCurrentVersion,
  currentVersionIndex,
}: EditorProps) {
  const isInitialMount = useRef(true);
  const lastContent = useRef(content);
  
  // Debounced save function
  const debouncedSave = useDebouncedCallback((content: string) => {
    onSaveContent(content, false);
  }, 500);

  const editor = useEditor({
    extensions: createTipTapExtensions(),
    content,
    editorProps: editorPropsConfig,
    onUpdate: ({ editor, transaction }) => {
      // Skip saving if explicitly marked
      if (transaction.getMeta(TRANSACTION_KEYS.NO_SAVE)) {
        return;
      }
      
      // Get HTML content from the editor
      const htmlContent = editor.getHTML();
      
      // Only save if content actually changed and not during streaming
      if (status !== 'streaming' && htmlContent !== lastContent.current) {
        lastContent.current = htmlContent;
        
        // Check if we should debounce
        if (transaction.getMeta(TRANSACTION_KEYS.NO_DEBOUNCE)) {
          onSaveContent(htmlContent, false);
        } else {
          debouncedSave(htmlContent);
        }
      }
    },
    immediatelyRender: false, // Important for Next.js SSR
  });

  // Update editor content when prop changes
  useEffect(() => {
    if (!editor || !content) return;
    
    // Skip initial mount only if editor already has content
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Don't skip if the editor is empty but we have content to load
      const currentContent = editor.getHTML();
      if (currentContent && currentContent !== '<p></p>' && currentContent !== '') {
        return;
      }
    }
    
    // Only update if content is different from what's in the editor
    const currentContent = editor.getHTML();
    
    if (status === 'streaming' || currentContent !== content) {
      // Preserve cursor position
      const { from, to } = editor.state.selection;
      
      // Set content directly as HTML
      editor.commands.setContent(content, false);
      
      // Try to restore cursor position
      if (status !== 'streaming') {
        editor.commands.setTextSelection({ from, to });
      }
      
      lastContent.current = content;
    }
  }, [content, editor, status]);

  // Handle suggestions (will be converted to TipTap extension later)
  useEffect(() => {
    if (!editor || !suggestions || suggestions.length === 0) return;
    
    // TODO: Implement suggestions as TipTap decorations/extension
    // For now, this is a placeholder for the suggestions functionality
  }, [editor, suggestions]);

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full h-full prose prose-sm dark:prose-invert max-w-none">
      <BubbleMenuComponent editor={editor} />
      <EditorContent 
        editor={editor} 
        className="w-full h-full overflow-auto focus:outline-none"
      />
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === 'streaming' && nextProps.status === 'streaming') &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent
  );
}

export const TipTapEditor = memo(PureTipTapEditor, areEqual);
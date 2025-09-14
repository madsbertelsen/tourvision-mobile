import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
// import Typography from '@tiptap/extension-typography'; // Temporarily disabled - causing isSpace error
import type { Extensions } from '@tiptap/react';
import { LocationDetails, DetailsSummary, DetailsContent } from './location-details-extension';
import { Transportation } from './transportation-extension';
import { Destination } from './destination-extension';
import { SlashCommands } from './slash-commands';

export const createTipTapExtensions = (): Extensions => {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      // Enable code block now that we're using HTML
      codeBlock: true,
    }),
    Link.configure({
      openOnClick: true,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        class: 'text-blue-500 hover:underline cursor-pointer',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
    Placeholder.configure({
      placeholder: 'Start writing...',
    }),
    LocationDetails,
    DetailsSummary,
    DetailsContent,
    Transportation,
    Destination,
    SlashCommands,
    // Typography, // Adds smart quotes, ellipsis, etc. - Temporarily disabled - causing isSpace error
  ];
};

export const editorPropsConfig = {
  attributes: {
    class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[500px] p-4',
  },
};

// Transaction metadata keys - similar to ProseMirror implementation
export const TRANSACTION_KEYS = {
  NO_SAVE: 'no-save',
  NO_DEBOUNCE: 'no-debounce',
  LOCATION_COLOR_MAP: 'locationColorMap',
  SUGGESTIONS: 'suggestions',
} as const;
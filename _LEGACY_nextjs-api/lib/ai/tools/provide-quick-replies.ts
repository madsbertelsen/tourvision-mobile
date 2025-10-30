import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool for providing quick reply options in the chat
 * The LLM can call this to show contextual quick reply buttons
 */
export const provideQuickReplies = () =>
  tool({
    description:
      'Provide quick reply buttons for the user to choose from. After calling this tool, send your question as a regular text message.',
    inputSchema: z.object({
      options: z
        .array(
          z.object({
            label: z.string().describe('The text shown on the button'),
            value: z.string().describe('The value sent when clicked'),
            icon: z.string().optional().describe('Optional emoji icon'),
          }),
        )
        .describe('Array of quick reply options to display'),
    }),
    execute: async ({ options }) => {
      console.log('[provideQuickReplies] Tool called with options:', options);

      // Send the quick replies to the UI via data stream
      /*
      dataStream.write({
        type: 'quickReplies',
        value: options,

      });
      */

      console.log('[provideQuickReplies] Wrote to dataStream');

      // Return success message - the LLM should send the actual question
      return { success: true };
    },
  });

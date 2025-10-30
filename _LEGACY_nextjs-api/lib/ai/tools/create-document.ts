import { generateUUID } from '@/lib/utils';
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';
import type { ChatMessage } from '@/lib/types';

interface CreateDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const createDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      'Create a document for a writing or content creation activities. This tool will call other functions that will generate the contents of the document based on the title and kind.',
    inputSchema: z.object({
      title: z.string(),
      kind: z.enum(artifactKinds),
    }),
    execute: async ({ title, kind }) => {
      const id = generateUUID();

      // Validation: Check if title indicates itinerary but kind is wrong
      const isItineraryTitle = /itinerary|trip|travel|journey|tour|vacation|holiday/i.test(title);
      if (isItineraryTitle && kind === 'text') {
        console.warn(`[CreateDocument] Warning: Creating document with title "${title}" as 'text' but it appears to be an itinerary. Consider using kind: 'itinerary' instead.`);
      }

      // Log document creation for debugging
      console.log(`[CreateDocument] Creating document: { title: "${title}", kind: "${kind}", id: "${id}" }`);

      dataStream.write({
        type: 'data-kind',
        data: kind,
        transient: true,
      });

      dataStream.write({
        type: 'data-id',
        data: id,
        transient: true,
      });

      dataStream.write({
        type: 'data-title',
        data: title,
        transient: true,
      });

      dataStream.write({
        type: 'data-clear',
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind,
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      await documentHandler.onCreateDocument({
        id,
        title,
        dataStream,
        session,
      });

      dataStream.write({ type: 'data-finish', data: null, transient: true });

      // Schedule enrichment for itinerary documents after streaming completes
      if (kind === 'itinerary') {
        // Store the document info for enrichment in onFinish
        dataStream.write({
          type: 'data-enrichment-pending',
          data: { id, kind },
          transient: true,
        });
      }

      return {
        id,
        title,
        kind,
        content: 'A document was created and is now visible to the user.',
      };
    },
  });

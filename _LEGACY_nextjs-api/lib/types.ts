import { z } from 'zod';
import type { getWeather } from './ai/tools/get-weather';
import type { createDocument } from './ai/tools/create-document';
import type { updateDocument } from './ai/tools/update-document';
import type { requestSuggestions } from './ai/tools/request-suggestions';
import type { provideQuickReplies } from './ai/tools/provide-quick-replies';
import type { suggestPlaces } from './ai/tools/suggest-places';
import type { InferUITool, UIMessage } from 'ai';

import type { ArtifactKind } from '@/components/artifact';
import type { Suggestion } from './db/schema';

export type DataPart = { type: 'append-message'; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type provideQuickRepliesTool = InferUITool<
  ReturnType<typeof provideQuickReplies>
>;
type suggestPlacesTool = InferUITool<ReturnType<typeof suggestPlaces>>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  provideQuickReplies: provideQuickRepliesTool;
  suggestPlaces: suggestPlacesTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  quickReplies: Array<{ label: string; value: string; icon?: string }>;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}

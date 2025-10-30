'use client';
import { AnimatePresence, motion } from 'framer-motion';
import equal from 'fast-deep-equal';
import { memo, useState, lazy, Suspense } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon, } from './icons';
import { Response } from './elements/response';
import { MessageContent } from './elements/message';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from './elements/tool';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import { cn, sanitizeText } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import { ItineraryDocumentPreview } from './itinerary-document-preview';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { useExplorePlacesStream } from '@/hooks/use-explore-places-stream';

// Lazy load the ExplorePlace component to avoid SSR issues with Mapbox
const ExplorePlace = lazy(() => import('./explore-place-horizontal-scroll').then(mod => ({ default: mod.ExplorePlaceHorizontalScroll })));

// Component to handle streaming suggestPlaces display
const SuggestPlacesContent = ({ part, state }: { part: any; state: string }) => {
  // Get streaming data from the custom hook
  const streamingData = useExplorePlacesStream();
  
  // Determine what data to display
  const displayData = streamingData || (state === 'output-available' ? part.output : null);
  const hasPlaces = displayData?.places?.length > 0;
  
  console.log('[SuggestPlacesContent] State:', state, 'Streaming data:', streamingData, 'Display data:', displayData);
  
  // Show loading state when we don't have any data yet
  if (!hasPlaces) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full size-5 border-b-2 border-primary" />
          <span className="text-sm text-muted-foreground">
            {streamingData ? `Found ${streamingData.places?.length || 0} places so far...` : 'Preparing personalized places...'}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Finding the best attractions, restaurants, and experiences based on your preferences...
        </div>
      </div>
    );
  }
  
  // Show the ExplorePlace component with available data
  return (
    <div className="overflow-hidden">
      <Suspense fallback={<div className="p-4">Loading places...</div>}>
        <ExplorePlace
          city={displayData.city}
          places={displayData.places}
          onComplete={(reactions) => {
            console.log('[ExplorePlace] User reactions:', reactions);
            // TODO: Send reactions back to AI for itinerary generation
          }}
        />
      </Suspense>
    </div>
  );
};

// Type narrowing is handled by TypeScript's control flow analysis
// The AI SDK provides proper discriminated unions for tool calls

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  useDataStream();

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn('flex items-start gap-3', {
            'w-full': mode === 'edit',
            'max-w-xl ml-auto justify-end':
              message.role === 'user' && mode !== 'edit',
            'justify-start -ml-3': message.role === 'assistant',
          })}
        >
          {message.role === 'assistant' && (
            <div className="flex justify-center items-center mt-1 rounded-full ring-1 size-8 shrink-0 ring-border bg-background">
              <SparklesIcon size={14} />
            </div>
          )}

          <div
            className={cn('flex flex-col gap-4', {
              'min-h-96': message.role === 'assistant' && requiresScrollPadding,
              'flex-1 min-w-0': message.role === 'assistant',
              'w-fit': message.role === 'user',
            })}
          >
            {attachmentsFromMessage.length > 0 && (
              <div
                data-testid={`message-attachments`}
                className="flex flex-row gap-2 justify-end"
              >
                {attachmentsFromMessage.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={{
                      name: attachment.filename ?? 'file',
                      contentType: attachment.mediaType,
                      url: attachment.url,
                    }}
                  />
                ))}
              </div>
            )}

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;
              
              // Debug logging for tool calls
              if (type?.startsWith('tool-')) {
                console.log('[Message] Tool part type:', type, 'state:', 'state' in part ? part.state : 'N/A');
              }

              if (type === 'reasoning' && part.text?.trim().length > 0) {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.text}
                  />
                );
              }

              if (type === 'text') {
                if (mode === 'view') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 rounded-full opacity-0 h-fit text-muted-foreground group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <MessageContent
                        data-testid="message-content"
                        className={cn('justify-start items-start text-left', {
                          'bg-primary text-primary-foreground':
                            message.role === 'user',
                          'bg-transparent -ml-4': message.role === 'assistant',
                        })}
                      >
                        <Response>{sanitizeText(part.text)}</Response>
                      </MessageContent>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div
                      key={key}
                      className="flex flex-row gap-3 items-start w-full"
                    >
                      <div className="size-8" />
                      <div className="flex-1 min-w-0">
                        <MessageEditor
                          key={message.id}
                          message={message}
                          setMode={setMode}
                          setMessages={setMessages}
                          regenerate={regenerate}
                        />
                      </div>
                    </div>
                  );
                }
              }

              if (type === 'tool-getWeather') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-getWeather" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={part.input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={<Weather weatherAtLocation={part.output} />}
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-createDocument') {
                const { toolCallId, state } = part;

                if (part.output && 'error' in part.output) {
                  return (
                    <div
                      key={toolCallId}
                      className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/50"
                    >
                      Error creating document: {String(part.output.error)}
                    </div>
                  );
                }
                
                // For itinerary documents, always show the custom preview with place selection UI
                if (part.input?.kind === 'itinerary') {
                  console.log('[Message] createDocument for itinerary - using ItineraryDocumentPreview', { 
                    state, 
                    input: part.input,
                    output: part.output
                  });
                  
                  return (
                    <ItineraryDocumentPreview
                      key={toolCallId}
                      part={part}
                      state={state}
                      isReadonly={isReadonly}
                    />
                  );
                }

                return (
                  <DocumentPreview
                    key={toolCallId}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                );
              }

              if (type === 'tool-updateDocument') {
                const { toolCallId } = part;

                if (part.output && 'error' in part.output) {
                  return (
                    <div
                      key={toolCallId}
                      className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/50"
                    >
                      Error updating document: {String(part.output.error)}
                    </div>
                  );
                }

                return (
                  <div key={toolCallId} className="relative">
                    <DocumentPreview
                      isReadonly={isReadonly}
                      result={part.output}
                      args={{ ...part.output, isUpdate: true }}
                    />
                  </div>
                );
              }

              if (type === 'tool-requestSuggestions') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-requestSuggestions" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={part.input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in part.output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String(part.output.error)}
                              </div>
                            ) : (
                              <DocumentToolResult
                                type="request-suggestions"
                                result={part.output}
                                isReadonly={isReadonly}
                              />
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-provideQuickReplies') {
                // Hide the tool call - the LLM should send its own text message
                // Quick replies are displayed via the dataStream
                return null;
              }

              if (type === 'tool-suggestPlaces') {
                const { toolCallId, state } = part;
                
                console.log('[Message] suggestPlaces part:', { 
                  state, 
                  hasInput: !!part.input,
                  hasOutput: !!part.output,
                  input: part.input,
                  output: part.output
                });
                
                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-suggestPlaces" state={state} />
                    <ToolContent>
                      <SuggestPlacesContent part={part} state={state} />
                    </ToolContent>
                  </Tool>
                );
              }
            })}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return false;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div className="flex items-start gap-3 justify-start -ml-3">
        <div className="flex justify-center items-center mt-1 rounded-full ring-1 size-8 shrink-0 ring-border bg-background">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-4 w-full">
          <MessageContent className="bg-transparent -ml-4">
            <div className="text-muted-foreground">Hmm...</div>
          </MessageContent>
        </div>
      </div>
    </motion.div>
  );
};

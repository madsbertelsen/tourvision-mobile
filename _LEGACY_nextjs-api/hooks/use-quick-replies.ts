import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

interface QuickReply {
  label: string;
  value: string;
  icon?: string;
}

/**
 * Hook to get quick replies from the latest assistant message
 * The LLM sends these via the provideQuickReplies tool
 */
export function useQuickReplies(messages: ChatMessage[]): QuickReply[] {
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

  useEffect(() => {
    if (!messages || messages.length === 0) {
      return;
    }

    // Find the last assistant message
    const lastAssistantMessage = [...messages]
      .reverse()
      .find(msg => msg.role === 'assistant');

    if (!lastAssistantMessage || !lastAssistantMessage.parts) {
      setQuickReplies([]);
      return;
    }

    // Look for provideQuickReplies tool calls in the message parts
    const quickReplyPart = lastAssistantMessage.parts.find(
      part => part.type === 'tool-provideQuickReplies'
    );

    if (quickReplyPart?.input?.options) {
      console.log('[useQuickReplies] Found quick replies in message:', quickReplyPart.input.options);
      setQuickReplies(quickReplyPart.input.options);
    } else {
      // Clear quick replies if none found
      setQuickReplies([]);
    }
  }, [messages]);

  return quickReplies;
}
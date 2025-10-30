'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

interface QuickReply {
  label: string;
  value: string;
  icon?: string;
}

interface QuickRepliesProps {
  replies: QuickReply[];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  className?: string;
}

export function QuickReplies({ replies, sendMessage, className }: QuickRepliesProps) {
  console.log('[QuickReplies] Rendering with replies:', replies);
  
  if (!replies || replies.length === 0) {
    console.log('[QuickReplies] No replies to render');
    return null;
  }

  const handleClick = (value: string) => {
    console.log('[QuickReplies] Button clicked with value:', value);
    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: value }],
    });
  };

  return (
    <div className={cn('flex flex-wrap gap-2 px-4 pb-2', className)}>
      {replies.map((reply, index) => (
        <motion.div
          key={reply.value}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4 py-2 text-sm font-normal hover:bg-primary/10"
            onClick={() => handleClick(reply.value)}
          >
            {reply.icon && <span className="mr-2">{reply.icon}</span>}
            {reply.label}
          </Button>
        </motion.div>
      ))}
    </div>
  );
}
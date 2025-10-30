'use client';

import React from 'react';
import { DragHandle as TipTapDragHandle } from '@tiptap/extension-drag-handle-react';
import { GripVertical } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface DragHandleComponentProps {
  editor: Editor;
}

export function DragHandleComponent({ editor }: DragHandleComponentProps) {
  return (
    <TipTapDragHandle editor={editor} className="drag-handle">
      <div className="drag-handle-inner flex items-center justify-center p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-grab active:cursor-grabbing">
        <GripVertical className="size-4 text-gray-400" />
      </div>
    </TipTapDragHandle>
  );
}
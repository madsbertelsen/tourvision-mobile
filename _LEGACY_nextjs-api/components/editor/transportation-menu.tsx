'use client';

import React from 'react';
import { FloatingMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { Car, Bike, FootprintsIcon } from 'lucide-react';
import type { TransportMode } from '@/lib/editor/transportation-helpers';

interface TransportationMenuProps {
  editor: Editor;
}

export function TransportationMenu({ editor }: TransportationMenuProps) {
  const insertTransportation = (mode: TransportMode) => {
    editor.chain().focus().insertTransportation({ mode }).run();
  };

  return (
    <FloatingMenu
      editor={editor}
      options={{}}
      className="floating-menu"
    >
      <div className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <button
          onClick={() => insertTransportation('walking')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Add walking route"
        >
          <FootprintsIcon className="w-4 h-4 text-green-600" />
        </button>
        <button
          onClick={() => insertTransportation('driving')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Add driving route"
        >
          <Car className="w-4 h-4 text-blue-600" />
        </button>
        <button
          onClick={() => insertTransportation('cycling')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Add cycling route"
        >
          <Bike className="w-4 h-4 text-amber-600" />
        </button>
      </div>
    </FloatingMenu>
  );
}

'use client';

import React, { useState } from 'react';
import { FloatingMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { MapPin, Plus, X } from 'lucide-react';
import { getMarkerColor } from '@/artifacts/itinerary/marker-colors';

interface DestinationMenuProps {
  editor: Editor;
}

export function DestinationMenu({ editor }: DestinationMenuProps) {
  const [showForm, setShowForm] = useState(false);
  const [destinationName, setDestinationName] = useState('');
  const [destinationContext, setDestinationContext] = useState('');
  const [destinationDescription, setDestinationDescription] = useState('');

  const handleInsertDestination = () => {
    if (!destinationName.trim()) return;

    // Get the next color index based on existing destinations
    const doc = editor.getJSON();
    let destinationCount = 0;
    
    // Count existing destinations in the document
    const countDestinations = (node: any): void => {
      if (node.type === 'destination') {
        destinationCount++;
      }
      if (node.content) {
        node.content.forEach(countDestinations);
      }
    };
    
    if (doc.content) {
      doc.content.forEach(countDestinations);
    }

    // Get color for the new destination
    const colorIndex = destinationCount;
    const color = getMarkerColor(colorIndex);

    // Insert the destination with proper structure
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'destination',
        attrs: {
          name: destinationName,
          context: destinationContext,
          geometry: { type: 'point' },
          colorIndex: colorIndex,
          color: color,
          open: true,
        },
        content: [
          {
            type: 'detailsSummary',
            content: [
              {
                type: 'text',
                text: destinationName,
              },
            ],
          },
          {
            type: 'detailsContent',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: destinationDescription || `Details about ${destinationName}...`,
                  },
                ],
              },
            ],
          },
        ],
      })
      .run();

    // Reset form
    setDestinationName('');
    setDestinationContext('');
    setDestinationDescription('');
    setShowForm(false);
  };

  const handleCancel = () => {
    setDestinationName('');
    setDestinationContext('');
    setDestinationDescription('');
    setShowForm(false);
  };

  return (
    <FloatingMenu
      editor={editor}
      options={{ 
        placement: 'bottom-start',
      }}
      className="floating-menu"
    >
      {!showForm ? (
        <div className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Add destination"
          >
            <Plus className="w-4 h-4" />
            <MapPin className="w-4 h-4 text-blue-600" />
            <span className="text-sm">Destination</span>
          </button>
        </div>
      ) : (
        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add Destination</h3>
            <button
              onClick={handleCancel}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={destinationName}
                onChange={(e) => setDestinationName(e.target.value)}
                placeholder="e.g., Tivoli Gardens"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && destinationName.trim()) {
                    e.preventDefault();
                    handleInsertDestination();
                  }
                  if (e.key === 'Escape') {
                    handleCancel();
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Location
              </label>
              <input
                type="text"
                value={destinationContext}
                onChange={(e) => setDestinationContext(e.target.value)}
                placeholder="e.g., Copenhagen, Denmark"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && destinationName.trim()) {
                    e.preventDefault();
                    handleInsertDestination();
                  }
                  if (e.key === 'Escape') {
                    handleCancel();
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Description
              </label>
              <textarea
                value={destinationDescription}
                onChange={(e) => setDestinationDescription(e.target.value)}
                placeholder="Add details about this destination..."
                rows={3}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey && destinationName.trim()) {
                    e.preventDefault();
                    handleInsertDestination();
                  }
                  if (e.key === 'Escape') {
                    handleCancel();
                  }
                }}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleInsertDestination}
                disabled={!destinationName.trim()}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                Add Destination
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </FloatingMenu>
  );
}
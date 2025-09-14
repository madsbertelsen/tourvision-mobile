import type { Editor } from '@tiptap/core';
import { getMarkerColor } from '@/artifacts/itinerary/marker-colors';

export interface InsertDestinationOptions {
  name: string;
  context?: string;
  description?: string;
  colorIndex?: number;
  open?: boolean;
}

/**
 * Insert a properly formatted destination element
 * Uses the existing details/summary structure with proper styling
 */
export function insertDestination(editor: Editor, options: InsertDestinationOptions) {
  const { name, context = '', description = '', colorIndex = 0, open = true } = options;
  
  // Get color for this destination
  const color = getMarkerColor(colorIndex);
  
  // Create the HTML structure that matches what the AI generates
  const destinationData = {
    name,
    context,
    geometry: { type: 'point' },
    type: 'destination'
  };
  
  // Build the HTML content
  const bgOpacity = '08';
  const borderOpacity = 'FF';
  const style = `border-left: 4px solid ${color}${borderOpacity}; background-color: ${color}${bgOpacity}; --destination-color: ${color};`;
  
  const html = `<details class="destination-node" data-destination='${JSON.stringify(destinationData)}' data-color-index="${colorIndex}" data-color="${color}" style="${style}" ${open ? 'open' : ''}>
  <summary><span data-context="${context}">${name}</span></summary>
  <div class="details-content"><p>${description || `Details about ${name}...`}</p></div>
</details>`;
  
  // Insert the HTML content
  editor.chain().focus().insertContent(html, {
    parseOptions: {
      preserveWhitespace: false,
    }
  }).run();
}

/**
 * Add the insertDestination command to the editor
 */
export function addInsertDestinationCommand(editor: Editor) {
  editor.registerCommand('insertDestination', (options: InsertDestinationOptions) => {
    insertDestination(editor, options);
    return true;
  });
}
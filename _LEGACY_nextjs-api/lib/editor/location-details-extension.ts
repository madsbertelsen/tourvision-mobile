import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Custom Details extension that integrates with location highlighting
 * This extension creates collapsible sections for location information
 */
export const LocationDetails = Node.create({
  name: 'details',
  
  group: 'block',
  
  content: 'detailsSummary detailsContent',
  
  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: element => element.hasAttribute('open'),
        renderHTML: attributes => {
          if (!attributes.open) {
            return {};
          }
          return {
            open: 'open',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },

  // Don't use custom nodeView - let browser handle details natively
  // This ensures the details element remains interactive
});

/**
 * DetailsSummary node for the summary element within details
 */
export const DetailsSummary = Node.create({
  name: 'detailsSummary',
  
  content: 'inline*',
  
  // Don't use group here, it's a child of details
  
  defining: true,
  
  parseHTML() {
    return [
      {
        tag: 'summary',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * DetailsContent node for the content within details (after summary)
 */
export const DetailsContent = Node.create({
  name: 'detailsContent',
  
  content: 'block+',
  
  // Don't use group here, it's a child of details
  
  parseHTML() {
    return [
      {
        tag: 'div[data-details-content]',
      },
      {
        // Also parse content that comes after summary without wrapper
        getContent: (element, schema) => {
          // Get all siblings after summary
          const summary = element.querySelector('summary');
          if (!summary) return null;
          
          const content = [];
          let sibling = summary.nextSibling;
          while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE) {
              content.push(sibling);
            }
            sibling = sibling.nextSibling;
          }
          
          if (content.length === 0) return null;
          
          // Parse the content
          const fragment = schema.parseDOM(content);
          return fragment;
        },
        context: 'details/',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-details-content': '' }, HTMLAttributes), 0];
  },
});

/**
 * Helper to create a details block with location
 */
export function createDetailsWithLocation(
  locationName: string,
  context: string,
  description: string
): string {
  return `
    <details>
      <summary><location data-context="${context}">${locationName}</location></summary>
      <p>${description}</p>
    </details>
  `;
}

/**
 * Parse details elements to extract location information
 */
export function parseDetailsForLocations(html: string): Array<{
  name: string;
  context: string;
  description: string;
}> {
  const locations: Array<{ name: string; context: string; description: string }> = [];
  
  // Match details blocks with location tags
  const detailsPattern = /<details[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?<location\s+data-context="([^"]+)">([^<]+)<\/location>[\s\S]*?<\/summary>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/details>/gi;
  
  let match;
  while ((match = detailsPattern.exec(html)) !== null) {
    locations.push({
      context: match[1],
      name: match[2],
      description: match[3].replace(/<[^>]*>/g, '').trim(), // Strip HTML tags from description
    });
  }
  
  return locations;
}
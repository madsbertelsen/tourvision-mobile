/**
 * Count existing destination elements in the editor
 * Destinations are details elements with the 'destination-node' class
 */
export function countDestinations(doc: any): number {
  let count = 0;
  
  const traverse = (node: any): void => {
    // Check if this is a details node with destination class
    if (node.type === 'details') {
      // Check for destination marker in various ways
      // Could be in attrs.class or in the HTML content
      if (node.attrs?.class?.includes('destination-node')) {
        count++;
      }
    }
    
    // Also check HTML content for destination nodes (for parsed content)
    if (node.type === 'text' && node.text?.includes('destination-node')) {
      // This is likely part of HTML content, count the occurrences
      const matches = node.text.match(/class="[^"]*destination-node[^"]*"/g);
      if (matches) {
        count += matches.length;
      }
    }
    
    // Recursively traverse children
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  };
  
  if (doc.content) {
    doc.content.forEach(traverse);
  }
  
  // Alternative: count by looking at the rendered HTML
  // This is more reliable but requires DOM access
  if (typeof document !== 'undefined') {
    const destinationElements = document.querySelectorAll('.destination-node');
    if (destinationElements.length > 0) {
      return destinationElements.length;
    }
  }
  
  return count;
}
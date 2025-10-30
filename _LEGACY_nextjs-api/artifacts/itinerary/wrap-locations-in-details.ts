/**
 * Post-process HTML to wrap standalone location mentions in collapsible details sections
 */
export function wrapLocationsInDetails(html: string): string {
  // Pattern to find location tags that are NOT already in a details/summary structure
  // First, let's identify all existing details blocks to avoid double-wrapping
  const detailsPattern = /<details[^>]*>[\s\S]*?<\/details>/gi;
  const existingDetails: Array<{ start: number; end: number }> = [];
  let match;
  
  while ((match = detailsPattern.exec(html)) !== null) {
    existingDetails.push({
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  // Now find all location tags
  const locationPattern = /<location\s+data-context="([^"]+)">([^<]+)<\/location>/g;
  const replacements: Array<{ original: string; replacement: string; index: number }> = [];
  
  while ((match = locationPattern.exec(html)) !== null) {
    const fullMatch = match[0];
    const context = match[1];
    const name = match[2];
    const index = match.index;
    
    // Check if this location is already inside a details block
    const isInDetails = existingDetails.some(detail => 
      index >= detail.start && index <= detail.end
    );
    
    if (!isInDetails) {
      // Find the surrounding context to extract description
      // Look for text after the location until the next tag or line break
      const afterLocation = html.substring(index + fullMatch.length);
      
      // Try to extract a description - look for text after the location
      let description = '';
      
      // Check if there's a period followed by text that describes the location
      const descPattern = /^\.\s*([^<\n]+?)(?=[<\n]|$)/;
      const descMatch = afterLocation.match(descPattern);
      
      if (descMatch) {
        description = descMatch[1].trim();
      } else {
        // If no immediate description, look for the next sentence
        const sentencePattern = /^[^.]*?\.\s*([^.]+?\.)(?=[<\n]|$)/;
        const sentenceMatch = afterLocation.match(sentencePattern);
        if (sentenceMatch) {
          description = sentenceMatch[1].trim();
        }
      }
      
      // If we still don't have a description, provide a default
      if (!description) {
        description = `A notable location in ${context}. Click to expand for more details.`;
      }
      
      // Create the details/summary structure
      const detailsBlock = `<details>
  <summary>${fullMatch}</summary>
  <p>${description}</p>
</details>`;
      
      replacements.push({
        original: fullMatch + (descMatch ? descMatch[0] : ''),
        replacement: detailsBlock,
        index: index
      });
    }
  }
  
  // Apply replacements in reverse order to maintain indices
  let result = html;
  replacements.sort((a, b) => b.index - a.index);
  
  for (const { original, replacement, index } of replacements) {
    result = result.substring(0, index) + replacement + result.substring(index + original.length);
  }
  
  return result;
}

/**
 * Check if HTML contains any details elements
 */
export function hasDetailsElements(html: string): boolean {
  return /<details[^>]*>/.test(html);
}

/**
 * Ensure all locations in bullet points are converted to collapsible sections
 */
export function convertBulletLocationsToDetails(html: string): string {
  // Pattern to match list items with locations
  const listItemPattern = /<li>[\s\S]*?<location\s+data-context="([^"]+)">([^<]+)<\/location>[\s\S]*?<\/li>/gi;
  let result = html;
  
  // Debug logging
  const hasListItems = html.includes('<li>');
  const hasLocations = html.includes('<location');
  console.log('[convertBulletLocationsToDetails] Has list items:', hasListItems, 'Has locations:', hasLocations);
  
  const matches = [];
  let match;
  while ((match = listItemPattern.exec(html)) !== null) {
    matches.push({
      fullMatch: match[0],
      context: match[1], 
      name: match[2],
      index: match.index
    });
  }
  
  // Process matches in reverse order
  matches.reverse();
  
  for (const { fullMatch, context, name, index } of matches) {
    // Extract the content after the location name
    const locationTag = `<location data-context="${context}">${name}</location>`;
    const parts = fullMatch.split(locationTag);
    
    if (parts.length === 2) {
      // Get the description text (everything after the location in the li)
      let description = parts[1]
        .replace(/<\/li>$/i, '') // Remove closing li tag
        .replace(/^\s*[-–—]\s*/, '') // Remove dash separators
        .trim();
      
      // If no description, use default
      if (!description || description === '') {
        description = `Information about ${name} in ${context}.`;
      }
      
      // Create details block within the list item
      const detailsVersion = `<li>
<details>
  <summary>${locationTag}</summary>
  <p>${description}</p>
</details>
</li>`;
      
      result = result.substring(0, index) + detailsVersion + result.substring(index + fullMatch.length);
    }
  }
  
  return result;
}
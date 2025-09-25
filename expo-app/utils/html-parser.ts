export interface ParsedElement {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'li' | 'text' | 'geo-mark' | 'br';
  content?: string;
  children?: ParsedElement[];
  attributes?: {
    dataGeo?: string;
    dataLat?: string;
    dataLng?: string;
    dataPlaceName?: string;
    title?: string;
  };
}

export function parseHTML(html: string): ParsedElement[] {
  const elements: ParsedElement[] = [];

  // Remove newlines between tags for cleaner parsing
  const cleanHTML = html.replace(/>\s+</g, '><').trim();

  // Simple regex-based parser for the HTML elements we care about
  const parseRecursive = (htmlString: string): ParsedElement[] => {
    const result: ParsedElement[] = [];
    let remaining = htmlString;

    while (remaining.length > 0) {
      // Check for opening tags
      const tagMatch = remaining.match(/^<(\/?)(h1|h2|h3|p|ul|li|span|br)(.*?)>/);

      if (tagMatch) {
        const [fullMatch, isClosing, tagName, attributes] = tagMatch;

        if (isClosing) {
          // Closing tag - stop parsing this level
          break;
        }

        if (tagName === 'br') {
          result.push({ type: 'br' });
          remaining = remaining.slice(fullMatch.length);
          continue;
        }

        // Find the closing tag
        const closingTagRegex = new RegExp(`<\\/${tagName}>`);
        const closingIndex = remaining.search(closingTagRegex);

        if (closingIndex === -1) {
          // No closing tag found, treat as text
          result.push({ type: 'text', content: remaining });
          break;
        }

        const innerContent = remaining.slice(fullMatch.length, closingIndex);
        remaining = remaining.slice(closingIndex + `</${tagName}>`.length);

        // Handle geo-mark spans specially
        if (tagName === 'span' && attributes.includes('class="geo-mark"')) {
          const geoMark: ParsedElement = {
            type: 'geo-mark',
            content: innerContent.replace(/<[^>]*>/g, ''), // Strip any nested HTML
            attributes: {}
          };

          // Extract data attributes
          const dataGeoMatch = attributes.match(/data-geo="([^"]*)"/);
          const dataLatMatch = attributes.match(/data-lat="([^"]*)"/);
          const dataLngMatch = attributes.match(/data-lng="([^"]*)"/);
          const dataPlaceNameMatch = attributes.match(/data-place-name="([^"]*)"/);
          const titleMatch = attributes.match(/title="([^"]*)"/);

          if (dataGeoMatch) geoMark.attributes!.dataGeo = dataGeoMatch[1];
          if (dataLatMatch) geoMark.attributes!.dataLat = dataLatMatch[1];
          if (dataLngMatch) geoMark.attributes!.dataLng = dataLngMatch[1];
          if (dataPlaceNameMatch) geoMark.attributes!.dataPlaceName = dataPlaceNameMatch[1];
          if (titleMatch) geoMark.attributes!.title = titleMatch[1];

          result.push(geoMark);
        } else if (tagName === 'ul' || tagName === 'li') {
          // Lists need recursive parsing
          const children = parseRecursive(innerContent);
          result.push({
            type: tagName as 'ul' | 'li',
            children
          });
        } else {
          // For headings and paragraphs, parse the inner content
          const children = parseRecursive(innerContent);
          if (children.length === 1 && children[0].type === 'text') {
            // If it's just text, simplify
            result.push({
              type: tagName as 'h1' | 'h2' | 'h3' | 'p',
              content: children[0].content
            });
          } else if (children.length > 0) {
            // Mixed content
            result.push({
              type: tagName as 'h1' | 'h2' | 'h3' | 'p',
              children
            });
          }
        }
      } else {
        // No tag found, look for text before next tag
        const nextTagIndex = remaining.search(/<[^>]+>/);
        if (nextTagIndex === -1) {
          // No more tags, rest is text
          if (remaining.trim()) {
            result.push({ type: 'text', content: remaining });
          }
          break;
        } else if (nextTagIndex > 0) {
          // Text before next tag
          const text = remaining.slice(0, nextTagIndex);
          if (text.trim()) {
            result.push({ type: 'text', content: text });
          }
          remaining = remaining.slice(nextTagIndex);
        } else {
          // Shouldn't happen, but break to avoid infinite loop
          break;
        }
      }
    }

    return result;
  };

  return parseRecursive(cleanHTML);
}

// Helper function to extract plain text from parsed elements
export function extractText(elements: ParsedElement[]): string {
  let text = '';

  for (const element of elements) {
    if (element.content) {
      text += element.content + ' ';
    }
    if (element.children) {
      text += extractText(element.children) + ' ';
    }
  }

  return text.trim();
}
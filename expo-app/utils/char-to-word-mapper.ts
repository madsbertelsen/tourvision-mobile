/**
 * Character-to-Word Mapping Utility for Karaoke-Style Text Highlighting
 *
 * This utility parses HTML content and builds a mapping from character positions
 * to word information, enabling synchronized highlighting during speech synthesis.
 */

export interface WordInfo {
  /** Starting character index in the plain text */
  charStart: number;
  /** Ending character index (exclusive) */
  charEnd: number;
  /** The actual word text */
  word: string;
  /** Reference to the text node in the DOM (if available) */
  textNode?: Text;
  /** Offset within the text node where this word starts */
  nodeOffset?: number;
  /** Parent element (useful for styling) */
  parentElement?: HTMLElement;
  /** Whether this word is part of a geo-mark */
  isGeoMark?: boolean;
  /** Geo-mark data if applicable */
  geoMarkData?: {
    placeName: string;
    lat: string;
    lng: string;
    colorIndex?: number;
  };
}

export interface CharacterMap {
  /** Total number of characters in plain text */
  totalChars: number;
  /** Plain text content (HTML stripped) */
  plainText: string;
  /** Array of word information */
  words: WordInfo[];
  /** Mapping from character index to word index */
  charToWordIndex: number[];
}

/**
 * Strips HTML tags from content while preserving text
 */
function stripHtml(html: string): string {
  if (typeof document === 'undefined') {
    // Fallback for non-web platforms
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }

  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/**
 * Build character-to-word mapping from HTML content
 */
export function buildCharacterMap(htmlContent: string): CharacterMap {
  // Get plain text version
  const plainText = stripHtml(htmlContent);

  // Split into words (handles multiple spaces, newlines, etc.)
  const wordRegex = /\S+/g;
  const words: WordInfo[] = [];
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(plainText)) !== null) {
    words.push({
      charStart: match.index,
      charEnd: match.index + match[0].length,
      word: match[0],
    });
  }

  // Build character-to-word-index mapping
  const charToWordIndex = new Array(plainText.length).fill(-1);
  words.forEach((word, wordIndex) => {
    for (let i = word.charStart; i < word.charEnd; i++) {
      charToWordIndex[i] = wordIndex;
    }
  });

  return {
    totalChars: plainText.length,
    plainText,
    words,
    charToWordIndex,
  };
}

/**
 * Enhanced version that parses actual DOM elements for detailed mapping
 * (Web platform only)
 */
export function buildDOMCharacterMap(htmlContent: string): CharacterMap | null {
  if (typeof document === 'undefined') {
    return null; // Not on web platform
  }

  // Create a temporary container
  const container = document.createElement('div');
  container.innerHTML = htmlContent;

  const words: WordInfo[] = [];
  let plainText = '';
  let charIndex = 0;

  // Recursive function to traverse DOM tree
  function traverse(node: Node, parentElement?: HTMLElement, isGeoMark: boolean = false, geoMarkData?: any) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const textNode = node as Text;

      // Split text into words
      const wordRegex = /\S+/g;
      let match: RegExpExecArray | null;

      while ((match = wordRegex.exec(text)) !== null) {
        const wordStart = charIndex + match.index;
        const wordEnd = wordStart + match[0].length;

        words.push({
          charStart: wordStart,
          charEnd: wordEnd,
          word: match[0],
          textNode,
          nodeOffset: match.index,
          parentElement,
          isGeoMark,
          geoMarkData: isGeoMark ? geoMarkData : undefined,
        });
      }

      plainText += text;
      charIndex += text.length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;

      // Check if this is a geo-mark
      const isCurrentGeoMark = element.classList.contains('geo-mark');
      const currentGeoMarkData = isCurrentGeoMark ? {
        placeName: element.getAttribute('data-place-name') || '',
        lat: element.getAttribute('data-lat') || '',
        lng: element.getAttribute('data-lng') || '',
        colorIndex: element.getAttribute('data-color-index')
          ? parseInt(element.getAttribute('data-color-index')!)
          : undefined,
      } : undefined;

      // Traverse children
      node.childNodes.forEach(child => {
        traverse(
          child,
          element,
          isCurrentGeoMark || isGeoMark,
          currentGeoMarkData || geoMarkData
        );
      });
    }
  }

  traverse(container);

  // Build character-to-word-index mapping
  const charToWordIndex = new Array(plainText.length).fill(-1);
  words.forEach((word, wordIndex) => {
    for (let i = word.charStart; i < word.charEnd; i++) {
      charToWordIndex[i] = wordIndex;
    }
  });

  return {
    totalChars: plainText.length,
    plainText,
    words,
    charToWordIndex,
  };
}

/**
 * Get word at a specific character index
 */
export function getWordAtCharIndex(charMap: CharacterMap, charIndex: number): WordInfo | null {
  const wordIndex = charMap.charToWordIndex[charIndex];
  if (wordIndex === -1) return null;
  return charMap.words[wordIndex];
}

/**
 * Get all geo-mark locations from character map
 */
export function getGeoMarksFromCharMap(charMap: CharacterMap): Array<{
  word: WordInfo;
  placeName: string;
  lat: number;
  lng: number;
}> {
  return charMap.words
    .filter(word => word.isGeoMark && word.geoMarkData)
    .map(word => ({
      word,
      placeName: word.geoMarkData!.placeName,
      lat: parseFloat(word.geoMarkData!.lat),
      lng: parseFloat(word.geoMarkData!.lng),
    }))
    .filter(item => !isNaN(item.lat) && !isNaN(item.lng));
}

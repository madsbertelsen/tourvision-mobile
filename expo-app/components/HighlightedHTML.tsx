/**
 * HighlightedHTML Component - Progressive Reveal Text Highlighting
 *
 * Renders HTML content with word-by-word progressive reveal highlighting
 * for karaoke-style presentation mode.
 *
 * Web-only component (uses DOM manipulation)
 */

import React, { useEffect, useRef } from 'react';
import { buildCharacterMap, type CharacterMap } from '@/utils/char-to-word-mapper';

interface HighlightedHTMLProps {
  /** HTML content to render with highlighting */
  htmlContent: string;
  /** Current character index being spoken (from onboundary event) */
  currentCharIndex: number | null;
  /** Optional class name for container */
  className?: string;
  /** Optional style object */
  style?: React.CSSProperties;
}

export default function HighlightedHTML({
  htmlContent,
  currentCharIndex,
  className = '',
  style = {},
}: HighlightedHTMLProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const charMapRef = useRef<CharacterMap | null>(null);

  // Build character map on mount or when content changes
  useEffect(() => {
    if (!htmlContent) return;

    console.log('[HighlightedHTML] Building character map for content');
    charMapRef.current = buildCharacterMap(htmlContent);
  }, [htmlContent]);

  // Apply progressive reveal highlighting when currentCharIndex changes
  useEffect(() => {
    if (!containerRef.current || !charMapRef.current) return;

    const charMap = charMapRef.current;

    // If no current char index, show all text in unspoken state
    if (currentCharIndex === null) {
      console.log('[HighlightedHTML] No current char index, resetting highlighting');
      applyHighlighting(containerRef.current, charMap, -1);
      return;
    }

    console.log('[HighlightedHTML] Applying highlighting at char index:', currentCharIndex);
    applyHighlighting(containerRef.current, charMap, currentCharIndex);
  }, [currentCharIndex]);

  return (
    <div
      ref={containerRef}
      className={`highlighted-html ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}

/**
 * Apply progressive reveal highlighting to HTML content
 */
function applyHighlighting(container: HTMLElement, charMap: CharacterMap, currentCharIndex: number) {
  // Find the word index for the current character
  const currentWordIndex = currentCharIndex >= 0
    ? charMap.charToWordIndex[currentCharIndex]
    : -1;

  console.log('[HighlightedHTML] Current word index:', currentWordIndex, 'of', charMap.words.length);

  // Traverse all text nodes and apply highlighting
  const words = charMap.words;
  let wordIndex = 0;

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';

      // Check if this text node contains any words
      const nodeWords = [];
      while (wordIndex < words.length) {
        const word = words[wordIndex];
        // This is a simplified approach - in a more robust version,
        // we'd track the exact text node positions from buildCharacterMap
        if (text.includes(word.word)) {
          nodeWords.push({ word, index: wordIndex });
          wordIndex++;
        } else {
          break;
        }
      }

      // Apply styling to parent element based on word state
      if (node.parentElement) {
        const hasSpokenWord = nodeWords.some(w => w.index <= currentWordIndex);
        const hasUnspokenWord = nodeWords.some(w => w.index > currentWordIndex);

        if (hasSpokenWord && !hasUnspokenWord) {
          // All words in this node have been spoken
          node.parentElement.classList.remove('word-unspoken', 'word-current');
          node.parentElement.classList.add('word-spoken');
        } else if (!hasSpokenWord && hasUnspokenWord) {
          // All words in this node are unspoken
          node.parentElement.classList.remove('word-spoken', 'word-current');
          node.parentElement.classList.add('word-unspoken');
        } else if (nodeWords.some(w => w.index === currentWordIndex)) {
          // Current word is in this node
          node.parentElement.classList.remove('word-spoken', 'word-unspoken');
          node.parentElement.classList.add('word-current');
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Recursively traverse children
      node.childNodes.forEach(traverse);
    }
  }

  traverse(container);
}

/**
 * Global CSS for progressive reveal highlighting
 *
 * Add this to your global stylesheet or include via <style> tag:
 *
 * .highlighted-html .word-unspoken {
 *   opacity: 0.3;
 *   color: #9CA3AF;
 * }
 *
 * .highlighted-html .word-spoken {
 *   opacity: 1.0;
 *   color: inherit;
 *   transition: opacity 0.3s ease, color 0.3s ease;
 * }
 *
 * .highlighted-html .word-current {
 *   opacity: 1.0;
 *   color: inherit;
 *   font-weight: 600;
 *   transition: opacity 0.2s ease, color 0.2s ease;
 * }
 */

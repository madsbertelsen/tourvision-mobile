import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';

interface PresentationBlock {
  id: string;
  content: string; // HTML content
  locations: Array<{
    name: string;
    lat: number;
    lng: number;
  }>;
}

interface PresentationContextType {
  isPresenting: boolean;
  currentBlockIndex: number;
  blocks: PresentationBlock[];
  isNarrating: boolean;
  startPresentation: (blocks: PresentationBlock[]) => void;
  nextBlock: () => void;
  previousBlock: () => void;
  stopPresentation: () => void;
  toggleNarration: () => void;
}

const PresentationContext = createContext<PresentationContextType | undefined>(undefined);

// Utility to strip HTML tags from content
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [isPresenting, setIsPresenting] = useState(false);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [blocks, setBlocks] = useState<PresentationBlock[]>([]);
  const [isNarrating, setIsNarrating] = useState(false);

  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Initialize speech synthesis on web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      synthesisRef.current = window.speechSynthesis;
    }
  }, []);

  // Narrate current block when it changes (if narration is enabled)
  useEffect(() => {
    if (!isPresenting || !isNarrating || blocks.length === 0) return;

    const currentBlock = blocks[currentBlockIndex];
    if (!currentBlock) return;

    narrateBlock(currentBlock);

    return () => {
      // Cleanup: stop speech when block changes
      if (synthesisRef.current && utteranceRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, [currentBlockIndex, isNarrating, isPresenting, blocks]);

  const narrateBlock = (block: PresentationBlock) => {
    if (Platform.OS !== 'web' || !synthesisRef.current) {
      console.log('[Narration] Speech synthesis not available');
      return;
    }

    // Stop any ongoing narration
    synthesisRef.current.cancel();

    // Strip HTML and create utterance
    const text = stripHtml(block.content);
    if (!text) return;

    console.log('[Narration] Speaking:', text.substring(0, 100) + '...');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Auto-advance to next block when narration finishes
    utterance.onend = () => {
      console.log('[Narration] Finished speaking block');
      // Auto-advance after a short pause
      setTimeout(() => {
        if (currentBlockIndex < blocks.length - 1) {
          setCurrentBlockIndex(currentBlockIndex + 1);
        } else {
          // End of presentation
          setIsNarrating(false);
          stopPresentation();
        }
      }, 1000); // 1 second pause between blocks
    };

    utterance.onerror = (event) => {
      console.error('[Narration] Error:', event);
    };

    utteranceRef.current = utterance;
    synthesisRef.current.speak(utterance);
  };

  const startPresentation = (presentationBlocks: PresentationBlock[]) => {
    setBlocks(presentationBlocks);
    setCurrentBlockIndex(0);
    setIsPresenting(true);
    setIsNarrating(true); // Auto-start narration
  };

  const nextBlock = () => {
    // Stop current narration
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }

    if (currentBlockIndex < blocks.length - 1) {
      setCurrentBlockIndex(currentBlockIndex + 1);
    } else {
      // End of presentation
      stopPresentation();
    }
  };

  const previousBlock = () => {
    // Stop current narration
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }

    if (currentBlockIndex > 0) {
      setCurrentBlockIndex(currentBlockIndex - 1);
    }
  };

  const stopPresentation = () => {
    // Stop narration
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }

    setIsPresenting(false);
    setIsNarrating(false);
    setCurrentBlockIndex(0);
    setBlocks([]);
  };

  const toggleNarration = () => {
    if (isNarrating) {
      // Pause narration
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
      setIsNarrating(false);
    } else {
      // Resume narration
      setIsNarrating(true);
    }
  };

  return (
    <PresentationContext.Provider
      value={{
        isPresenting,
        currentBlockIndex,
        blocks,
        isNarrating,
        startPresentation,
        nextBlock,
        previousBlock,
        stopPresentation,
        toggleNarration,
      }}
    >
      {children}
    </PresentationContext.Provider>
  );
}

export function usePresentation() {
  const context = useContext(PresentationContext);
  if (!context) {
    throw new Error('usePresentation must be used within PresentationProvider');
  }
  return context;
}

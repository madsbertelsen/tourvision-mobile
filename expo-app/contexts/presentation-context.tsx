import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { buildCharacterMap, buildDOMCharacterMap, getWordAtCharIndex, getGeoMarksFromCharMap, type CharacterMap, type WordInfo } from '@/utils/char-to-word-mapper';

interface PresentationBlock {
  id: string;
  content: string; // HTML content
  locations: Array<{
    name: string;
    lat: number;
    lng: number;
  }>;
}

export interface WordPosition {
  /** Character index in the plain text where the current word starts */
  charIndex: number;
  /** Length of the current word */
  charLength: number;
  /** Index of the current block being narrated */
  blockIndex: number;
  /** Elapsed time since speech started (milliseconds) */
  elapsedTime: number;
  /** Word information from character map */
  wordInfo: WordInfo | null;
}

export interface FocusedGeoLocation {
  placeName: string;
  lat: number;
  lng: number;
  /** Triggered by speech narration */
  triggeredBySpeech: boolean;
}

interface PresentationContextType {
  isPresenting: boolean;
  currentBlockIndex: number;
  blocks: PresentationBlock[];
  isNarrating: boolean;
  /** Current word position during narration (for karaoke highlighting) */
  currentWordPosition: WordPosition | null;
  /** Focused geo-location (for map animation) */
  focusedGeoLocation: FocusedGeoLocation | null;
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
  const [currentWordPosition, setCurrentWordPosition] = useState<WordPosition | null>(null);
  const [focusedGeoLocation, setFocusedGeoLocation] = useState<FocusedGeoLocation | null>(null);

  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const characterMapRef = useRef<CharacterMap | null>(null);

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
      return;
    }

    // Stop any ongoing narration
    synthesisRef.current.cancel();

    // Clear previous word position
    setCurrentWordPosition(null);
    setFocusedGeoLocation(null);

    // Build character map for karaoke highlighting (use DOM version to parse geo-marks)
    const charMap = buildDOMCharacterMap(block.content) || buildCharacterMap(block.content);
    characterMapRef.current = charMap;

    // Extract geo-marks for map synchronization
    const geoMarks = getGeoMarksFromCharMap(charMap);
    console.log('[Presentation] Found', geoMarks.length, 'geo-marks in block:', geoMarks.map(g => g.placeName));

    // Strip HTML and create utterance
    const text = charMap.plainText;
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Word boundary tracking for karaoke highlighting
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name === 'word') {
        const wordInfo = getWordAtCharIndex(charMap, event.charIndex);

        // Update word position for highlighting
        setCurrentWordPosition({
          charIndex: event.charIndex,
          charLength: event.charLength,
          blockIndex: currentBlockIndex,
          elapsedTime: event.elapsedTime,
          wordInfo,
        });

        // Check if this word is a geo-mark location
        if (wordInfo?.isGeoMark && wordInfo.geoMarkData) {
          const { placeName, lat, lng } = wordInfo.geoMarkData;
          const latNum = parseFloat(lat);
          const lngNum = parseFloat(lng);

          if (!isNaN(latNum) && !isNaN(lngNum)) {
            console.log('[Presentation] 🎯 Map focus requested:', placeName, `(${latNum}, ${lngNum})`);
            setFocusedGeoLocation({
              placeName,
              lat: latNum,
              lng: lngNum,
              triggeredBySpeech: true,
            });
          }
        }
      }
    };

    // Auto-advance to next block when narration finishes
    utterance.onend = () => {
      // Clear word position
      setCurrentWordPosition(null);
      setFocusedGeoLocation(null);

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
      console.error('[Presentation] Speech error:', event.error);
      setCurrentWordPosition(null);
      setFocusedGeoLocation(null);
    };

    utteranceRef.current = utterance;
    synthesisRef.current.speak(utterance);
  };

  const startPresentation = (presentationBlocks: PresentationBlock[]) => {
    console.log('[Presentation] Starting with blocks:', presentationBlocks.map(b => ({
      id: b.id,
      contentPreview: b.content.substring(0, 200),
      locationsCount: b.locations?.length || 0
    })));
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
    setCurrentWordPosition(null);
    setFocusedGeoLocation(null);
    characterMapRef.current = null;
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
        currentWordPosition,
        focusedGeoLocation,
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

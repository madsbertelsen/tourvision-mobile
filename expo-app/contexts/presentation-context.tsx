import React, { createContext, useContext, useState, ReactNode } from 'react';

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
  startPresentation: (blocks: PresentationBlock[]) => void;
  nextBlock: () => void;
  previousBlock: () => void;
  stopPresentation: () => void;
}

const PresentationContext = createContext<PresentationContextType | undefined>(undefined);

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [isPresenting, setIsPresenting] = useState(false);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [blocks, setBlocks] = useState<PresentationBlock[]>([]);

  const startPresentation = (presentationBlocks: PresentationBlock[]) => {
    setBlocks(presentationBlocks);
    setCurrentBlockIndex(0);
    setIsPresenting(true);
  };

  const nextBlock = () => {
    if (currentBlockIndex < blocks.length - 1) {
      setCurrentBlockIndex(currentBlockIndex + 1);
    } else {
      // End of presentation
      stopPresentation();
    }
  };

  const previousBlock = () => {
    if (currentBlockIndex > 0) {
      setCurrentBlockIndex(currentBlockIndex - 1);
    }
  };

  const stopPresentation = () => {
    setIsPresenting(false);
    setCurrentBlockIndex(0);
    setBlocks([]);
  };

  return (
    <PresentationContext.Provider
      value={{
        isPresenting,
        currentBlockIndex,
        blocks,
        startPresentation,
        nextBlock,
        previousBlock,
        stopPresentation,
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

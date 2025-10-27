/**
 * Command Sequence Generator
 * Converts ProseMirror document structure to a flat sequence of editor commands
 * for character-by-character animation
 */

export interface EditorCommand {
  type: 'insertText' | 'insertParagraph' | 'setHeading' | 'toggleBold' | 'selectText' | 'createGeoMark' | 'wait';
  text?: string;
  level?: number;
  geoMarkData?: any;
  count?: number; // for selectText: how many characters to select
  delay?: number; // milliseconds to wait after this command
}

interface AnimationContext {
  currentMarks: Set<string>;
  currentNodeType: string;
  currentNodeAttrs: any;
}

/**
 * Generate a sequence of commands from a ProseMirror document
 */
export function generateCommandSequence(
  doc: any,
  config: {
    baseSpeed: number; // characters per second
    speedVariation: number; // 0-1
    pauseAfterPunctuation: number;
    pauseAfterNewline: number;
    pauseAfterGeoMark: number;
  }
): EditorCommand[] {
  const commands: EditorCommand[] = [];
  const context: AnimationContext = {
    currentMarks: new Set(),
    currentNodeType: 'paragraph',
    currentNodeAttrs: null,
  };

  function calculateDelay(char?: string): number {
    const baseDelay = 1000 / config.baseSpeed;
    const variation = (Math.random() - 0.5) * 2 * config.speedVariation;
    let delay = baseDelay * (1 + variation);

    if (char) {
      // Add pauses for punctuation
      if (char === '.' || char === '!' || char === '?') {
        delay += config.pauseAfterPunctuation;
      }
    }

    return Math.round(delay);
  }

  function traverseNode(node: any, isFirst: boolean = false) {
    // Handle block nodes (paragraph, heading)
    if (node.type === 'paragraph' || node.type === 'heading') {
      // Insert newline before new block (except for first block)
      if (!isFirst) {
        commands.push({
          type: 'insertParagraph',
          delay: config.pauseAfterNewline,
        });
        context.currentNodeType = 'paragraph';
        context.currentNodeAttrs = null;
      }

      // Set heading if needed
      if (node.type === 'heading' && node.attrs?.level) {
        commands.push({
          type: 'setHeading',
          level: node.attrs.level,
          delay: 100,
        });
        context.currentNodeType = 'heading';
        context.currentNodeAttrs = node.attrs;
      }

      // Clear marks at start of new block
      const marksToRemove = Array.from(context.currentMarks);
      for (const mark of marksToRemove) {
        commands.push({
          type: 'toggleBold',
          delay: 50,
        });
        context.currentMarks.delete(mark);
      }

      // Process content
      if (node.content) {
        for (const child of node.content) {
          traverseContent(child);
        }
      }
    }
  }

  function traverseContent(node: any) {
    if (node.type === 'text') {
      const nodeMarks = new Set((node.marks || []).map((m: any) => m.type));

      // Toggle marks on
      for (const mark of nodeMarks) {
        if (!context.currentMarks.has(mark)) {
          if (mark === 'strong') {
            commands.push({
              type: 'toggleBold',
              delay: 50,
            });
          }
          context.currentMarks.add(mark);
        }
      }

      // Type each character
      for (let i = 0; i < node.text.length; i++) {
        const char = node.text[i];
        commands.push({
          type: 'insertText',
          text: char,
          delay: calculateDelay(char),
        });
      }

      // Toggle marks off
      for (const mark of context.currentMarks) {
        if (!nodeMarks.has(mark)) {
          if (mark === 'strong') {
            commands.push({
              type: 'toggleBold',
              delay: 50,
            });
          }
          context.currentMarks.delete(mark);
        }
      }
    } else if (node.type === 'geoMark') {
      // Insert geo-mark as a special command
      // First, toggle marks off (geo-marks don't inherit marks)
      const marksToRemove = Array.from(context.currentMarks);
      for (const mark of marksToRemove) {
        commands.push({
          type: 'toggleBold',
          delay: 50,
        });
        context.currentMarks.delete(mark);
      }

      // Get the text content from geo-mark
      let geoMarkText = '';
      if (node.content) {
        for (const child of node.content) {
          if (child.type === 'text') {
            geoMarkText += child.text;
          }
        }
      }

      // Type the text first
      for (let i = 0; i < geoMarkText.length; i++) {
        const char = geoMarkText[i];
        commands.push({
          type: 'insertText',
          text: char,
          delay: calculateDelay(char),
        });
      }

      // Then select the text by moving cursor backwards with animation
      // Selection animates at 80ms per character, so delay = (length * 80) + 300ms buffer
      const selectionAnimationTime = geoMarkText.length * 80 + 300;
      commands.push({
        type: 'selectText',
        count: geoMarkText.length,
        delay: selectionAnimationTime, // Wait for selection animation to complete
      });

      // Then create the geo-mark from the selection
      commands.push({
        type: 'createGeoMark',
        geoMarkData: {
          ...node.attrs,
          selectedText: geoMarkText,
        },
        delay: config.pauseAfterGeoMark,
      });
    }
  }

  // Start traversing from doc root
  if (doc.type === 'doc' && doc.content) {
    for (let i = 0; i < doc.content.length; i++) {
      traverseNode(doc.content[i], i === 0);
    }
  }

  return commands;
}

/**
 * Calculate total animation duration in milliseconds
 */
export function calculateAnimationDuration(commands: EditorCommand[]): number {
  return commands.reduce((total, cmd) => total + (cmd.delay || 0), 0);
}

/**
 * Get progress percentage from current command index
 */
export function getAnimationProgress(currentIndex: number, totalCommands: number): number {
  return Math.round((currentIndex / totalCommands) * 100);
}

#!/usr/bin/env node

// Test ProseMirror position calculation
// ProseMirror positions count like this:
// doc(0) heading(1) "Barcelona Adventure"(20) heading(21) para(22) "Planning a trip to Barcelona"(51) para(52) doc(53)

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [
        { type: 'text', text: 'Barcelona Adventure' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Planning a trip to Barcelona' }
      ]
    }
  ]
};

// ProseMirror position calculation:
// - doc start: 0
// - heading start: 1
// - text positions: 2-20 (19 chars)
// - heading end: 21
// - paragraph start: 22
// - text positions: 23-51 (29 chars)
// - paragraph end: 52
// - doc end: 53

function calculateProseMirrorSize(node) {
  if (!node) return 0;

  if (node.type === 'text') {
    return node.text ? node.text.length : 0;
  }

  // Non-text nodes have opening (1) and closing (1) positions
  let size = 1; // Opening

  if (node.content && Array.isArray(node.content)) {
    node.content.forEach(child => {
      size += calculateProseMirrorSize(child);
    });
  }

  size += 1; // Closing

  return size;
}

function calculateDocumentEndPosition(doc) {
  if (!doc) return 0;

  // Start at position 1 (after doc opening)
  let position = 1;

  if (doc.content && Array.isArray(doc.content)) {
    doc.content.forEach(node => {
      position += calculateProseMirrorSize(node);
    });
  }

  // Don't add 1 for doc closing - we want the position before it
  return position;
}

const endPos = calculateDocumentEndPosition(doc);
console.log('Document end position (where to insert):', endPos);
console.log('Expected for Barcelona document: 52');

// Verify with individual calculations
const headingSize = 1 + 19 + 1; // open + text + close = 21
const paragraphSize = 1 + 29 + 1; // open + text + close = 31
const totalFromStart = 1 + headingSize + paragraphSize; // 1 + 21 + 31 = 53

console.log('\nDetailed calculation:');
console.log('Heading size:', headingSize);
console.log('Paragraph size:', paragraphSize);
console.log('Total from doc start:', totalFromStart);
console.log('Insert position (before doc close):', totalFromStart - 1);
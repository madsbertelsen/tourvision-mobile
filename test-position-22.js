#!/usr/bin/env node

// Test if position 22 is correct for Barcelona document
// Document: "Barcelona Adventure" heading + "Planning a trip to Barcelona" paragraph

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

// Different position calculation methods:

// Method 1: Standard ProseMirror (what we calculated as 52)
// doc(0) heading(1) text(2-20) heading(21) para(22) text(23-51) para(52) doc(53)
console.log('Method 1 - Standard ProseMirror:');
console.log('  End of document position: 52');

// Method 2: Maybe the Edge Function uses different logic?
// What if it's calculating the position after the first paragraph closes?
// doc(0) heading(1) ...content... heading(close) para(open) ...content... para(21) <- here
console.log('\nMethod 2 - After paragraph node:');
console.log('  Position after paragraph: 22');

// This would make sense if the Edge Function is:
// 1. Finding the paragraph node (node-1)
// 2. Getting its end position
// 3. Inserting after that position

console.log('\nConclusion:');
console.log('Position 22 likely represents the position right after the closing of the paragraph node.');
console.log('This is where new content should be inserted to appear after the paragraph.');
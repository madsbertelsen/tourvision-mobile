// Test document size calculation
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

function calculateNodeSize(node) {
  if (!node) return 0;

  if (node.type === 'text') {
    return node.text ? node.text.length : 0;
  }

  let size = 1; // Opening tag

  if (node.content && Array.isArray(node.content)) {
    node.content.forEach(child => {
      size += calculateNodeSize(child);
    });
  }

  size += 1; // Closing tag

  return size;
}

function calculateDocumentSize(doc) {
  if (!doc) return 0;

  let size = 1; // Doc opening

  if (doc.content && Array.isArray(doc.content)) {
    doc.content.forEach(node => {
      size += calculateNodeSize(node);
    });
  }

  size += 1; // Doc closing

  return size;
}

const totalSize = calculateDocumentSize(doc);
console.log('Document size:', totalSize);
console.log('Expected: ~51');

// Text content alone
const textSize = 'Barcelona Adventure'.length + 'Planning a trip to Barcelona'.length;
console.log('Text content size:', textSize);

// ProseMirror actually counts differently
// doc(1) + heading(2) + text(19) + paragraph(2) + text(29) + closing(1) = 54
const prosemirrorSize = 1 + 2 + 19 + 2 + 29 + 1;
console.log('ProseMirror calculation:', prosemirrorSize);
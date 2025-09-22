#!/usr/bin/env node

/**
 * Test script for diff preview functionality
 * Verifies that applying and reverting a proposal restores the original document
 */

// Initial document
const initialDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Barcelona Adventure' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Planning a trip to Barcelona' }]
    }
  ]
};

// Proposal with transaction steps to add content
const proposal = {
  id: 'test-001',
  title: 'Add Park Güell Section',
  transaction_steps: [
    {
      stepType: 'replace',
      from: 22, // Position after the paragraph
      to: 22,   // Same position (insertion)
      slice: {
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Park Güell' }]
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Park Güell is a public park system composed of gardens and architectural elements.'
            }]
          }
        ],
        openStart: 0,
        openEnd: 0
      }
    }
  ],
  inverse_steps: [
    {
      stepType: 'replace',
      from: 22,
      to: 24, // Range to delete (the inserted content)
      slice: {
        content: [],
        openStart: 0,
        openEnd: 0
      }
    }
  ]
};

// Simple document manipulation functions
function cloneDoc(doc) {
  return JSON.parse(JSON.stringify(doc));
}

function applyStep(doc, step) {
  const newDoc = cloneDoc(doc);

  if (step.stepType === 'replace') {
    const { from, to, slice } = step;

    // Convert positions to content array indices
    // This is simplified - real ProseMirror is more complex
    let pos = 0;
    let insertIndex = -1;

    // Find where to insert
    for (let i = 0; i <= newDoc.content.length; i++) {
      if (pos === from) {
        insertIndex = i;
        break;
      }
      if (i < newDoc.content.length) {
        // Count node size (simplified)
        pos += 2; // Opening + closing
        if (newDoc.content[i].content) {
          newDoc.content[i].content.forEach(child => {
            if (child.text) pos += child.text.length;
          });
        }
      }
    }

    if (insertIndex >= 0) {
      // Delete if needed
      if (to > from) {
        // Calculate how many nodes to delete
        let deleteCount = 0;
        let currentPos = from;
        for (let i = insertIndex; i < newDoc.content.length && currentPos < to; i++) {
          deleteCount++;
          currentPos += 2; // Simplified
        }
        newDoc.content.splice(insertIndex, deleteCount);
      }

      // Insert new content
      if (slice.content && slice.content.length > 0) {
        newDoc.content.splice(insertIndex, 0, ...slice.content);
      }
    }
  }

  return newDoc;
}

function documentsEqual(doc1, doc2) {
  return JSON.stringify(doc1) === JSON.stringify(doc2);
}

// Run the test
function runTest() {
  console.log('🧪 Starting diff preview test...\n');

  // Save original
  const originalDoc = cloneDoc(initialDoc);
  console.log('📄 Initial document:');
  console.log('  - Nodes:', originalDoc.content.length);
  console.log('  - Content:', originalDoc.content.map(n => n.type).join(', '));

  // Apply proposal
  console.log('\n📝 Applying proposal:', proposal.title);
  let modifiedDoc = originalDoc;
  proposal.transaction_steps.forEach(step => {
    modifiedDoc = applyStep(modifiedDoc, step);
  });
  console.log('  - Nodes after apply:', modifiedDoc.content.length);
  console.log('  - Content:', modifiedDoc.content.map(n => n.type).join(', '));

  // Check that document was modified
  const wasModified = !documentsEqual(originalDoc, modifiedDoc);
  console.log('  - Document modified:', wasModified ? '✅' : '❌');

  if (!wasModified) {
    console.log('\n❌ Test failed: Document was not modified by proposal');
    process.exit(1);
  }

  // Revert using inverse steps
  console.log('\n↩️  Reverting changes...');
  let revertedDoc = modifiedDoc;
  proposal.inverse_steps.forEach(step => {
    revertedDoc = applyStep(revertedDoc, step);
  });
  console.log('  - Nodes after revert:', revertedDoc.content.length);
  console.log('  - Content:', revertedDoc.content.map(n => n.type).join(', '));

  // Check if reverted document equals original
  const isRestored = documentsEqual(originalDoc, revertedDoc);

  console.log('\n📊 Test Results:');
  console.log('  - Document restored to original:', isRestored ? '✅' : '❌');

  if (isRestored) {
    console.log('\n✅ Test PASSED: Document successfully restored after applying and reverting proposal');
  } else {
    console.log('\n❌ Test FAILED: Document not restored to original state');
    console.log('\nOriginal:', JSON.stringify(originalDoc, null, 2));
    console.log('\nReverted:', JSON.stringify(revertedDoc, null, 2));
    process.exit(1);
  }
}

// Run test
runTest();
#!/usr/bin/env node

/**
 * Test script for ProseMirror diff preview functionality
 * Uses actual ProseMirror libraries to test transaction steps
 */

const { Schema, Node, DOMParser } = require('prosemirror-model');
const { schema: basicSchema } = require('prosemirror-schema-basic');
const { ReplaceStep } = require('prosemirror-transform');

// Create a simple schema
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      toDOM() { return ['p', 0] },
      parseDOM: [{ tag: 'p' }]
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'text*',
      group: 'block',
      toDOM(node) { return [`h${node.attrs.level}`, 0] },
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
      ]
    },
    text: { inline: true }
  },
  marks: {}
});

// Helper to create document from JSON
function createDoc(json) {
  return Node.fromJSON(schema, json);
}

// Initial document
const initialDocJSON = {
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

// Content to insert
const insertContent = [
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
];

// Test the diff preview
function runTest() {
  console.log('🧪 Testing ProseMirror diff preview...\n');

  try {
    // Create initial document
    const initialDoc = createDoc(initialDocJSON);
    console.log('📄 Initial document:');
    console.log('  - Size:', initialDoc.nodeSize);
    console.log('  - Content nodes:', initialDoc.content.childCount);
    console.log('  - Text:', initialDoc.textContent);

    // Calculate insertion position (after the paragraph)
    // The document structure is:
    // doc(0) heading(1) ...text... heading(21) para(22) ...text... para(51) doc(52)
    // We want to insert at position 51 (before the doc closing)
    let insertPos = 1; // Start after doc opening
    initialDoc.content.forEach((node, index) => {
      insertPos += node.nodeSize;
    });
    // insertPos is now at 52, but we need to use 51 for insertion
    insertPos = insertPos - 1; // Adjust to valid insertion point

    console.log('\n📍 Insertion position:', insertPos);

    // Create the content to insert as individual nodes
    const nodesToInsert = insertContent.map(nodeJson => Node.fromJSON(schema, nodeJson));

    console.log('\n📝 Applying insertion...');

    // Apply the insertion using transform
    const { Transform } = require('prosemirror-transform');
    const tr = new Transform(initialDoc);

    // Insert each node
    let currentPos = insertPos;
    nodesToInsert.forEach(node => {
      tr.insert(currentPos, node);
      currentPos += node.nodeSize;
    });
    const modifiedDoc = tr.doc;

    console.log('  - Modified size:', modifiedDoc.nodeSize);
    console.log('  - Content nodes:', modifiedDoc.content.childCount);
    console.log('  - Modified:', initialDoc !== modifiedDoc ? '✅' : '❌');

    // Check modification
    if (modifiedDoc.eq(initialDoc)) {
      console.log('\n❌ Test failed: Document was not modified');
      process.exit(1);
    }

    console.log('\n↩️  Creating inverse operation...');

    // To revert, we need to delete the inserted content
    // Calculate the size of inserted content
    let insertedSize = 0;
    nodesToInsert.forEach(node => {
      insertedSize += node.nodeSize;
    });

    const deleteFrom = insertPos;
    const deleteTo = insertPos + insertedSize;

    const revertTr = new Transform(modifiedDoc);
    revertTr.delete(deleteFrom, deleteTo);
    const revertedDoc = revertTr.doc;

    console.log('  - Reverted size:', revertedDoc.nodeSize);
    console.log('  - Content nodes:', revertedDoc.content.childCount);

    // Check if documents are equal
    const isRestored = revertedDoc.eq(initialDoc);

    console.log('\n📊 Test Results:');
    console.log('  - Document restored:', isRestored ? '✅' : '❌');
    console.log('  - Sizes match:', revertedDoc.nodeSize === initialDoc.nodeSize ? '✅' : '❌');
    console.log('  - Content matches:', revertedDoc.content.eq(initialDoc.content) ? '✅' : '❌');

    if (isRestored) {
      console.log('\n✅ Test PASSED: Document successfully restored after apply/revert');
      process.exit(0);
    } else {
      console.log('\n❌ Test FAILED: Document not fully restored');
      console.log('\nInitial:', initialDoc.toJSON());
      console.log('\nReverted:', revertedDoc.toJSON());
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  }
}

// Check if ProseMirror is installed
try {
  require('prosemirror-model');
  require('prosemirror-transform');
  runTest();
} catch (error) {
  console.log('📦 Installing ProseMirror dependencies...');
  const { execSync } = require('child_process');
  execSync('npm install prosemirror-model prosemirror-transform prosemirror-schema-basic', {
    stdio: 'inherit'
  });
  console.log('\n');
  runTest();
}
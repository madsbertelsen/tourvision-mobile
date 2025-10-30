// Test to verify that applying multiple incremental steps produces
// the same final document as applying a single step with all content

import { Schema, DOMParser, Slice, Fragment } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { EditorState } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { JSDOM } from 'jsdom';

// Create the exact same schema as the client
const baseNodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');

// Add geoMark node to match client schema
const nodes = baseNodes.addToEnd('geoMark', {
  inline: true,
  group: 'inline',
  content: 'text*',
  attrs: {
    geoId: { default: null },
    placeName: { default: '' },
    lat: { default: '' },
    lng: { default: '' },
    colorIndex: { default: 0 },
    coordSource: { default: 'manual' },
    description: { default: null },
    transportFrom: { default: null },
    transportProfile: { default: null },
    waypoints: { default: null },
    visitDocument: { default: null },
    photoName: { default: null }
  }
});

// Add comment mark to match client schema
const marks = basicSchema.spec.marks.addToEnd('comment', {
  attrs: {
    commentId: { default: null },
    userId: { default: null },
    userName: { default: '' },
    content: { default: '' },
    createdAt: { default: null },
    resolved: { default: false },
    replies: { default: null }
  },
  inclusive: false
});

const mySchema = new Schema({
  nodes: nodes,
  marks: marks
});

console.log('Schema created successfully\n');

// Sample HTML content
const sampleHTML = `
<h1>Weekend in Copenhagen</h1>
<p>A wonderful weekend trip exploring the beautiful city of Copenhagen.</p>
<h2>Day 1</h2>
<p>Start at the colorful harbor and enjoy lunch by the canal.</p>
<ul>
  <li>Try the local food</li>
  <li>Take photos of colorful buildings</li>
</ul>
<h2>Day 2</h2>
<p>Visit the famous landmarks and museums.</p>
`;

// Helper to create empty document
function createEmptyDoc() {
  return mySchema.nodes.doc.create(null, [
    mySchema.nodes.paragraph.create()
  ]);
}

// Helper to parse HTML
function parseHTML(html) {
  const dom = new JSDOM(html);
  const parser = DOMParser.fromSchema(mySchema);
  return parser.parse(dom.window.document.body);
}

// Helper for deep equality check
function documentsEqual(doc1, doc2) {
  const json1 = JSON.stringify(doc1.toJSON());
  const json2 = JSON.stringify(doc2.toJSON());
  return json1 === json2;
}

console.log('=== Test 1: Single-Step Approach (Current Implementation) ===\n');

let singleStepDoc;
try {
  // 1. Create empty state
  const emptyDoc = createEmptyDoc();
  let state = EditorState.create({
    schema: mySchema,
    doc: emptyDoc
  });

  console.log('Starting with empty document');

  // 2. Parse entire HTML at once
  const fullDoc = parseHTML(sampleHTML);

  // 3. Create single ReplaceStep from 0 to 2 (replaces empty paragraph)
  const slice = fullDoc.slice(0, fullDoc.content.size);
  const step = new ReplaceStep(0, 2, slice);

  console.log('Created single ReplaceStep (0, 2) with', fullDoc.content.childCount, 'blocks');

  // 4. Apply the step
  const result = step.apply(state.doc);

  if (result.failed) {
    throw new Error('Single-step application failed: ' + result.failed);
  }

  // 5. Update state
  const tr = state.tr.step(step);
  state = state.apply(tr);
  singleStepDoc = state.doc;

  console.log('✅ Single-step approach succeeded');
  console.log('Final document has', singleStepDoc.content.childCount, 'blocks');
  console.log('Document size:', singleStepDoc.content.size);
  console.log();
} catch (error) {
  console.error('❌ Single-step approach failed:', error.message);
  process.exit(1);
}

console.log('=== Test 2: Multi-Step Approach (Incremental) ===\n');

let multiStepDoc;
try {
  // 1. Create empty state
  const emptyDoc = createEmptyDoc();
  let state = EditorState.create({
    schema: mySchema,
    doc: emptyDoc
  });

  console.log('Starting with empty document');

  // 2. Parse HTML to get individual blocks
  const fullDoc = parseHTML(sampleHTML);
  const blocks = [];
  fullDoc.content.forEach((node, offset, index) => {
    blocks.push(node);
  });

  console.log('Parsed HTML into', blocks.length, 'blocks:');
  blocks.forEach((block, i) => {
    console.log(`  ${i + 1}. ${block.type.name}${block.type.name === 'heading' ? ' (level ' + block.attrs.level + ')' : ''}`);
  });
  console.log();

  // 3. Apply blocks incrementally
  console.log('Applying blocks incrementally:');

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (i === 0) {
      // First block: replace the empty paragraph (0, 2)
      const fragment = Fragment.from(block);
      const slice = new Slice(fragment, 0, 0);
      const step = new ReplaceStep(0, 2, slice);

      console.log(`  Step ${i + 1}: Replace empty paragraph (0, 2) with ${block.type.name}`);

      const result = step.apply(state.doc);
      if (result.failed) {
        throw new Error(`Step ${i + 1} failed: ${result.failed}`);
      }

      const tr = state.tr.step(step);
      state = state.apply(tr);
    } else {
      // Subsequent blocks: append at the end
      const endPos = state.doc.content.size;
      const fragment = Fragment.from(block);
      const slice = new Slice(fragment, 0, 0);
      const step = new ReplaceStep(endPos, endPos, slice);

      console.log(`  Step ${i + 1}: Append ${block.type.name} at position ${endPos}`);

      const result = step.apply(state.doc);
      if (result.failed) {
        throw new Error(`Step ${i + 1} failed: ${result.failed}`);
      }

      const tr = state.tr.step(step);
      state = state.apply(tr);
    }
  }

  multiStepDoc = state.doc;

  console.log();
  console.log('✅ Multi-step approach succeeded');
  console.log('Final document has', multiStepDoc.content.childCount, 'blocks');
  console.log('Document size:', multiStepDoc.content.size);
  console.log();
} catch (error) {
  console.error('❌ Multi-step approach failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

console.log('=== Test 3: Compare Results ===\n');

console.log('Single-step document:');
console.log(JSON.stringify(singleStepDoc.toJSON(), null, 2));
console.log();

console.log('Multi-step document:');
console.log(JSON.stringify(multiStepDoc.toJSON(), null, 2));
console.log();

if (documentsEqual(singleStepDoc, multiStepDoc)) {
  console.log('✅✅✅ SUCCESS: Documents are identical!');
  console.log('Multi-step streaming can produce the same result as single-step.');
  process.exit(0);
} else {
  console.log('❌❌❌ FAILURE: Documents differ!');
  console.log();
  console.log('Differences:');
  console.log('Single-step blocks:', singleStepDoc.content.childCount);
  console.log('Multi-step blocks:', multiStepDoc.content.childCount);

  // Show block-by-block comparison
  const maxBlocks = Math.max(singleStepDoc.content.childCount, multiStepDoc.content.childCount);
  for (let i = 0; i < maxBlocks; i++) {
    const single = singleStepDoc.content.child(i);
    const multi = multiStepDoc.content.child(i);

    if (!single) {
      console.log(`Block ${i}: Missing in single-step`);
    } else if (!multi) {
      console.log(`Block ${i}: Missing in multi-step`);
    } else if (single.type.name !== multi.type.name) {
      console.log(`Block ${i}: Type mismatch - single: ${single.type.name}, multi: ${multi.type.name}`);
    } else {
      console.log(`Block ${i}: ✓ ${single.type.name}`);
    }
  }

  process.exit(1);
}

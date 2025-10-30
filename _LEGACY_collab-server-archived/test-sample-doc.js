// Test file to validate our sample document against the schema
import { Schema, DOMParser } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { EditorState } from 'prosemirror-state';
import { Step, ReplaceStep } from 'prosemirror-transform';
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

console.log('Schema created successfully');

// Very simple HTML sample
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

console.log('\n=== Test 1: Parse HTML to ProseMirror ===');
console.log('Sample HTML:');
console.log(sampleHTML);

try {
  // Parse HTML to ProseMirror document
  const dom = new JSDOM(sampleHTML);
  const parser = DOMParser.fromSchema(mySchema);
  const parsedDoc = parser.parse(dom.window.document.body);

  console.log('\n✅ HTML parsed successfully!');
  console.log('Document structure:', JSON.stringify(parsedDoc.toJSON(), null, 2));
  console.log('\nDocument size:', parsedDoc.content.size);
  console.log('Document nodeSize:', parsedDoc.nodeSize);
} catch (error) {
  console.error('❌ Failed to parse HTML:', error.message);
  console.error('Stack:', error.stack);
}

console.log('\n=== Test 2: Create Empty Editor State ===');
try {
  // Create an empty document with just one paragraph
  const emptyDoc = mySchema.nodes.doc.create(null, [
    mySchema.nodes.paragraph.create()
  ]);

  // Create an EditorState with the empty document
  const initialState = EditorState.create({
    schema: mySchema,
    doc: emptyDoc
  });

  console.log('✅ Initial state created');
  console.log('Initial document:', JSON.stringify(initialState.doc.toJSON(), null, 2));
  console.log('Document size:', initialState.doc.content.size);
  console.log('Document nodeSize:', initialState.doc.nodeSize);
} catch (error) {
  console.error('❌ Failed to create state:', error.message);
  console.error('Stack:', error.stack);
}

console.log('\n=== Test 3: Apply Steps to Replace Empty Document ===');
try {
  // 1. Create empty state
  const emptyDoc = mySchema.nodes.doc.create(null, [
    mySchema.nodes.paragraph.create()
  ]);
  let state = EditorState.create({
    schema: mySchema,
    doc: emptyDoc
  });

  console.log('Starting state:', JSON.stringify(state.doc.toJSON(), null, 2));

  // 2. Parse the HTML
  const dom = new JSDOM(sampleHTML);
  const parser = DOMParser.fromSchema(mySchema);
  const newDoc = parser.parse(dom.window.document.body);

  console.log('\nTarget document:', JSON.stringify(newDoc.toJSON(), null, 2));

  // 3. Create a transaction to replace the entire document
  let tr = state.tr;

  // Replace from position 0 to the end of the document
  // Position 0 = start of doc
  // state.doc.content.size = end of doc content
  const from = 0;
  const to = state.doc.content.size;

  console.log(`\nReplacing from position ${from} to ${to}`);

  // Create a slice from the new document
  const slice = newDoc.slice(0, newDoc.content.size);

  // Create the replace step
  const step = new ReplaceStep(from, to, slice);

  console.log('\nStep JSON:', JSON.stringify(step.toJSON(), null, 2));

  // Apply the step
  const result = step.apply(state.doc);

  if (result.failed) {
    console.error('❌ Step application failed:', result.failed);
  } else {
    console.log('✅ Step applied successfully!');
    console.log('\nResult document:', JSON.stringify(result.doc.toJSON(), null, 2));
    console.log('Result size:', result.doc.content.size);
    console.log('Result nodeSize:', result.doc.nodeSize);

    // Also test via transaction
    tr.step(step);
    state = state.apply(tr);
    console.log('\n✅ Transaction applied successfully!');
    console.log('Final state document:', JSON.stringify(state.doc.toJSON(), null, 2));
  }

} catch (error) {
  console.error('❌ Failed to apply steps:', error.message);
  console.error('Stack:', error.stack);
}

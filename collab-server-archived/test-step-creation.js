// Test file to reproduce the Step.fromJSON error
import { Schema } from 'prosemirror-model';
import { ReplaceStep, Step } from 'prosemirror-transform';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

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

// Test 1: Create a simple paragraph
console.log('\n=== Test 1: Simple paragraph ===');
try {
  const testContent = "This is a simple test paragraph without any special formatting.";

  // Create a paragraph node
  const paragraphNode = mySchema.nodes.paragraph.create(
    {}, // no attrs
    mySchema.text(testContent)
  );

  // Create a document with this paragraph
  const docNode = mySchema.nodes.doc.create(null, [paragraphNode]);

  console.log('Document created:', docNode.toJSON());

  // Create a slice for replacement
  const slice = docNode.slice(0, docNode.content.size);

  // Create a ReplaceStep
  const step = new ReplaceStep(1, 1, slice);

  // Convert to JSON (this is what we send over the wire)
  const stepJSON = step.toJSON();
  console.log('Step JSON:', JSON.stringify(stepJSON, null, 2));

  // Now try to recreate the step from JSON (this is what happens on the client)
  const recreatedStep = Step.fromJSON(mySchema, stepJSON);
  console.log('✅ Step recreated successfully from JSON!');

  // Test applying it to an empty document
  const emptyDoc = mySchema.nodes.doc.create(null, [
    mySchema.nodes.paragraph.create()
  ]);

  const result = recreatedStep.apply(emptyDoc);
  if (result.failed) {
    console.log('❌ Failed to apply step:', result.failed);
  } else {
    console.log('✅ Step applied successfully!');
    console.log('Result doc:', result.doc.toJSON());
  }
} catch (error) {
  console.error('❌ Error in Test 1:', error.message);
  console.error('Stack:', error.stack);
}

// Test 2: Create a paragraph with an ID attribute
console.log('\n=== Test 2: Paragraph with ID attribute ===');
try {
  const testContent = "This is a test paragraph with an ID attribute.";

  // Create a paragraph node WITH an id attribute
  const paragraphNode = mySchema.nodes.paragraph.create(
    { id: `node-${Date.now()}` }, // WITH id attr
    mySchema.text(testContent)
  );

  // Create a document with this paragraph
  const docNode = mySchema.nodes.doc.create(null, [paragraphNode]);

  console.log('Document created:', docNode.toJSON());

  // Create a slice for replacement
  const slice = docNode.slice(0, docNode.content.size);

  // Create a ReplaceStep
  const step = new ReplaceStep(1, 1, slice);

  // Convert to JSON
  const stepJSON = step.toJSON();
  console.log('Step JSON:', JSON.stringify(stepJSON, null, 2));

  // Try to recreate the step from JSON
  const recreatedStep = Step.fromJSON(mySchema, stepJSON);
  console.log('✅ Step recreated successfully from JSON!');

  // Test applying it
  const emptyDoc = mySchema.nodes.doc.create(null, [
    mySchema.nodes.paragraph.create()
  ]);

  const result = recreatedStep.apply(emptyDoc);
  if (result.failed) {
    console.log('❌ Failed to apply step:', result.failed);
  } else {
    console.log('✅ Step applied successfully!');
    console.log('Result doc:', result.doc.toJSON());
  }
} catch (error) {
  console.error('❌ Error in Test 2:', error.message);
  console.error('Stack:', error.stack);
}

// Test 3: Test the actual JSON being sent from our server
console.log('\n=== Test 3: Server-generated step JSON ===');
try {
  // This is the actual JSON structure from the server logs
  const serverStepJSON = {
    "stepType": "replace",
    "from": 1,
    "to": 1,
    "slice": {
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "This is a simple test paragraph without any special formatting."
            }
          ]
        }
      ]
    }
  };

  console.log('Server step JSON:', JSON.stringify(serverStepJSON, null, 2));

  // Try to create step from this JSON
  const step = Step.fromJSON(mySchema, serverStepJSON);
  console.log('✅ Step created from server JSON!');

} catch (error) {
  console.error('❌ Error with server JSON:', error.message);
  console.error('Stack:', error.stack);
}

// Test 4: Understanding positions
console.log('\n=== Test 4: Understanding positions ===');
try {
  // Create an empty document with one paragraph
  const emptyDoc = mySchema.nodes.doc.create(null, [
    mySchema.nodes.paragraph.create()
  ]);

  console.log('Empty doc structure:', emptyDoc.toJSON());
  console.log('Doc size:', emptyDoc.content.size);
  console.log('Doc nodeSize:', emptyDoc.nodeSize);

  // Position 0 = start of doc (before opening)
  // Position 1 = inside first paragraph (after paragraph opening)
  // Position 2 = end of first paragraph (before paragraph closing)
  // Position 3 = after first paragraph (after paragraph closing)

  console.log('\nPositions in empty doc with one paragraph:');
  console.log('Position 0: Start of doc (before doc open)');
  console.log('Position 1: Start of first paragraph content');
  console.log('Position 2: End of first paragraph content');
  console.log('Position 3: End of doc (after paragraph close)');

  // Now let's try replacing the WHOLE paragraph, not its content
  const testContent = "This is a replacement paragraph.";
  const newParagraph = mySchema.nodes.paragraph.create(
    {},
    mySchema.text(testContent)
  );

  // Create a slice with just the paragraph content (the text), not the paragraph itself
  const textOnlySlice = newParagraph.slice(1, newParagraph.content.size + 1);

  // This should replace the content INSIDE the paragraph (positions 1-2)
  const step1 = new ReplaceStep(1, 2, textOnlySlice);
  console.log('\nStep 1 (replace content inside paragraph):');
  console.log('From:', 1, 'To:', 2);

  const result1 = step1.apply(emptyDoc);
  if (result1.failed) {
    console.log('❌ Failed:', result1.failed);
  } else {
    console.log('✅ Success! Result:', result1.doc.toJSON());
  }

} catch (error) {
  console.error('❌ Error:', error.message);
}

// Test 5: Test what ReplaceStep.toJSON() actually produces
console.log('\n=== Test 4: What does ReplaceStep.toJSON() actually produce? ===');
try {
  const testContent = "Test content";
  const paragraphNode = mySchema.nodes.paragraph.create(
    {},
    mySchema.text(testContent)
  );
  const docNode = mySchema.nodes.doc.create(null, [paragraphNode]);
  const slice = docNode.slice(0, docNode.content.size);
  const step = new ReplaceStep(1, 1, slice);

  const actualJSON = step.toJSON();
  console.log('Actual ReplaceStep.toJSON() output:');
  console.log(JSON.stringify(actualJSON, null, 2));

  // Check if it has stepType field
  console.log('\nHas stepType field?', 'stepType' in actualJSON);
  console.log('Has type field?', 'type' in actualJSON);
  console.log('Object keys:', Object.keys(actualJSON));

} catch (error) {
  console.error('❌ Error:', error.message);
}
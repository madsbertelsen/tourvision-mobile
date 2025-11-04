/**
 * Isolated test script for ProseMirror HTML parser
 * Tests the htmlToProsemirror() function with geo-mark spans
 */

// Import the HTML parser function
const { htmlToProsemirror } = require('./utils/prosemirror-html');

console.log('='.repeat(80));
console.log('ProseMirror HTML Parser Test');
console.log('='.repeat(80));
console.log();

// Test Case 1: Simple geo-mark (matching the format from the screenshot)
console.log('Test 1: Simple geo-mark');
console.log('-'.repeat(80));

const testHTML1 = `<p>Lejre is a <span class="geo-mark" data-place-name="Lejre, Denmark" data-lat="55.7180" data-lng="12.2922" data-coord-source="llm" data-color-index="0">Lejre</span></p>`;

console.log('Input HTML:');
console.log(testHTML1);
console.log();

const result1 = htmlToProsemirror(testHTML1);

console.log('Parsed JSON:');
console.log(JSON.stringify(result1, null, 2));
console.log();

// Check if marks were captured
const paragraph1 = result1.content?.[0];
const hasMarks1 = paragraph1?.content?.some(node => node.marks && node.marks.length > 0);
console.log('✓ Has geo-marks:', hasMarks1);

if (hasMarks1) {
  const geoMarkNode = paragraph1.content.find(node => node.marks && node.marks.length > 0);
  const geoMark = geoMarkNode?.marks?.[0];
  console.log('✓ Geo-mark attributes:', JSON.stringify(geoMark?.attrs, null, 2));
} else {
  console.log('✗ ERROR: No geo-marks found in parsed output!');
}

console.log();
console.log('='.repeat(80));
console.log();

// Test Case 2: Multiple geo-marks
console.log('Test 2: Multiple geo-marks in one paragraph');
console.log('-'.repeat(80));

const testHTML2 = `<p>Visit <span class="geo-mark" data-place-name="Paris, France" data-lat="48.8566" data-lng="2.3522" data-coord-source="llm" data-color-index="0">Paris</span> and <span class="geo-mark" data-place-name="London, UK" data-lat="51.5074" data-lng="-0.1278" data-coord-source="llm" data-color-index="1">London</span>!</p>`;

console.log('Input HTML:');
console.log(testHTML2);
console.log();

const result2 = htmlToProsemirror(testHTML2);

console.log('Parsed JSON:');
console.log(JSON.stringify(result2, null, 2));
console.log();

const paragraph2 = result2.content?.[0];
const geoMarkCount = paragraph2?.content?.filter(node => node.marks && node.marks.length > 0).length || 0;
console.log('✓ Number of geo-marks found:', geoMarkCount);
console.log('✓ Expected: 2');

console.log();
console.log('='.repeat(80));
console.log();

// Test Case 3: Geo-mark with different attribute order
console.log('Test 3: Geo-mark with attributes in different order');
console.log('-'.repeat(80));

const testHTML3 = `<p>Test <span class="geo-mark" data-color-index="0" data-coord-source="llm" data-lat="55.7180" data-lng="12.2922" data-place-name="Lejre, Denmark">Lejre</span></p>`;

console.log('Input HTML:');
console.log(testHTML3);
console.log();

const result3 = htmlToProsemirror(testHTML3);

console.log('Parsed JSON:');
console.log(JSON.stringify(result3, null, 2));
console.log();

const paragraph3 = result3.content?.[0];
const hasMarks3 = paragraph3?.content?.some(node => node.marks && node.marks.length > 0);
console.log('✓ Has geo-marks:', hasMarks3);

console.log();
console.log('='.repeat(80));
console.log();

// Test Case 4: HTML without geo-marks (baseline)
console.log('Test 4: HTML without geo-marks (baseline)');
console.log('-'.repeat(80));

const testHTML4 = `<p>This is a regular paragraph with <strong>bold</strong> and <em>italic</em> text.</p>`;

console.log('Input HTML:');
console.log(testHTML4);
console.log();

const result4 = htmlToProsemirror(testHTML4);

console.log('Parsed JSON:');
console.log(JSON.stringify(result4, null, 2));
console.log();

const paragraph4 = result4.content?.[0];
const hasBoldMarks = paragraph4?.content?.some(node =>
  node.marks?.some(mark => mark.type === 'bold')
);
console.log('✓ Has bold marks:', hasBoldMarks);

console.log();
console.log('='.repeat(80));
console.log();

// Test Case 5: Complex HTML with headings and geo-marks
console.log('Test 5: Complex HTML with headings and geo-marks');
console.log('-'.repeat(80));

const testHTML5 = `<h2>Day 1: Denmark</h2><p>Visit <span class="geo-mark" data-place-name="Copenhagen, Denmark" data-lat="55.6761" data-lng="12.5683" data-coord-source="llm" data-color-index="0">Copenhagen</span> in the morning.</p>`;

console.log('Input HTML:');
console.log(testHTML5);
console.log();

const result5 = htmlToProsemirror(testHTML5);

console.log('Parsed JSON:');
console.log(JSON.stringify(result5, null, 2));
console.log();

const hasHeading = result5.content?.some(node => node.type === 'heading');
const hasParagraph = result5.content?.some(node => node.type === 'paragraph');
console.log('✓ Has heading:', hasHeading);
console.log('✓ Has paragraph:', hasParagraph);

const paragraph5 = result5.content?.find(node => node.type === 'paragraph');
const hasMarks5 = paragraph5?.content?.some(node => node.marks && node.marks.length > 0);
console.log('✓ Paragraph has geo-marks:', hasMarks5);

console.log();
console.log('='.repeat(80));
console.log('Test Complete!');
console.log('='.repeat(80));

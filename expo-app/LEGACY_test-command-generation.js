// Quick test to verify command generation
const { generateCommandSequence } = require('./utils/command-sequence-generator');
const { LANDING_DOCUMENT_CONTENT } = require('./utils/landing-document-content');

const config = {
  baseSpeed: 30,
  speedVariation: 0.3,
  pauseAfterPunctuation: 200,
  pauseAfterNewline: 400,
  pauseAfterGeoMark: 500,
};

console.log('Testing command generation...');
console.log('Document:', JSON.stringify(LANDING_DOCUMENT_CONTENT, null, 2));

try {
  const commands = generateCommandSequence(LANDING_DOCUMENT_CONTENT, config);
  console.log('\nGenerated', commands.length, 'commands');
  console.log('\nFirst 20 commands:');
  commands.slice(0, 20).forEach((cmd, i) => {
    console.log(`${i}: ${cmd.type}`, cmd.text ? `"${cmd.text}"` : '', `delay:${cmd.delay}ms`);
  });

  console.log('\n...skipping middle...\n');

  console.log('Last 10 commands:');
  commands.slice(-10).forEach((cmd, i) => {
    console.log(`${commands.length - 10 + i}: ${cmd.type}`, cmd.text ? `"${cmd.text}"` : '', `delay:${cmd.delay}ms`);
  });

  // Count by type
  const counts = {};
  commands.forEach(cmd => {
    counts[cmd.type] = (counts[cmd.type] || 0) + 1;
  });
  console.log('\nCommand counts:', counts);
} catch (error) {
  console.error('Error:', error);
}

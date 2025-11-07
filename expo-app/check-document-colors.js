// Simple script to check what colorIndex values are in the stored document
const fs = require('fs');

// This would need to be run in browser context to access localStorage
// For now, let's just show what we need to check
console.log(`
To check the stored document colorIndex values:

1. Open browser console
2. Run: JSON.parse(localStorage.getItem('@tourvision_documents'))
3. Find your document and check the colorIndex in each geo-mark node
`);

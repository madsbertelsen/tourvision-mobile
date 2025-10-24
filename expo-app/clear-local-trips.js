// Simple script to clear trips from browser localStorage
// Run this in the browser console on your app page

console.log('=== Clearing Local Trips ===');

// Clear the trips from localStorage
localStorage.removeItem('@tourvision_trips');

console.log('✅ Local trips cleared!');
console.log('Refresh the page to see the empty trip list.');

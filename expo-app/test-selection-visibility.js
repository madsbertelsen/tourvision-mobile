const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Navigating to landing page...');
  await page.goto('http://localhost:8082');

  // Wait for animation to start
  await page.waitForTimeout(3000);

  console.log('Waiting for selection to start...');
  // Wait until we see "Paris" typed (should take about 2 seconds)
  await page.waitForTimeout(2000);

  console.log('Selection should be happening now, taking screenshot...');
  // Take screenshot during selection (selection takes 750ms for 5 chars)
  await page.waitForTimeout(200); // Small delay to catch mid-selection
  await page.screenshot({ path: 'selection-in-progress.png' });
  console.log('Screenshot saved as selection-in-progress.png');

  await page.waitForTimeout(5000);
  await browser.close();
})();

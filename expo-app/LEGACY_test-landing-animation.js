const { chromium } = require('playwright');

(async () => {
  console.log('Starting Playwright test for landing page animation...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100 // Slow down to see what's happening
  });

  const page = await browser.newPage();

  // Listen to console logs from the browser
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Landing]') || text.includes('[WebView]') || text.includes('[ProseMirrorWebView]')) {
      console.log('BROWSER:', text);
    }
  });

  // Navigate to landing page
  console.log('Navigating to http://localhost:8082...');
  await page.goto('http://localhost:8082');

  // Wait for page to load
  await page.waitForTimeout(2000);

  console.log('Checking page title...');
  const title = await page.title();
  console.log('Page title:', title);

  // Check if the editor container is present
  console.log('Looking for editor...');
  const editorPresent = await page.locator('.ProseMirror').count() > 0;
  console.log('Editor present:', editorPresent);

  // Wait for animation to start
  console.log('Waiting for animation to start...');
  await page.waitForTimeout(5000);

  // Check if text is appearing
  console.log('Checking editor content...');
  const editorContent = await page.locator('.ProseMirror').textContent();
  console.log('Editor content:', editorContent);

  // Check if Paris geo-mark is created
  console.log('Looking for geo-mark...');
  await page.waitForTimeout(3000);
  const geoMarks = await page.locator('.geo-mark, [data-geo-id]').count();
  console.log('Geo-marks found:', geoMarks);

  if (geoMarks > 0) {
    const geoMarkText = await page.locator('.geo-mark, [data-geo-id]').first().textContent();
    console.log('Geo-mark text:', geoMarkText);

    // Check if it has background color (should be styled)
    const styles = await page.locator('.geo-mark, [data-geo-id]').first().evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        display: computed.display,
      };
    });
    console.log('Geo-mark styles:', styles);
  }

  // Take a screenshot
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'landing-animation-test.png', fullPage: true });
  console.log('Screenshot saved as landing-animation-test.png');

  // Keep browser open for inspection
  console.log('\nTest complete. Press Ctrl+C to close browser...');
  await page.waitForTimeout(60000);

  await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate to the app
  console.log('Navigating to app...');
  await page.goto('http://localhost:8082');

  // Wait for page to load
  await page.waitForTimeout(2000);

  // Check if we're on login page
  const isLoginPage = await page.locator('input[type="email"]').isVisible().catch(() => false);

  if (isLoginPage) {
    console.log('Logging in...');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign in")');
    await page.waitForTimeout(2000);
  }

  // Look for a trip to open
  console.log('Looking for trips...');
  const tripCard = page.locator('text=Barcelona').first();
  if (await tripCard.isVisible()) {
    console.log('Opening Barcelona trip...');
    await tripCard.click();
    await page.waitForTimeout(2000);
  } else {
    console.log('No Barcelona trip found, looking for any trip...');
    const anyTrip = page.locator('[class*="card"], [class*="trip"]').first();
    if (await anyTrip.isVisible()) {
      await anyTrip.click();
      await page.waitForTimeout(2000);
    }
  }

  // Click on Document tab if exists
  const documentTab = page.locator('text=Document').first();
  if (await documentTab.isVisible()) {
    console.log('Clicking Document tab...');
    await documentTab.click();
    await page.waitForTimeout(2000);
  }

  // Take a screenshot of the current state
  await page.screenshot({ path: 'before-comment.png' });
  console.log('Screenshot saved: before-comment.png');

  // Try to find the editor content
  console.log('Looking for editor...');
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();

  if (await editor.isVisible()) {
    console.log('Editor found!');

    // Click to focus the editor
    await editor.click();
    await page.waitForTimeout(500);

    // Try to select some text (select first paragraph)
    console.log('Selecting text...');
    await page.keyboard.press('Control+A'); // Select all
    await page.waitForTimeout(500);

    // Take screenshot after selection
    await page.screenshot({ path: 'after-selection.png' });
    console.log('Screenshot saved: after-selection.png');

    // Look for comment button or try keyboard shortcut
    console.log('Looking for comment functionality...');

    // Check browser console for errors
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

    // Wait and observe
    console.log('Waiting to observe behavior...');
    await page.waitForTimeout(5000);

    // Take final screenshot
    await page.screenshot({ path: 'final-state.png' });
    console.log('Screenshot saved: final-state.png');

  } else {
    console.log('Editor not found. Current URL:', page.url());
    await page.screenshot({ path: 'no-editor.png' });
  }

  // Keep browser open for manual inspection
  console.log('\nBrowser will stay open for manual testing...');
  console.log('Press Ctrl+C to close when done.');

  // Wait indefinitely
  await page.waitForTimeout(1000000);

  // await browser.close();
})();

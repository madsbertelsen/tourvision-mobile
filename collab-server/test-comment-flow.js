const { chromium } = require('playwright');

/**
 * Test script for @ai comment flow
 * This tests that:
 * 1. Comments with @ai mentions are saved to the document
 * 2. The comment triggers the new AI comment reply system
 * 3. The comment remains visible while AI generates a reply
 */

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('=== Testing @ai Comment Flow ===\n');

  // Navigate to the app
  console.log('1. Navigating to app...');
  await page.goto('http://localhost:8082');
  await page.waitForTimeout(2000);

  // Check if we're on login page
  const isLoginPage = await page.locator('input[type="email"]').isVisible().catch(() => false);

  if (isLoginPage) {
    console.log('2. Logging in...');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign in")');
    await page.waitForTimeout(2000);
  }

  // Navigate to the first trip
  console.log('3. Opening first trip...');
  const firstTrip = page.locator('[class*="card"], [class*="trip"]').first();
  if (await firstTrip.isVisible()) {
    await firstTrip.click();
    await page.waitForTimeout(2000);
  }

  console.log('4. Current URL:', page.url());

  // Try to directly test the comment functionality by calling React state setters
  console.log('5. Testing comment modal trigger...');

  const result = await page.evaluate(() => {
    // Try to find React fiber to access component state
    const iframe = document.querySelector('iframe');
    if (!iframe) return { success: false, error: 'No iframe found' };

    // Select text in the iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const headings = iframeDoc.querySelectorAll('h2');
    let day2Heading = null;
    for (const h of headings) {
      if (h.textContent.includes('Day 2') || h.textContent.includes('Day 1')) {
        day2Heading = h;
        break;
      }
    }

    if (!day2Heading) {
      return { success: false, error: 'No heading found to select' };
    }

    // Select the heading
    const range = iframeDoc.createRange();
    range.selectNodeContents(day2Heading);
    const selection = iframeDoc.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    return {
      success: true,
      selectedText: day2Heading.textContent,
      message: 'Text selected in iframe'
    };
  });

  console.log('6. Selection result:', result);

  if (!result.success) {
    console.error('Failed to select text:', result.error);
    console.log('\n=== Test Failed ===');
    console.log('The comment modal needs to be manually triggered.');
    console.log('Please select text in the editor and click the comment button.');
    console.log('\nKeeping browser open for manual testing...');
    await page.waitForTimeout(100000);
    await browser.close();
    return;
  }

  console.log('\n=== Manual Test Instructions ===');
  console.log('The automated test cannot fully test the comment flow because:');
  console.log('1. The comment button in the toolbar needs to be identified');
  console.log('2. The WebView message passing needs to be triggered properly');
  console.log('\nTo manually complete the test:');
  console.log('1. Select some text in the document');
  console.log('2. Click the comment button in the toolbar');
  console.log('3. Type: @ai I don\'t like art, make alternative plan');
  console.log('4. Click "Add Comment"');
  console.log('5. Verify that:');
  console.log('   - The comment remains visible in the document');
  console.log('   - Console shows "Requesting AI comment reply"');
  console.log('   - Collaboration is auto-enabled');
  console.log('   - Server receives the request-ai-comment-reply event');
  console.log('\nBrowser will stay open - press Ctrl+C to exit');

  await page.waitForTimeout(100000);
  await browser.close();
})();

const { chromium } = require('playwright');

/**
 * Test @ai comment flow
 * Verifies that comments with @ai mentions are saved and trigger AI reply system
 */

(async () => {
  console.log('=== Testing @ai Comment Flow ===\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Enable console logging
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[TripDocumentView]') ||
        text.includes('[WebView]') ||
        text.includes('comment') ||
        text.includes('AI')) {
      console.log(`[Browser] ${text}`);
    }
  });

  try {
    // Navigate to app
    console.log('1. Navigating to app...');
    await page.goto('http://localhost:8082');
    await page.waitForTimeout(2000);

    // Check if we need to login
    const isLoginPage = await page.locator('input[type="email"]').isVisible().catch(() => false);

    if (isLoginPage) {
      console.log('2. Logging in...');
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'TestPassword123!');
      await page.click('button:has-text("Sign in")');
      await page.waitForTimeout(2000);
    }

    // Open first trip
    console.log('3. Opening first trip...');
    const trips = await page.locator('text=/New Trip|Barcelona|Tokyo|Paris/').all();
    if (trips.length > 0) {
      await trips[0].click();
      await page.waitForTimeout(2000);
    } else {
      throw new Error('No trips found');
    }

    console.log('4. Current URL:', page.url());

    // Select text in the iframe
    console.log('5. Selecting text in document...');
    const selectionResult = await page.evaluate(() => {
      const iframe = document.querySelector('iframe');
      if (!iframe || !iframe.contentWindow) {
        return { success: false, error: 'No iframe found' };
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      // Find any heading to select
      const headings = iframeDoc.querySelectorAll('h1, h2, h3');
      if (headings.length === 0) {
        return { success: false, error: 'No headings found' };
      }

      const heading = headings[0];

      // Select the heading text
      const range = iframeDoc.createRange();
      range.selectNodeContents(heading);
      const selection = iframeDoc.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      return {
        success: true,
        selectedText: heading.textContent,
        tagName: heading.tagName
      };
    });

    if (!selectionResult.success) {
      console.error('Failed to select text:', selectionResult.error);
      throw new Error(selectionResult.error);
    }

    console.log(`   ✓ Selected: "${selectionResult.selectedText}" (${selectionResult.tagName})`);

    // Wait for selection to be processed
    await page.waitForTimeout(1000);

    // Now we need to trigger the comment modal
    // Looking for a button with text or icon related to comments
    console.log('6. Looking for comment button...');

    // Try to find comment button - it might be an icon or text
    const commentButtonSelectors = [
      'button:has-text("Comment")',
      'button[title*="comment" i]',
      'button[aria-label*="comment" i]',
      '[role="button"]:has-text("Comment")',
    ];

    let commentButton = null;
    for (const selector of commentButtonSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible().catch(() => false)) {
        commentButton = button;
        console.log(`   ✓ Found comment button: ${selector}`);
        break;
      }
    }

    if (!commentButton) {
      console.log('   ⚠ Comment button not found in toolbar');
      console.log('   Trying to directly trigger comment modal via iframe message...');

      // Try to send a message to the iframe to show comment editor
      await page.evaluate(() => {
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'showCommentEditor'
          }, '*');
        }
      });

      await page.waitForTimeout(500);
    } else {
      // Click the comment button
      console.log('7. Clicking comment button...');
      await commentButton.click();
      await page.waitForTimeout(1000);
    }

    // Check if comment modal appeared
    console.log('8. Checking for comment modal...');
    const modalVisible = await page.locator('text=/Add Comment|Create Comment|Comment/i').isVisible().catch(() => false);

    if (!modalVisible) {
      console.log('   ⚠ Comment modal not visible');
      console.log('   This might mean:');
      console.log('   - Comment feature is not yet implemented in the UI');
      console.log('   - Comment button selector needs to be updated');
      console.log('   - Manual intervention required');
      console.log('\n=== MANUAL TEST REQUIRED ===');
      console.log('Please manually:');
      console.log('1. Select some text in the document');
      console.log('2. Click the comment button');
      console.log('3. Type: @ai I don\'t like this, make it better');
      console.log('4. Click "Add Comment"');
      console.log('5. Observe the console logs below\n');

      // Keep browser open for manual testing
      console.log('Browser will stay open for 60 seconds...');
      await page.waitForTimeout(60000);
    } else {
      console.log('   ✓ Comment modal is visible');

      // Find the comment input field
      console.log('9. Typing @ai comment...');
      const commentInput = page.locator('textarea, input[type="text"]').filter({ hasText: '' }).first();
      await commentInput.fill('@ai I don\'t like art, make alternative plan');
      await page.waitForTimeout(500);

      console.log('10. Submitting comment...');
      const submitButton = page.locator('button:has-text("Add"), button:has-text("Save"), button:has-text("Submit")').first();
      await submitButton.click();

      console.log('11. Waiting for comment to be processed...');
      await page.waitForTimeout(3000);

      console.log('\n=== Verification ===');
      console.log('Check the console logs above for:');
      console.log('✓ [TripDocumentView] Saving comment:');
      console.log('✓ [TripDocumentView] AI comment detected:');
      console.log('✓ [TripDocumentView] Requesting AI comment reply');
      console.log('✓ Collaboration auto-enabled');

      // Keep browser open to observe results
      console.log('\nKeeping browser open to observe results...');
      await page.waitForTimeout(30000);
    }

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.log('\nKeeping browser open for debugging...');
    await page.waitForTimeout(30000);
  } finally {
    await browser.close();
    console.log('\n=== Test Complete ===');
  }
})();

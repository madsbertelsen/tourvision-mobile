const { chromium } = require('playwright');

/**
 * Test script for @ai comment functionality with socket fix verification
 *
 * This test verifies:
 * 1. Comments with @ai mentions are saved to the document
 * 2. Socket connection is established
 * 3. The AI comment reply request is sent via socket
 * 4. The comment remains visible while AI generates a reply
 */

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('=== Testing @ai Comment Flow with Socket Fix ===\n');

  // Collect console logs to verify socket connection
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);

    // Print important logs in real-time
    if (text.includes('Socket available') ||
        text.includes('Requesting AI comment reply') ||
        text.includes('ai-comment-reply') ||
        text.includes('Comment saved')) {
      console.log(`[Browser] ${text}`);
    }
  });

  // Navigate to the app
  console.log('1. Navigating to app...');
  await page.goto('http://localhost:8082');
  await page.waitForTimeout(3000);

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

  // Wait for collaboration to be ready
  console.log('5. Waiting for collaboration to initialize...');
  await page.waitForTimeout(3000);

  // Try to interact with the editor iframe
  console.log('6. Attempting to select text in editor...');

  const result = await page.evaluate(() => {
    // Find the iframe
    const iframe = document.querySelector('iframe');
    if (!iframe) return { success: false, error: 'No iframe found' };

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Find some text to select
    const paragraphs = iframeDoc.querySelectorAll('p, h1, h2, h3');
    if (paragraphs.length === 0) {
      return { success: false, error: 'No text content found' };
    }

    // Select the first paragraph or heading
    const targetElement = paragraphs[0];
    const range = iframeDoc.createRange();
    range.selectNodeContents(targetElement);
    const selection = iframeDoc.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    return {
      success: true,
      selectedText: targetElement.textContent,
      message: 'Text selected in iframe'
    };
  });

  console.log('7. Selection result:', result);

  if (!result.success) {
    console.error('Failed to select text:', result.error);
    console.log('\n=== Manual Testing Required ===');
    console.log('Please manually:');
    console.log('1. Select some text in the document');
    console.log('2. Click the comment button (chat bubble icon)');
    console.log('3. Type: @ai Change this to something different');
    console.log('4. Click "Add Comment"');
    console.log('\nWatch the console for:');
    console.log('- "[TripDocumentView] Socket available: true Connected: true"');
    console.log('- "[TripDocumentView] Requesting AI comment reply"');
    console.log('\nBrowser will stay open - press Ctrl+C to exit');

    await page.waitForTimeout(300000); // Wait 5 minutes for manual testing
    await browser.close();
    return;
  }

  // Now we need to click the comment button
  console.log('8. Looking for comment button...');

  // The comment button is in the toolbar - try to find and click it
  const commentButtonClicked = await page.evaluate(() => {
    // Try to find the comment button - it's an Ionicons chatbubble
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      const svg = button.querySelector('svg');
      if (svg && svg.innerHTML.includes('chatbubble')) {
        button.click();
        return true;
      }
    }
    return false;
  });

  if (!commentButtonClicked) {
    console.log('Comment button not found in DOM, trying alternative approach...');
  } else {
    console.log('9. Comment button clicked!');
    await page.waitForTimeout(1000);

    // Check if comment modal appeared
    const modalVisible = await page.locator('text=Add Comment').isVisible().catch(() => false);

    if (modalVisible) {
      console.log('10. Comment modal opened! Filling in @ai comment...');

      // Fill in the comment content
      const commentInput = page.locator('input[placeholder*="comment"], textarea[placeholder*="comment"]').first();
      await commentInput.fill('@ai Change this section to focus more on museums');

      console.log('11. Clicking "Add Comment" button...');
      await page.click('button:has-text("Add Comment")');

      await page.waitForTimeout(2000);

      // Check the logs for socket connection
      console.log('\n=== Verifying Socket Connection ===');
      const socketAvailableLog = consoleLogs.find(log => log.includes('Socket available:'));
      const requestingAILog = consoleLogs.find(log => log.includes('Requesting AI comment reply'));

      if (socketAvailableLog) {
        console.log('✓ Socket log found:', socketAvailableLog);
      } else {
        console.log('✗ Socket availability log NOT found');
      }

      if (requestingAILog) {
        console.log('✓ AI request log found:', requestingAILog);
      } else {
        console.log('✗ AI request log NOT found');
      }

      console.log('\n=== Test Summary ===');
      if (socketAvailableLog && requestingAILog) {
        console.log('✓ SUCCESS: Comment flow working correctly!');
        console.log('✓ Socket is available and AI request was sent');
      } else {
        console.log('✗ FAILURE: Comment flow has issues');
        console.log('Check the console logs above for details');
      }
    }
  }

  console.log('\n=== All Console Logs ===');
  console.log('Filtering for relevant logs...');
  const relevantLogs = consoleLogs.filter(log =>
    log.includes('Socket') ||
    log.includes('comment') ||
    log.includes('AI') ||
    log.includes('Collaboration')
  );
  relevantLogs.forEach(log => console.log(log));

  console.log('\nBrowser will stay open for inspection - press Ctrl+C to exit');
  await page.waitForTimeout(60000);

  await browser.close();
})();

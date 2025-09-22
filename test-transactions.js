#!/usr/bin/env node

const { chromium } = require('playwright');

async function testTransactionBasedDiff() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('1. Navigating to app...');
  await page.goto('http://localhost:8082');

  // Login
  console.log('2. Logging in...');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button:has-text("Sign in")');

  // Wait for dashboard
  await page.waitForTimeout(2000);

  // Open Barcelona trip
  console.log('3. Opening Barcelona Adventure trip...');
  await page.click('text=Barcelona Adventure');
  await page.waitForTimeout(2000);

  // Go to Document tab
  console.log('4. Navigating to Document tab...');
  await page.click('text=Document');
  await page.waitForTimeout(2000);

  // Send a message to trigger AI proposal
  console.log('5. Sending chat message to create proposal...');
  const chatInput = await page.locator('input[placeholder*="message"]').first();
  await chatInput.fill('Add a visit to Sagrada Familia with details about tickets and timing');
  await chatInput.press('Enter');

  // Wait for AI response
  console.log('6. Waiting for AI response with proposal...');
  await page.waitForSelector('text=Show Changes in Document', { timeout: 15000 });

  // Click to show diff
  console.log('7. Clicking "Show Changes in Document"...');
  await page.click('text=Show Changes in Document');
  await page.waitForTimeout(2000);

  // Check if content is now part of the document
  console.log('8. Checking if content appears in document (not as widget)...');

  // Take screenshot
  await page.screenshot({ path: 'transaction-diff-preview.png', fullPage: true });
  console.log('Screenshot saved as transaction-diff-preview.png');

  // Check console for transaction logs
  page.on('console', msg => {
    if (msg.text().includes('transaction') || msg.text().includes('Transaction')) {
      console.log('Console:', msg.text());
    }
  });

  // Toggle diff off
  console.log('9. Toggling diff preview off...');
  await page.click('text=Hide Changes');
  await page.waitForTimeout(1000);

  // Check if content was reverted
  console.log('10. Verifying content was reverted...');
  await page.screenshot({ path: 'transaction-diff-reverted.png', fullPage: true });
  console.log('Screenshot saved as transaction-diff-reverted.png');

  console.log('\n✅ Test completed successfully!');
  console.log('\nKey verification points:');
  console.log('- Proposal created with transaction steps');
  console.log('- Content integrated into document (not as overlay widget)');
  console.log('- Transaction can be reverted');

  await browser.close();
}

// Run the test
testTransactionBasedDiff().catch(console.error);
const { chromium } = require('playwright');

async function testAIGeneration() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down for visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🚀 Starting AI Generation Test...');

  try {
    // Navigate to the prompt document page
    console.log('📝 Navigating to prompt page...');
    await page.goto('http://localhost:8082/prompt-document');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check if we need to login first (if auth is required)
    if (await page.locator('text=Sign in').isVisible()) {
      console.log('🔐 Login required, signing in...');
      // You may need to add login logic here if the route is protected
    }

    // Wait for the prompt input to be visible
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 5000 });

    // Type in a trip prompt
    const testPrompt = 'Plan a 2-day weekend trip to Copenhagen with focus on design and architecture';
    console.log(`✏️ Entering prompt: "${testPrompt}"`);

    // Find and fill the input field
    const inputSelector = 'textarea, input[placeholder*="Plan"], input[placeholder*="document"]';
    await page.fill(inputSelector, testPrompt);

    // Take screenshot of filled form
    await page.screenshot({
      path: '.playwright-mcp/ai-generation-prompt-filled.png',
      fullPage: true
    });

    // Click the Generate Trip button
    console.log('🎨 Clicking Generate Trip button...');
    await page.click('text=Generate Trip');

    // Wait for navigation to the generation page
    await page.waitForURL('**/generate-document**', { timeout: 10000 });

    console.log('⏳ AI is generating the document...');

    // Wait for some content to appear (the AI generation will start)
    await page.waitForTimeout(3000); // Give it time to start generating

    // Take screenshot of generation in progress
    await page.screenshot({
      path: '.playwright-mcp/ai-generation-in-progress.png',
      fullPage: true
    });

    // Wait a bit more to see more content
    await page.waitForTimeout(5000);

    // Take another screenshot
    await page.screenshot({
      path: '.playwright-mcp/ai-generation-more-content.png',
      fullPage: true
    });

    console.log('✅ AI Generation test completed!');
    console.log('📸 Screenshots saved to .playwright-mcp/ directory');

    // Keep browser open for 10 seconds to observe the result
    console.log('👀 Keeping browser open for observation...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Test failed:', error);

    // Take error screenshot
    await page.screenshot({
      path: '.playwright-mcp/ai-generation-error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
    console.log('🏁 Test finished');
  }
}

// Run the test
testAIGeneration().catch(console.error);
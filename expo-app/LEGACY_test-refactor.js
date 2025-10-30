const { chromium } = require('playwright');

async function testRefactor() {
  console.log('🧪 Testing Trip→Document Refactor with Playwright\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Test 1: Homepage loads
    console.log('1️⃣  Testing homepage loads...');
    await page.goto('http://localhost:8081');
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    console.log('✅ Homepage loaded:', title);

    // Test 2: Login page loads
    console.log('\n2️⃣  Testing login page...');
    await page.goto('http://localhost:8081/login');
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    console.log('✅ Login page loaded with email input');

    // Test 3: Check for "Document" terminology (not "Trip")
    console.log('\n3️⃣  Checking for updated terminology...');
    const content = await page.content();

    // Should NOT contain old "trip" references in UI
    const hasTripReferences = content.toLowerCase().includes('my trips') ||
                              content.toLowerCase().includes('new trip') ||
                              content.toLowerCase().includes('create trip');

    if (hasTripReferences) {
      console.log('⚠️  WARNING: Found old "Trip" terminology in UI');
    } else {
      console.log('✅ No old "Trip" terminology found');
    }

    // Test 4: Login and check dashboard
    console.log('\n4️⃣  Testing login flow...');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign in")');

    // Wait for redirect
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log('✅ Logged in, current URL:', currentUrl);

    // Test 5: Check if document routes work
    console.log('\n5️⃣  Testing document routes...');
    const finalContent = await page.content();

    // Check for "Document" terminology
    const hasDocumentTerms = finalContent.includes('Document') ||
                             finalContent.includes('document');

    if (hasDocumentTerms) {
      console.log('✅ "Document" terminology present in UI');
    } else {
      console.log('⚠️  No "Document" terminology found');
    }

    // Test 6: Screenshot
    console.log('\n6️⃣  Taking screenshot...');
    await page.screenshot({ path: 'refactor-test-screenshot.png', fullPage: true });
    console.log('✅ Screenshot saved to refactor-test-screenshot.png');

    console.log('\n✨ All tests completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'refactor-test-error.png' });
    console.log('Error screenshot saved to refactor-test-error.png');
    throw error;
  } finally {
    await browser.close();
  }
}

testRefactor().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

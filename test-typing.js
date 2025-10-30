const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('http://localhost:8082/document/test-id');
  await page.waitForTimeout(3000);
  
  // Click in the iframe paragraph
  const frame = page.frameLocator('iframe');
  await frame.getByRole('paragraph').click();
  await page.waitForTimeout(500);
  
  // Type the text
  const text = 'Plan your next trip to Paris with TourVision! Start in Paris, explore the Eiffel Tower and Louvre Museum. Then drive to Brussels to see the Grand Place and enjoy Belgian chocolates.';
  await page.keyboard.type(text, { delay: 30 });
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '.playwright-mcp/text-typed.png', fullPage: true });
  
  console.log('Text typed successfully!');
  await browser.close();
})();

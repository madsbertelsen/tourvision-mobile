const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Navigating to landing page...');
  await page.goto('http://localhost:8082');
  
  console.log('Waiting for animation to complete (8 seconds)...');
  await page.waitForTimeout(8000);
  
  console.log('Taking screenshot after animation...');
  await page.screenshot({ path: 'after-animation.png' });
  
  // Access the iframe content
  console.log('Accessing iframe content...');
  const iframe = page.frameLocator('iframe');
  
  // Try to find and select the word "TourVision" in the editor
  console.log('Looking for text to select...');
  
  // Triple-click on "TourVision" to select it
  const tourVisionText = iframe.getByText('TourVision', { exact: false });
  console.log('Triple-clicking on "TourVision" to select it...');
  await tourVisionText.click({ clickCount: 3 });
  
  console.log('Waiting for floating menu to appear...');
  await page.waitForTimeout(1000);
  
  console.log('Taking screenshot with floating menu...');
  await page.screenshot({ path: 'floating-menu-visible.png' });
  
  // Check if floating menu is visible in the parent page
  const floatingMenu = page.locator('text=Add Location');
  const isVisible = await floatingMenu.isVisible().catch(() => false);
  console.log('Floating menu visible:', isVisible);
  
  if (isVisible) {
    console.log('SUCCESS: Floating menu is visible!');
    
    // Try to get the position
    const box = await floatingMenu.boundingBox();
    console.log('Menu position:', box);
  } else {
    console.log('WARNING: Floating menu is not visible');
    
    // Check console for any errors
    page.on('console', msg => console.log('Browser console:', msg.text()));
  }
  
  console.log('Keeping browser open for 5 seconds for manual inspection...');
  await page.waitForTimeout(5000);
  
  await browser.close();
  console.log('Test completed!');
})();

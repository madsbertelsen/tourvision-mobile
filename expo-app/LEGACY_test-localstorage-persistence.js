const { chromium } = require('playwright');

(async () => {
  console.log('Testing localStorage persistence for ProseMirror documents...');

  const browser = await chromium.launch({
    headless: false,
    devtools: true
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the document page
    console.log('1. Navigating to document page...');
    await page.goto('http://localhost:8082/document/test-id');

    // Wait for the editor to be ready
    await page.waitForTimeout(3000);

    // Check if there's existing content in localStorage
    console.log('2. Checking initial localStorage state...');
    const initialStorage = await page.evaluate(() => {
      const stored = localStorage.getItem('@tourvision_documents');
      return stored ? JSON.parse(stored) : null;
    });
    console.log('Initial localStorage:', initialStorage);

    // Click in the editor to focus it
    console.log('3. Focusing the editor...');
    const editorFrame = page.frameLocator('iframe');
    await editorFrame.locator('.ProseMirror').click();

    // Type some text
    console.log('4. Typing test content...');
    await page.keyboard.type(' This is a test of localStorage persistence. ');

    // Wait a bit for the change to propagate
    await page.waitForTimeout(2000);

    // Check localStorage again
    console.log('5. Checking if changes were saved to localStorage...');
    const updatedStorage = await page.evaluate(() => {
      const stored = localStorage.getItem('@tourvision_documents');
      return stored ? JSON.parse(stored) : null;
    });

    if (updatedStorage) {
      const testDoc = updatedStorage.find(d => d.id === 'test-id');
      if (testDoc) {
        console.log('✅ Document found in localStorage!');
        console.log('Document ID:', testDoc.id);
        console.log('Updated at:', new Date(testDoc.updatedAt).toISOString());
        console.log('Content preview:', JSON.stringify(testDoc.content).substring(0, 200) + '...');

        // Check if our test text is in the content
        const contentStr = JSON.stringify(testDoc.content);
        if (contentStr.includes('test of localStorage persistence')) {
          console.log('✅ Test content successfully saved to localStorage!');
        } else {
          console.log('❌ Test content not found in saved document');
        }
      } else {
        console.log('❌ Document with ID test-id not found in localStorage');
      }
    } else {
      console.log('❌ No documents in localStorage');
    }

    // Now reload the page to test loading
    console.log('\n6. Reloading page to test content loading...');
    await page.reload();
    await page.waitForTimeout(3000);

    // Check if the content is still there
    console.log('7. Checking if content persisted after reload...');
    const editorContent = await editorFrame.locator('.ProseMirror').textContent();
    console.log('Editor content after reload:', editorContent);

    if (editorContent.includes('test of localStorage persistence')) {
      console.log('✅ Content successfully loaded from localStorage after reload!');
    } else {
      console.log('❌ Content was not restored after reload');

      // Check what's in localStorage
      const finalStorage = await page.evaluate(() => {
        const stored = localStorage.getItem('@tourvision_documents');
        return stored ? JSON.parse(stored) : null;
      });
      console.log('Final localStorage state:', finalStorage);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }

  // Keep browser open for inspection
  console.log('\nTest complete. Browser will stay open for 30 seconds for inspection...');
  await page.waitForTimeout(30000);

  await browser.close();
})();
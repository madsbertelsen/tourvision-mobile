import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('1. Navigating to document...');
  await page.goto('http://localhost:8082/document/test-id');
  await page.waitForTimeout(3000);

  console.log('2. Clicking in iframe first...');
  const iframe = page.frameLocator('iframe');
  await iframe.locator('p').click();
  await page.waitForTimeout(1000);

  console.log('3. Typing text...');
  const text = readFileSync('/tmp/text-to-type.txt', 'utf-8').trim();
  await page.keyboard.type(text, { delay: 10 });
  await page.waitForTimeout(2000);

  console.log('4. Taking screenshot after typing...');
  await page.screenshot({ path: '.playwright-mcp/after-typing.png' });

  console.log('5. Selecting Paris...');
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe');
    const iframeDoc = iframe.contentDocument;
    const paragraph = iframeDoc.querySelector('p');
    const text = paragraph.textContent;
    const parisIndex = text.indexOf('to Paris');

    const selection = iframeDoc.getSelection();
    const range = iframeDoc.createRange();
    const textNode = paragraph.firstChild;

    range.setStart(textNode, parisIndex + 3);
    range.setEnd(textNode, parisIndex + 8);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await page.waitForTimeout(1000);
  console.log('6. Clicking location button...');
  await page.click('text=📍');

  await page.waitForTimeout(2000);
  console.log('7. Clicking Continue...');
  await page.click('text=Continue');

  await page.waitForTimeout(1000);
  console.log('8. Clicking Add to Document...');
  await page.click('text=Add to Document');

  await page.waitForTimeout(3000);

  // Select Brussels
  console.log('9. Selecting Brussels...');
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe');
    const iframeDoc = iframe.contentDocument;
    const paragraph = iframeDoc.querySelector('p');

    // Find all text nodes
    function getAllTextNodes(node) {
      let textNodes = [];
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node);
      } else {
        for (let child of node.childNodes) {
          textNodes = textNodes.concat(getAllTextNodes(child));
        }
      }
      return textNodes;
    }

    const textNodes = getAllTextNodes(paragraph);
    let allText = '';
    const nodeMap = [];

    for (const node of textNodes) {
      nodeMap.push({ node, start: allText.length, text: node.textContent });
      allText += node.textContent;
    }

    console.log('Full text:', allText);

    const brusselsIndex = allText.indexOf('to Brussels');
    const startOffset = brusselsIndex + 3;
    const endOffset = startOffset + 8;

    console.log('Brussels selection:', { brusselsIndex, startOffset, endOffset });

    let startNode = null, endNode = null;
    let startNodeOffset = 0, endNodeOffset = 0;

    for (const item of nodeMap) {
      if (startOffset >= item.start && startOffset < item.start + item.text.length) {
        startNode = item.node;
        startNodeOffset = startOffset - item.start;
      }
      if (endOffset > item.start && endOffset <= item.start + item.text.length) {
        endNode = item.node;
        endNodeOffset = endOffset - item.start;
      }
    }

    const selection = iframeDoc.getSelection();
    const range = iframeDoc.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await page.waitForTimeout(1000);
  console.log('10. Clicking location button for Brussels...');
  await page.click('text=📍');

  await page.waitForTimeout(2000);
  console.log('11. Clicking Continue...');
  await page.click('text=Continue');

  await page.waitForTimeout(1000);
  console.log('12. Clicking Add to Document...');
  await page.click('text=Add to Document');

  await page.waitForTimeout(3000);

  console.log('13. Taking final screenshot...');
  await page.screenshot({ path: '.playwright-mcp/final-color-test.png' });

  console.log('14. Extracting color information...');
  const colorInfo = await page.evaluate(() => {
    const iframe = document.querySelector('iframe');
    const iframeDoc = iframe.contentDocument;

    // Get document geo-mark colors
    const geoMarks = Array.from(iframeDoc.querySelectorAll('[data-geo-id]'));
    const docColors = geoMarks.map(gm => {
      const style = window.getComputedStyle(gm);
      return {
        name: gm.textContent,
        backgroundColor: style.backgroundColor,
        geoId: gm.getAttribute('data-geo-id')
      };
    });

    return { docColors };
  });

  console.log('\n=== COLOR VERIFICATION ===');
  console.log('Document geo-marks:', JSON.stringify(colorInfo.docColors, null, 2));
  console.log('\n✅ Test complete! Check .playwright-mcp/final-color-test.png');
  console.log('Expected: Paris=Blue (rgb(59, 130, 246)), Brussels=Purple (rgb(139, 92, 246))');

  await page.waitForTimeout(5000);
  await browser.close();
})();

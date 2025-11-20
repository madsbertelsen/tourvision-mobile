/**
 * Agent Worker Launcher
 *
 * This Node.js process launches a Playwright headless browser and runs the browser-agent script.
 * It bridges IPC communication between the agent manager and the browser context.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import dotenv from 'dotenv';
import type {
  BrowserToManagerMessage,
  ManagerToBrowserMessage
} from './shared/browser-ipc-types.js';

dotenv.config();

const DOCUMENT_ID = process.argv[2] || process.env.DOCUMENT_ID;
const AGENT_ID = process.env.AGENT_ID;

if (!DOCUMENT_ID || !AGENT_ID) {
  console.error('[Agent Launcher] ❌ Missing DOCUMENT_ID or AGENT_ID');
  console.error('[Agent Launcher] Usage: tsx agent-worker-launcher.ts <documentId>');
  console.error('[Agent Launcher] Or set DOCUMENT_ID and AGENT_ID env vars');
  process.exit(1);
}

console.log(`[Agent Launcher] 🚀 Starting for document: ${DOCUMENT_ID}`);
console.log(`[Agent Launcher] Agent ID: ${AGENT_ID}`);

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

async function launch() {
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      slowMo: parseInt(process.env.PLAYWRIGHT_SLOW_MO || '0'),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Avoid /dev/shm issues
        '--disable-web-security' // Allow cross-origin WebSocket
      ]
    });

    console.log('[Agent Launcher] ✅ Browser launched');

    // Create context
    context = await browser.newContext({
      viewport: null, // No viewport (headless)
      userAgent: 'TourVision-Agent/1.0'
    });

    // Create page
    page = await context.newPage();

    // Expose function for browser → Node.js communication
    await page.exposeFunction('sendToManager', (msg: BrowserToManagerMessage) => {
      console.log('[Agent Launcher] 📤 Message from browser:', msg.type);
      if (process.send) {
        process.send(msg);
      }
    });

    // Inject environment variables
    await page.addInitScript({
      content: `
        window.ENV = {
          DOCUMENT_ID: '${DOCUMENT_ID}',
          AGENT_ID: '${AGENT_ID}',
          WS_PROTOCOL: '${process.env.WS_PROTOCOL || 'ws'}',
          WS_HOST: '${process.env.WS_HOST || 'localhost'}',
          WS_PORT: '${process.env.WS_PORT || '8787'}',
          AI_GATEWAY_API_KEY: '${process.env.AI_GATEWAY_API_KEY || ''}'
        };
        console.log('[Browser ENV] Injected:', window.ENV);
      `
    });

    // Load browser agent script
    await page.addInitScript({ path: './browser-agent-bundle.js' });

    console.log('[Agent Launcher] 📜 Browser agent script injected');

    // Navigate to blank page to trigger scripts
    await page.goto('about:blank');

    console.log('[Agent Launcher] ✅ Browser agent loaded and running');

    // Listen for console messages from browser
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '💬';
      console.log(`[Browser Console ${type.toUpperCase()}] ${prefix} ${text}`);
    });

    // Handle page errors
    page.on('pageerror', (error) => {
      console.error('[Browser Error] ❌', error.message);
      if (process.send) {
        process.send({
          type: 'error',
          documentId: DOCUMENT_ID,
          agentId: AGENT_ID,
          error: error.message
        });
      }
    });

    // Handle page crashes
    page.on('crash', () => {
      console.error('[Agent Launcher] ❌ Browser page crashed!');
      if (process.send) {
        process.send({
          type: 'error',
          documentId: DOCUMENT_ID,
          agentId: AGENT_ID,
          error: 'Browser page crashed'
        });
      }
      process.exit(1);
    });

    // Handle dialog popups (auto-dismiss)
    page.on('dialog', async (dialog) => {
      console.log('[Agent Launcher] 🔔 Dialog:', dialog.message());
      await dialog.dismiss();
    });

  } catch (error: any) {
    console.error('[Agent Launcher] ❌ Failed to launch:', error.message);
    process.exit(1);
  }
}

// Handle messages from manager → browser
process.on('message', async (msg: ManagerToBrowserMessage) => {
  console.log('[Agent Launcher] 📥 Message from manager:', msg.type);

  if (msg.type === 'shutdown') {
    console.log('[Agent Launcher] Shutdown requested');
    await cleanup();
    process.exit(0);
  }

  // Forward to browser
  if (page) {
    try {
      await page.evaluate((message) => {
        if (window.handleManagerMessage) {
          window.handleManagerMessage(message);
        } else {
          console.error('[Browser] handleManagerMessage not defined yet');
        }
      }, msg);
    } catch (error: any) {
      console.error('[Agent Launcher] ❌ Failed to forward message to browser:', error.message);
    }
  }
});

// Cleanup
async function cleanup() {
  console.log('[Agent Launcher] 🧹 Cleaning up...');

  try {
    if (page) {
      await page.close();
      page = null;
    }
    if (context) {
      await context.close();
      context = null;
    }
    if (browser) {
      await browser.close();
      browser = null;
    }
    console.log('[Agent Launcher] ✅ Cleanup complete');
  } catch (error: any) {
    console.error('[Agent Launcher] ⚠️  Error during cleanup:', error.message);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n[Agent Launcher] SIGINT received');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Agent Launcher] SIGTERM received');
  await cleanup();
  process.exit(0);
});

// Unhandled errors
process.on('uncaughtException', async (error) => {
  console.error('[Agent Launcher] ❌ Uncaught exception:', error);
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[Agent Launcher] ❌ Unhandled rejection at:', promise, 'reason:', reason);
  await cleanup();
  process.exit(1);
});

// Start
launch();

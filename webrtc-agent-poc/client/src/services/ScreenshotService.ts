/**
 * ScreenshotService - Capture and store screenshots for vision analysis
 *
 * Features:
 * - Capture full viewport as base64 JPEG using Canvas API
 * - Store in IndexedDB with metadata (documentId, timestamp, question)
 * - Auto-cleanup: Keep only last 10 screenshots per document
 * - Retrieve latest screenshot for analysis
 */

export interface Screenshot {
  id: string;
  documentId: string;
  dataUrl: string;  // base64 JPEG
  timestamp: number;
  question?: string;
}

export class ScreenshotService {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'agent-screenshots';
  private readonly STORE_NAME = 'screenshots';
  private readonly MAX_PER_DOCUMENT = 10;

  /**
   * Initialize IndexedDB connection
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onerror = () => {
        console.error('[ScreenshotService] IndexedDB open error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[ScreenshotService] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });

          // Create indexes for querying
          store.createIndex('documentId', 'documentId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('documentId_timestamp', ['documentId', 'timestamp'], { unique: false });

          console.log('[ScreenshotService] Object store created');
        }
      };
    });
  }

  /**
   * Capture full viewport as base64 JPEG
   * Uses html2canvas to capture DOM and WebGL content
   * Relies on preserveDrawingBuffer: true on Mapbox maps for WebGL capture
   */
  async captureViewport(): Promise<string> {
    console.log('[ScreenshotService] Starting viewport capture');

    try {
      // Dynamic import of html2canvas
      const html2canvas = (await import('html2canvas')).default;

      console.log('[ScreenshotService] Capturing entire viewport with html2canvas');

      // Capture the entire document body
      // With preserveDrawingBuffer: true on Mapbox maps, canvases will be captured correctly
      const canvas = await html2canvas(document.body, {
        allowTaint: true,
        useCORS: true,
        logging: false,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        scrollY: -window.scrollY,
        scrollX: -window.scrollX,
      });

      // Get quality from env or default to 0.85
      const quality = Number(import.meta.env.VITE_SCREENSHOT_QUALITY) || 0.85;
      const dataUrl = canvas.toDataURL('image/jpeg', quality);

      console.log('[ScreenshotService] Viewport captured:', dataUrl.substring(0, 50) + '...');
      console.log('[ScreenshotService] Captured dimensions:', canvas.width, 'x', canvas.height);

      return dataUrl;
    } catch (error) {
      console.error('[ScreenshotService] Capture failed:', error);
      throw error;
    }
  }

  /**
   * Store screenshot in IndexedDB with metadata
   * Automatically cleans up old screenshots (keeps last 10 per document)
   */
  async storeScreenshot(
    documentId: string,
    dataUrl: string,
    question?: string
  ): Promise<string> {
    console.log('[ScreenshotService] Storing screenshot for documentId:', documentId);

    if (!this.db) {
      throw new Error('IndexedDB not initialized. Call init() first.');
    }

    const timestamp = Date.now();
    const id = `screenshot-${timestamp}`;

    const screenshot: Screenshot = {
      id,
      documentId,
      dataUrl,
      timestamp,
      question
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);

      const request = store.add(screenshot);

      request.onsuccess = async () => {
        console.log('[ScreenshotService] Screenshot stored:', id);

        // Cleanup old screenshots after successful store
        try {
          await this.cleanupOldScreenshots(documentId);
        } catch (cleanupError) {
          console.warn('[ScreenshotService] Cleanup failed:', cleanupError);
          // Don't reject - screenshot was stored successfully
        }

        resolve(id);
      };

      request.onerror = () => {
        console.error('[ScreenshotService] Store error:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Retrieve latest screenshot for a document
   */
  async getLatestScreenshot(documentId: string): Promise<Screenshot | null> {
    console.log('[ScreenshotService] Retrieving screenshot for documentId:', documentId);

    if (!this.db) {
      throw new Error('IndexedDB not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('documentId_timestamp');

      // Query by documentId and get all, then sort by timestamp DESC
      const range = IDBKeyRange.bound([documentId, 0], [documentId, Date.now()]);
      const request = index.openCursor(range, 'prev'); // 'prev' for descending order

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          console.log('[ScreenshotService] Latest screenshot found:', cursor.value.id);
          resolve(cursor.value as Screenshot);
        } else {
          console.log('[ScreenshotService] No screenshots found for document:', documentId);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[ScreenshotService] Query error:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Cleanup old screenshots - keep only last 10 per document
   * Private method, called automatically after storing
   */
  private async cleanupOldScreenshots(documentId: string): Promise<void> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('documentId_timestamp');

      // Get all screenshots for this document
      const range = IDBKeyRange.bound([documentId, 0], [documentId, Date.now()]);
      const request = index.openCursor(range, 'prev'); // Descending by timestamp

      const screenshots: Screenshot[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          screenshots.push(cursor.value as Screenshot);
          cursor.continue();
        } else {
          // Got all screenshots, now delete extras
          const maxToKeep = Number(import.meta.env.VITE_MAX_SCREENSHOTS_PER_DOC) || this.MAX_PER_DOCUMENT;

          if (screenshots.length > maxToKeep) {
            const toDelete = screenshots.slice(maxToKeep);
            console.log(`[ScreenshotService] Cleaning up ${toDelete.length} old screenshots`);

            const deletePromises = toDelete.map(screenshot => {
              return new Promise<void>((resolveDelete, rejectDelete) => {
                const deleteRequest = store.delete(screenshot.id);
                deleteRequest.onsuccess = () => resolveDelete();
                deleteRequest.onerror = () => rejectDelete(deleteRequest.error);
              });
            });

            Promise.all(deletePromises)
              .then(() => {
                console.log('[ScreenshotService] Cleanup complete');
                resolve();
              })
              .catch(reject);
          } else {
            console.log('[ScreenshotService] No cleanup needed');
            resolve();
          }
        }
      };

      request.onerror = () => {
        console.error('[ScreenshotService] Cleanup query error:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all screenshots for a document
   * Useful for cleanup on document close
   */
  async clearDocument(documentId: string): Promise<void> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('documentId');

      const range = IDBKeyRange.only(documentId);
      const request = index.openCursor(range);

      const deletePromises: Promise<void>[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          deletePromises.push(
            new Promise((resolveDelete, rejectDelete) => {
              const deleteRequest = cursor.delete();
              deleteRequest.onsuccess = () => resolveDelete();
              deleteRequest.onerror = () => rejectDelete(deleteRequest.error);
            })
          );
          cursor.continue();
        } else {
          // All cursors processed
          Promise.all(deletePromises)
            .then(() => {
              console.log(`[ScreenshotService] Cleared ${deletePromises.length} screenshots for document:`, documentId);
              resolve();
            })
            .catch(reject);
        }
      };

      request.onerror = () => {
        console.error('[ScreenshotService] Clear error:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Display the latest screenshot in a new window (for debugging)
   */
  async displayLatestScreenshot(documentId: string): Promise<void> {
    const screenshot = await this.getLatestScreenshot(documentId);

    if (!screenshot) {
      console.warn('[ScreenshotService] No screenshot found to display');
      alert('No screenshot found for this document');
      return;
    }

    // Open in new window
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Screenshot - ${screenshot.id}</title>
            <style>
              body { margin: 0; padding: 20px; background: #1a1a1a; }
              img { max-width: 100%; height: auto; border: 1px solid #333; }
              .info { color: #fff; font-family: monospace; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="info">ID: ${screenshot.id}</div>
            <div class="info">Document: ${screenshot.documentId}</div>
            <div class="info">Timestamp: ${new Date(screenshot.timestamp).toLocaleString()}</div>
            <div class="info">Question: ${screenshot.question || 'N/A'}</div>
            <img src="${screenshot.dataUrl}" alt="Screenshot" />
          </body>
        </html>
      `);
    }
  }

  /**
   * Download the latest screenshot as a file
   */
  async downloadLatestScreenshot(documentId: string): Promise<void> {
    const screenshot = await this.getLatestScreenshot(documentId);

    if (!screenshot) {
      console.warn('[ScreenshotService] No screenshot found to download');
      return;
    }

    const link = document.createElement('a');
    link.href = screenshot.dataUrl;
    link.download = `${screenshot.id}.jpg`;
    link.click();
  }

  /**
   * List all screenshots in IndexedDB (for debugging)
   */
  async listAllScreenshots(): Promise<Screenshot[]> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const screenshots = request.result as Screenshot[];
        console.log('[ScreenshotService] All screenshots:', screenshots.map(s => ({
          id: s.id,
          documentId: s.documentId,
          timestamp: new Date(s.timestamp).toLocaleString(),
          question: s.question
        })));
        resolve(screenshots);
      };

      request.onerror = () => {
        console.error('[ScreenshotService] List error:', request.error);
        reject(request.error);
      };
    });
  }
}

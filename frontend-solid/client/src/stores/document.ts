import { createSignal } from 'solid-js';

const DOCUMENTS_KEY = 'tourvision-documents';
const CURRENT_DOC_KEY = 'tourvision-current-doc';

export function createDocumentStore() {
  // Load from localStorage
  const storedDocs = localStorage.getItem(DOCUMENTS_KEY);
  const initialDocs = storedDocs ? JSON.parse(storedDocs) : [];

  const [documents, setDocuments] = createSignal<string[]>(initialDocs);
  const [currentDocId, setCurrentDocId] = createSignal<string | null>(null);

  // Save documents to localStorage
  function saveDocuments(docs: string[]) {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
    setDocuments(docs);
  }

  // Create new document
  function createDocument(): string {
    const newDocId = `doc-${Date.now()}`;
    const updated = [...documents(), newDocId];
    saveDocuments(updated);
    return newDocId;
  }

  // Set current document
  function setDocument(docId: string) {
    setCurrentDocId(docId);
    sessionStorage.setItem(CURRENT_DOC_KEY, docId);

    // Add to documents list if not already there
    if (!documents().includes(docId)) {
      const updated = [...documents(), docId];
      saveDocuments(updated);
    }

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('doc', docId);
    window.history.pushState({}, '', url.toString());
  }

  // Initialize from URL or session storage
  function initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const urlDocId = params.get('doc');

    if (urlDocId) {
      setDocument(urlDocId);
    } else {
      const sessionDocId = sessionStorage.getItem(CURRENT_DOC_KEY);
      if (sessionDocId) {
        setDocument(sessionDocId);
      }
    }
  }

  // Delete document
  function deleteDocument(docId: string) {
    const updated = documents().filter((id) => id !== docId);
    saveDocuments(updated);

    // If deleting current document, clear it
    if (currentDocId() === docId) {
      setCurrentDocId(null);
      sessionStorage.removeItem(CURRENT_DOC_KEY);
    }
  }

  return {
    documents,
    currentDocId,
    createDocument,
    setDocument,
    deleteDocument,
    initFromUrl
  };
}

// Singleton instance
let documentStore: ReturnType<typeof createDocumentStore> | null = null;

export function getDocumentStore() {
  if (!documentStore) {
    documentStore = createDocumentStore();
  }
  return documentStore;
}

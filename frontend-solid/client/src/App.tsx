import { type Component, Show, createEffect, onMount, onCleanup } from 'solid-js';
import { Editor } from './components/Editor/Editor';
import { Header } from './components/UI/Header';
import { MapPreview } from './components/Map/MapPreview';
import { getDocumentStore } from './stores/document';
import { getCollaborationStore } from './stores/collaboration';
import styles from './styles/app.module.scss';

const App: Component = () => {
  const documentStore = getDocumentStore();
  const collaboration = getCollaborationStore();
  let lastDocId: string | null = null;

  // Initialize from URL on mount
  onMount(() => {
    documentStore.initFromUrl();
  });

  // Initialize collaboration when document changes
  createEffect(() => {
    const docId = documentStore.currentDocId();

    // Only reinitialize if docId actually changed
    if (docId && docId !== lastDocId) {
      console.log('[App] Document changed, initializing collaboration:', docId);
      lastDocId = docId;

      // Destroy previous connection
      collaboration.destroy();
      // Initialize new connection
      collaboration.initDocument(docId);
    }
  });

  // Cleanup on unmount
  onCleanup(() => {
    collaboration.destroy();
  });

  const handleNewDocument = () => {
    const newDocId = documentStore.createDocument();
    documentStore.setDocument(newDocId);
  };

  return (
    <div class={styles.app}>
      <Header onNewDocument={handleNewDocument} />

      <Show
        when={documentStore.currentDocId()}
        fallback={
          <div class={styles.emptyState}>
            <h2>No document selected</h2>
            <p>Create a new document to get started</p>
            <button class={styles.createButton} onClick={handleNewDocument}>
              Create First Document
            </button>
          </div>
        }
      >
        <div class={styles.content}>
          <div class={styles.editorSection}>
            <Show when={collaboration.state().yDoc && collaboration.state().provider}>
              <Editor />
            </Show>
          </div>

          <div class={styles.mapSection}>
            <h2 class={styles.sectionTitle}>Map Preview</h2>
            <MapPreview visible={true} />
          </div>
        </div>
      </Show>
    </div>
  );
};

export default App;

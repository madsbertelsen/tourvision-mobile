import { type Component, Show, createEffect, onCleanup, on, untrack } from 'solid-js';
import { useParams, useNavigate, type RouteSectionProps } from '@solidjs/router';
import { Editor } from './components/Editor/Editor';
import { Header } from './components/UI/Header';
import { FullscreenMap } from './components/Map/FullscreenMap';
import { MapViewerOverlay } from './components/Map/MapViewerOverlay';
import { InvitationModal } from './components/UI/InvitationModal';
import { AgentOverlay } from './components/Agent/AgentOverlay';
import { getDocumentStore } from './stores/document';
import { getCollaborationStore } from './stores/collaboration';
import { getLocationsStore } from './stores/locations';
import { getFullscreenMapStore } from './stores/fullscreenMap';
import { useAgentMode } from './hooks/useAgentMode';
import styles from './styles/app.module.scss';

// Layout component for document view - keeps editor mounted
export const DocumentLayout: Component = () => {
  const params = useParams<{ docId: string; mapId?: string }>();
  const documentStore = getDocumentStore();
  const collaboration = getCollaborationStore();
  const locationsStore = getLocationsStore();
  const fullscreenMapStore = getFullscreenMapStore();
  const agentMode = useAgentMode();
  let lastDocId: string | null = null;
  let lastMapId: string | null | undefined = undefined;

  // Initialize collaboration when docId changes (using on() for explicit dependency)
  createEffect(on(
    () => params.docId,
    (docId) => {
      if (docId && docId !== lastDocId) {
        console.log('[DocumentLayout] Document changed:', docId);
        lastDocId = docId;

        // Update document store
        documentStore.setDocument(docId);

        // Destroy previous connection and init new one
        collaboration.destroy();
        collaboration.initDocument(docId);
      }
    }
  ));

  // Handle fullscreen map based on mapId route param (using on() for explicit dependency)
  createEffect(on(
    () => params.mapId,
    (mapId) => {
      // Skip if mapId hasn't actually changed
      if (mapId === lastMapId) return;
      lastMapId = mapId;

      console.log('[DocumentLayout] MapId changed:', mapId);

      if (mapId) {
        // Find the map element with this docPos and open fullscreen
        const openFullscreen = () => {
          const mapElement = document.querySelector(
            `.prosemirror-map[data-doc-pos="${mapId}"]`
          ) as HTMLElement & { _mapInstance?: any };

          if (mapElement) {
            // Only open if not already open
            if (!fullscreenMapStore.state().isVisible) {
              console.log('[DocumentLayout] Opening fullscreen map:', mapId, 'hasMapInstance:', !!mapElement._mapInstance);
              fullscreenMapStore.showFullscreenMap(mapElement);
            }
            return true;
          }
          return false;
        };

        // Try immediately
        if (!openFullscreen()) {
          console.log('[DocumentLayout] Map element not found yet for:', mapId);
          // Map might not be rendered yet, try again after a short delay
          setTimeout(() => {
            if (!fullscreenMapStore.state().isVisible) {
              if (!openFullscreen()) {
                console.log('[DocumentLayout] Retry failed for:', mapId);
              }
            }
          }, 500);
        }
      } else {
        // No mapId - close fullscreen if open
        if (fullscreenMapStore.state().isVisible) {
          console.log('[DocumentLayout] Closing fullscreen map');
          fullscreenMapStore.hideFullscreenMap();
        }
      }
    },
    { defer: true } // Don't run on initial mount, wait for actual navigation
  ));

  // Cleanup on unmount
  onCleanup(() => {
    collaboration.destroy();
  });

  return (
    <>
      <Show when={collaboration.state().yDoc && collaboration.state().provider}>
        <Editor />
      </Show>

      {/* Map viewer overlay - shows rectangles for users viewing fullscreen maps */}
      <MapViewerOverlay />

      {/* Fullscreen map overlay - shows based on route */}
      <FullscreenMap locations={locationsStore.state.locations} />

      {/* Global invitation modal */}
      <InvitationModal />

      {/* Agent mode overlay - shows when ?agent=true */}
      <Show when={agentMode.isAgent()}>
        <AgentOverlay agentId={agentMode.agentId()} state={agentMode.state()} />
      </Show>
    </>
  );
};

// Home component - no document selected
export const Home: Component = () => {
  const navigate = useNavigate();
  const documentStore = getDocumentStore();

  const handleNewDocument = () => {
    const newDocId = documentStore.createDocument();
    navigate(`/${newDocId}`);
  };

  // Check for existing doc in session storage
  createEffect(() => {
    const sessionDocId = sessionStorage.getItem('currentDocId');
    if (sessionDocId) {
      navigate(`/${sessionDocId}`);
    }
  });

  return (
    <div class={styles.emptyState}>
      <h2>No document selected</h2>
      <p>Create a new document to get started</p>
      <button class={styles.createButton} onClick={handleNewDocument}>
        Create First Document
      </button>
    </div>
  );
};

// Root layout component - renders Header and route content
const App: Component<RouteSectionProps> = (props) => {
  const navigate = useNavigate();
  const documentStore = getDocumentStore();

  const handleNewDocument = () => {
    const newDocId = documentStore.createDocument();
    navigate(`/${newDocId}`);
  };

  return (
    <div class={styles.app}>
      <Header onNewDocument={handleNewDocument} />
      {props.children}
    </div>
  );
};

export default App;

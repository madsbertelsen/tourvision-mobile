import { createSignal, onMount, onCleanup, type Accessor } from 'solid-js';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo, undoDepth, redoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, setBlockType } from 'prosemirror-commands';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { customSchema } from '../../lib/prosemirror-schema';
import { geocodeLocation } from '../../lib/geocoding';
import { createMapNodeView } from '../../lib/mapNodeView';

// Global counter for color cycling
let geoMarkColorIndex = 0;

export interface UseEditorOptions {
  yDoc: Accessor<Y.Doc | null>;
  provider: Accessor<WebsocketProvider | null>;
  onUpdate?: (view: EditorView) => void;
}

export function useEditor(containerAccessor: Accessor<HTMLElement | undefined>, options: UseEditorOptions) {
  const [editorView, setEditorView] = createSignal<EditorView | null>(null);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [hasSelection, setHasSelection] = createSignal(false);
  const [isAddingGeoMark, setIsAddingGeoMark] = createSignal(false);

  onMount(() => {
    const container = containerAccessor();
    if (!container) {
      console.error('[Editor] Container element not available');
      return;
    }

    const yDoc = options.yDoc();
    const provider = options.provider();

    if (!yDoc || !provider) {
      console.error('[Editor] Y.Doc or provider not available');
      return;
    }

    console.log('[Editor] Initializing ProseMirror');

    // Get Y.js XML fragment
    const yXmlFragment = yDoc.getXmlFragment('prosemirror');

    // Build cursor builder for collaborative cursors
    const cursorBuilder = (user: any) => {
      const cursor = document.createElement('span');
      cursor.classList.add('ProseMirror-yjs-cursor');
      cursor.style.borderColor = user.color || '#000';
      cursor.style.borderLeftWidth = '2px';
      cursor.style.borderLeftStyle = 'solid';

      const userLabel = document.createElement('div');
      userLabel.classList.add('ProseMirror-yjs-cursor-label');
      userLabel.style.backgroundColor = user.color || '#000';
      userLabel.textContent = user.name || 'Anonymous';
      userLabel.style.transition = 'all 0.2s ease';

      cursor.appendChild(userLabel);
      return cursor;
    };

    // Build selection builder for highlighted selections
    const selectionBuilder = (user: any) => {
      const selection = document.createElement('span');
      selection.classList.add('ProseMirror-yjs-selection');
      selection.style.backgroundColor = user.color || '#000';
      selection.style.opacity = '0.25';
      return selection;
    };

    // Create editor state
    const state = EditorState.create({
      schema: customSchema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(provider.awareness, {
          cursorBuilder,
          selectionBuilder,
          getSelection: (state) => state.selection
        }),
        yUndoPlugin(),
        history(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo }),
        keymap(baseKeymap)
      ]
    });

    // Create editor view
    const view = new EditorView(container, {
      state,
      nodeViews: {
        map: (node, view, getPos) => createMapNodeView(node, view, getPos as () => number | undefined)
      },
      dispatchTransaction(tr) {
        const newState = this.state.apply(tr);
        this.updateState(newState);

        // Update undo/redo state
        setCanUndo(undoDepth(newState) > 0);
        setCanRedo(redoDepth(newState) > 0);

        // Update selection state
        setHasSelection(!newState.selection.empty);

        // Trigger map updates if document changed
        if (tr.docChanged) {
          if (window.mapRenderCallbacks) {
            window.mapRenderCallbacks.forEach(callback => {
              try {
                callback();
              } catch (error) {
                console.error('[Editor] Error in map render callback:', error);
              }
            });
          }

          // Notify parent of changes
          if (options.onUpdate) {
            options.onUpdate(this);
          }
        }
      }
    });

    setEditorView(view);
    console.log('[Editor] ProseMirror initialized');
  });

  onCleanup(() => {
    const view = editorView();
    if (view) {
      console.log('[Editor] Destroying ProseMirror');
      view.destroy();
    }
  });

  // Insert map node
  function insertMap() {
    const view = editorView();
    if (!view) return;

    const { state } = view;
    const { schema, tr } = state;

    const mapNode = schema.nodes.map.create({ height: 400 });
    const paragraphNode = schema.nodes.paragraph.create();
    const insertPos = state.doc.content.size;

    // Insert both map and a new paragraph after it
    const transaction = tr.insert(insertPos, [mapNode, paragraphNode]);

    view.dispatch(transaction);
    console.log('[Editor] Inserted map and paragraph at position', insertPos);
  }

  // Execute undo
  function executeUndo() {
    const view = editorView();
    if (view) {
      undo(view.state, view.dispatch);
    }
  }

  // Execute redo
  function executeRedo() {
    const view = editorView();
    if (view) {
      redo(view.state, view.dispatch);
    }
  }

  // Add geo mark to selected text
  async function addGeoMarkToSelection() {
    const view = editorView();
    if (!view) {
      console.error('[Editor] No editor view available');
      return;
    }

    const { state } = view;
    const { from, to, empty } = state.selection;

    if (empty) {
      console.warn('[Editor] No text selected');
      return;
    }

    // Get selected text
    const selectedText = state.doc.textBetween(from, to);
    console.log('[Editor] Creating geo mark for:', selectedText);

    setIsAddingGeoMark(true);

    try {
      // Geocode the selected text
      const result = await geocodeLocation(selectedText);

      if (!result) {
        console.error('[Editor] Geocoding failed for:', selectedText);
        alert(`Could not find location: ${selectedText}`);
        return;
      }

      console.log('[Editor] Geocoding result:', result);

      // Create unique ID for this geo mark
      const geoId = `geo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create the geo mark with attributes
      const markType = state.schema.marks.geoMark;
      const mark = markType.create({
        geoId,
        displayText: selectedText,
        placeName: result.displayName,
        lat: result.lat.toString(),
        lng: result.lng.toString(),
        colorIndex: geoMarkColorIndex++,
        coordSource: 'nominatim'
      });

      // Apply the mark to the selection
      const tr = state.tr.addMark(from, to, mark);
      view.dispatch(tr);

      console.log('[Editor] Geo mark created:', {
        geoId,
        text: selectedText,
        place: result.displayName,
        colorIndex: (geoMarkColorIndex - 1) % 10
      });

      // Notify parent of update
      if (options.onUpdate) {
        options.onUpdate(view);
      }
    } catch (error) {
      console.error('[Editor] Error creating geo mark:', error);
      alert('An error occurred while creating the location mark');
    } finally {
      setIsAddingGeoMark(false);
    }
  }

  // Set heading level for current selection/block
  function applyHeading(level: number) {
    const view = editorView();
    if (!view) return;

    const { state } = view;
    const { schema } = state;

    // Use setBlockType command to convert current block to heading
    const command = setBlockType(schema.nodes.heading, { level });
    command(state, view.dispatch);

    console.log('[Editor] Applied heading level', level);
  }

  return {
    editorView,
    canUndo,
    canRedo,
    hasSelection,
    isAddingGeoMark,
    insertMap,
    executeUndo,
    executeRedo,
    addGeoMarkToSelection,
    applyHeading
  };
}

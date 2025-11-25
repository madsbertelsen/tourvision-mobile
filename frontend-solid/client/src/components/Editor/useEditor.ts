import { createSignal, onMount, onCleanup, type Accessor } from 'solid-js';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo, undoDepth, redoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { customSchema } from '../../lib/prosemirror-schema';

export interface UseEditorOptions {
  yDoc: Accessor<Y.Doc | null>;
  provider: Accessor<WebsocketProvider | null>;
  onUpdate?: (view: EditorView) => void;
}

export function useEditor(containerAccessor: Accessor<HTMLElement | undefined>, options: UseEditorOptions) {
  const [editorView, setEditorView] = createSignal<EditorView | null>(null);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);

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
      dispatchTransaction(tr) {
        const newState = this.state.apply(tr);
        this.updateState(newState);

        // Update undo/redo state
        setCanUndo(undoDepth(newState) > 0);
        setCanRedo(redoDepth(newState) > 0);

        // Notify parent of changes
        if (tr.docChanged && options.onUpdate) {
          options.onUpdate(this);
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
    const insertPos = state.doc.content.size;
    const transaction = tr.insert(insertPos, mapNode);

    view.dispatch(transaction);
    console.log('[Editor] Inserted map at position', insertPos);
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

  return {
    editorView,
    canUndo,
    canRedo,
    insertMap,
    executeUndo,
    executeRedo
  };
}

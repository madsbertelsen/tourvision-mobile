import { type Component, createEffect, on } from 'solid-js';
import { useEditor } from './useEditor';
import { getCollaborationStore } from '../../stores/collaboration';
import { getLocationsStore } from '../../stores/locations';
import styles from './editor.module.scss';

export const Editor: Component = () => {
  let editorContainer: HTMLDivElement | undefined;
  const collaboration = getCollaborationStore();
  const locations = getLocationsStore();

  const editor = useEditor(
    () => editorContainer,
    {
      yDoc: () => collaboration.state().yDoc,
      provider: () => collaboration.state().provider,
      onUpdate: (view) => {
        // Update locations when document changes
        locations.updateLocations(view);
      }
    }
  );

  // Initial location extraction after editor is ready
  createEffect(
    on(
      () => editor.editorView(),
      (view) => {
        if (view) {
          setTimeout(() => {
            locations.updateLocations(view);
          }, 500);
        }
      }
    )
  );

  return (
    <div class={styles.editorWrapper}>
      <div ref={editorContainer} class={styles.editor} />
    </div>
  );
};

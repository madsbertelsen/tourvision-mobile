import { type Component, type Accessor, Show } from 'solid-js';
import styles from './toolbar.module.scss';

export interface ToolbarProps {
  hasSelection: Accessor<boolean>;
  isAddingGeoMark: Accessor<boolean>;
  onAddGeoMark: () => Promise<void>;
  onInsertMap: () => void;
}

export const Toolbar: Component<ToolbarProps> = (props) => {
  return (
    <div class={styles.toolbar}>
      <button
        class={styles.button}
        classList={{
          [styles.disabled]: !props.hasSelection() || props.isAddingGeoMark()
        }}
        onClick={() => props.onAddGeoMark()}
        disabled={!props.hasSelection() || props.isAddingGeoMark()}
        title="Mark selected text as a location"
      >
        <Show
          when={!props.isAddingGeoMark()}
          fallback={
            <span class={styles.loading}>
              <span class={styles.spinner} />
              Geocoding...
            </span>
          }
        >
          <span class={styles.icon}>📍</span>
          <span>Mark as Location</span>
        </Show>
      </button>

      <button
        class={styles.mapButton}
        onClick={() => props.onInsertMap()}
        title="Insert a map block"
      >
        <span class={styles.icon}>🗺️</span>
        <span>Insert Map</span>
      </button>
    </div>
  );
};

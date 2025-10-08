'use dom';

import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ProseMirror } from '@nytimes/react-prosemirror';
import { EditorState, Plugin } from 'prosemirror-state';
import { Schema, Node as ProseMirrorNode, DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import { schema } from '@/utils/prosemirror-schema';
import { createGeoMarkFromSelection } from '@/utils/prosemirror-transactions';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import './prosemirror-viewer-styles.css';

interface ProseMirrorViewerProps {
  content?: any; // ProseMirror JSON document
  onNodeFocus?: (nodeId: string | null) => void;
  focusedNodeId?: string | null;
  editable?: boolean;
  onChange?: (doc: any) => void;
}

export interface ProseMirrorViewerRef {
  scrollToNode: (nodeId: string) => void;
  getState: () => EditorState;
}

// Geo-mark editor modal component
function GeoMarkEditor({ node, onSave, onCancel }: {
  node: ProseMirrorNode;
  onSave: (attrs: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = React.useState({
    placeName: node.attrs.placeName || '',
    lat: node.attrs.lat || '',
    lng: node.attrs.lng || '',
    transportFrom: node.attrs.transportFrom || '',
    transportProfile: node.attrs.transportProfile || 'walking',
    description: node.attrs.description || '',
    colorIndex: node.attrs.colorIndex || 0
  });

  const colors = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="geo-mark-editor-overlay" onClick={onCancel}>
      <div className="geo-mark-editor-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Location</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Place Name</label>
            <input
              type="text"
              value={formData.placeName}
              onChange={(e) => setFormData({ ...formData, placeName: e.target.value })}
              placeholder="e.g. Eiffel Tower"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Latitude</label>
              <input
                type="text"
                value={formData.lat}
                onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                placeholder="48.8584"
              />
            </div>
            <div className="form-group">
              <label>Longitude</label>
              <input
                type="text"
                value={formData.lng}
                onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                placeholder="2.2945"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Transportation Mode</label>
            <select
              value={formData.transportProfile}
              onChange={(e) => setFormData({ ...formData, transportProfile: e.target.value })}
            >
              <option value="">None</option>
              <option value="walking">🚶 Walking</option>
              <option value="driving">🚗 Driving</option>
              <option value="cycling">🚴 Cycling</option>
              <option value="transit">🚇 Public Transit</option>
            </select>
          </div>

          {formData.transportProfile && (
            <div className="form-group">
              <label>Coming from</label>
              <input
                type="text"
                value={formData.transportFrom}
                onChange={(e) => setFormData({ ...formData, transportFrom: e.target.value })}
                placeholder="Previous location ID"
              />
            </div>
          )}

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {colors.map((color, index) => (
                <button
                  key={index}
                  type="button"
                  className={`color-option ${formData.colorIndex === index ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, colorIndex: index })}
                />
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ProseMirrorViewer = forwardRef<ProseMirrorViewerRef, ProseMirrorViewerProps>((
  {
    content,
    onNodeFocus,
    focusedNodeId,
    editable = false,
    onChange
  },
  ref
) => {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [editingGeoMark, setEditingGeoMark] = useState<{ pos: number; node: ProseMirrorNode } | null>(null);
  const [viewRef, setViewRef] = useState<any>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);
  const [creatingNewGeoMark, setCreatingNewGeoMark] = useState(false);

  // Convert JSON content to ProseMirror document
  const initialDoc = useMemo(() => {
    if (!content) {
      return schema.node('doc', null, [
        schema.node('paragraph', { id: 'empty-1' }, [])
      ]);
    }

    try {
      // If it's already a ProseMirror Node, use it directly
      if (content._type) {
        return content;
      }

      // Otherwise parse from JSON
      return schema.nodeFromJSON(content);
    } catch (error) {
      console.error('Error parsing ProseMirror content:', error);
      return schema.node('doc', null, [
        schema.node('paragraph', { id: 'error-1' }, [schema.text('Error loading content')])
      ]);
    }
  }, [content]);

  // Create editor state with proper state management
  const [state, setState] = useState(() => {
    return EditorState.create({
      doc: initialDoc,
      schema,
      plugins: [
        keymap(baseKeymap)
      ]
    });
  });

  // Update state when content changes externally
  useEffect(() => {
    if (!content) return;

    try {
      const newDoc = content._type ? content : schema.nodeFromJSON(content);
      // Update the state with new content
      setState(EditorState.create({
        doc: newDoc,
        schema,
        plugins: [
          keymap(baseKeymap)
        ],
        selection: state.selection // Preserve selection if possible
      }));
    } catch (error) {
      console.error('Error updating content:', error);
    }
  }, [content]);

  // Handle transactions when editing
  const dispatchTransaction = (tr: any) => {
    setState(prevState => {
      const newState = prevState.apply(tr);
      // Notify parent of document changes
      if (onChange && tr.docChanged) {
        onChange(newState.doc.toJSON());
      }

      // Track selection for toolbar positioning
      if (editable && !newState.selection.empty) {
        // Get the DOM coordinates for the selection
        setTimeout(() => {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            setToolbarPosition({
              top: rect.top - 50, // 50px above selection
              left: rect.left + (rect.width / 2) - 75 // Center horizontally (150px width / 2)
            });
            setShowToolbar(true);
          }
        }, 0);
      } else {
        // Hide toolbar when selection is empty
        setShowToolbar(false);
      }

      return newState;
    });
  };

  // Handle scroll-based focus detection
  useEffect(() => {
    if (!container || !mount) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const threshold = 150; // pixels from top

      let focusedId: string | null = null;
      let minDistance = Infinity;

      // Find the node closest to the threshold
      state.doc.descendants((node, pos) => {
        if (node.attrs?.id) {
          // Find the DOM element for this node
          const domNode = mount.querySelector(`[data-node-id="${node.attrs.id}"]`);
          if (domNode) {
            const rect = domNode.getBoundingClientRect();
            const distance = Math.abs((rect.top - containerRect.top) - threshold);

            if (distance < minDistance && rect.top - containerRect.top <= threshold && rect.bottom - containerRect.top > threshold) {
              minDistance = distance;
              focusedId = node.attrs.id;
            }
          }
        }
      });

      if (onNodeFocus && focusedId !== focusedNodeId) {
        onNodeFocus(focusedId);
      }
    };

    // Attach listener to the scrolling container
    container.addEventListener('scroll', handleScroll);

    // Call once on mount to set initial focus
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [container, mount, state, onNodeFocus, focusedNodeId]);

  // Apply focus styling based on focusedNodeId
  useEffect(() => {
    if (!mount || !focusedNodeId) return;

    // Remove all focus classes
    mount.querySelectorAll('.pm-node-focused').forEach(el => {
      el.classList.remove('pm-node-focused');
    });

    // Add focus class to the focused node
    const focusedElement = mount.querySelector(`[data-node-id="${focusedNodeId}"]`);
    if (focusedElement) {
      focusedElement.classList.add('pm-node-focused');
    }
  }, [mount, focusedNodeId]);

  // Scroll to a specific node
  const scrollToNode = (nodeId: string) => {
    if (!mount || !container) return;

    const element = mount.querySelector(`[data-node-id="${nodeId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Get current state
  const getState = () => state;

  // Handle geo-mark updates
  const handleGeoMarkUpdate = (updatedAttrs: any) => {
    if (!editingGeoMark || !viewRef) return;

    const { pos, node } = editingGeoMark;
    const tr = viewRef.state.tr;

    // Update the node attributes
    tr.setNodeMarkup(pos, null, { ...node.attrs, ...updatedAttrs });

    // Dispatch the transaction
    viewRef.dispatch(tr);

    // Close editor
    setEditingGeoMark(null);
    setCreatingNewGeoMark(false);
  };

  // Handle creating a new geo-mark from selection
  const handleCreateGeoMark = () => {
    if (!viewRef || !state.selection) return;

    // Get the selected text to use as initial placeName
    const { from, to } = state.selection;
    const selectedText = state.doc.textBetween(from, to, ' ');

    // Create geo-mark with initial attributes
    const newState = createGeoMarkFromSelection(state, {
      placeName: selectedText,
      colorIndex: 0, // Will be customizable in modal
    });

    if (!newState) return;

    // Apply the state change
    setState(newState);
    onChange?.(newState.doc.toJSON());

    // Hide toolbar
    setShowToolbar(false);

    // Find the newly created geo-mark and open editor
    // The geo-mark should be at the same position as the selection
    const geoMarkNode = newState.doc.nodeAt(from);
    if (geoMarkNode && geoMarkNode.type === schema.nodes.geoMark) {
      setEditingGeoMark({ pos: from, node: geoMarkNode });
      setViewRef(viewRef);
      setCreatingNewGeoMark(true);
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    scrollToNode,
    getState
  }));

  // Custom node views to add data attributes
  const nodeViews = useMemo(() => {
    const views: any = {};

    // Add data-node-id to all block nodes
    ['paragraph', 'heading', 'blockquote'].forEach(nodeType => {
      views[nodeType] = (node: ProseMirrorNode) => {
        const dom = document.createElement(
          nodeType === 'heading' ? `h${node.attrs.level || 2}` :
          nodeType === 'blockquote' ? 'blockquote' : 'p'
        );

        if (node.attrs?.id) {
          dom.setAttribute('data-node-id', node.attrs.id);
        }

        // Add classes for styling
        dom.className = `pm-${nodeType}`;

        return { dom, contentDOM: dom };
      };
    });

    // Custom rendering for geo-marks
    views['geoMark'] = (node: ProseMirrorNode, view: any, getPos: any) => {
      const span = document.createElement('span');
      span.className = 'pm-geo-mark';

      if (node.attrs?.geoId) {
        span.setAttribute('data-geo-id', node.attrs.geoId);
      }

      // Color assignment based on attributes
      const colorIndex = node.attrs?.colorIndex || 0;
      const colors = [
        '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
      ];
      span.style.backgroundColor = `${colors[colorIndex % colors.length]}33`;

      span.title = node.attrs?.placeName || 'Location';

      // Make clickable in edit mode
      if (editable) {
        span.style.cursor = 'pointer';
        span.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pos = getPos();
          setEditingGeoMark({ pos, node });
          setViewRef(view);
        };
      }

      return { dom: span, contentDOM: span };
    };

    return views;
  }, [editable]);

  return (
    <div ref={setContainer} className="prosemirror-viewer-container">
      <ProseMirror
        mount={mount}
        state={state}
        dispatchTransaction={editable ? dispatchTransaction : undefined}
        nodeViews={nodeViews}
        editable={() => editable}
      >
        <div
          ref={setMount}
          className="prosemirror-viewer"
        />
      </ProseMirror>

      {/* Floating toolbar for adding geo-marks */}
      {showToolbar && toolbarPosition && editable && (
        <div
          className="geo-mark-toolbar"
          style={{
            position: 'fixed',
            top: `${toolbarPosition.top}px`,
            left: `${toolbarPosition.left}px`,
            zIndex: 9999,
          }}
        >
          <button
            className="geo-mark-toolbar-button"
            onClick={handleCreateGeoMark}
            title="Add Location Marker"
          >
            📍 Add Location
          </button>
        </div>
      )}

      {/* Geo-mark editor modal */}
      {editingGeoMark && (
        <GeoMarkEditor
          node={editingGeoMark.node}
          onSave={handleGeoMarkUpdate}
          onCancel={() => {
            setEditingGeoMark(null);
            setCreatingNewGeoMark(false);
          }}
        />
      )}
    </div>
  );
});

ProseMirrorViewer.displayName = 'ProseMirrorViewer';

export default ProseMirrorViewer;
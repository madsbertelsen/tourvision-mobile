'use dom';

import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  onMessage?: (event: any) => void;
  onShowGeoMarkEditor?: (data: any, locations: any[]) => void;
  geoMarkDataToCreate?: any; // Trigger geo-mark creation when this changes
}

export interface ProseMirrorViewerRef {
  scrollToNode: (nodeId: string) => void;
  getState: () => EditorState;
  createGeoMarkWithData: (geoMarkData: any) => void;
}

// Geo-mark editor modal component
function GeoMarkEditor({ node, onSave, onCancel, editorState }: {
  node: ProseMirrorNode;
  onSave: (attrs: any) => void;
  onCancel: () => void;
  editorState: EditorState;
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

  const [suggestions, setSuggestions] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Collect existing geo-marks from document
  const existingLocations = React.useMemo(() => {
    const locations: Array<{ geoId: string; placeName: string }> = [];
    editorState.doc.descendants((node) => {
      if (node.type.name === 'geoMark' && node.attrs.geoId && node.attrs.placeName) {
        locations.push({
          geoId: node.attrs.geoId,
          placeName: node.attrs.placeName,
        });
      }
    });
    return locations;
  }, [editorState]);

  // Fetch location suggestions from Nominatim on mount
  React.useEffect(() => {
    const searchQuery = node.attrs.placeName;
    if (!searchQuery || searchQuery.trim().length < 2) {
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&limit=5`,
          {
            headers: {
              'User-Agent': 'TourVision-App' // Nominatim requires a user agent
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch location suggestions');
        }

        const data = await response.json();
        setSuggestions(data);
      } catch (err) {
        console.error('Error fetching Nominatim suggestions:', err);
        setError('Unable to fetch location suggestions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, []); // Only run on mount

  const colors = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  const handleSuggestionClick = (suggestion: any) => {
    setFormData({
      ...formData,
      placeName: suggestion.display_name,
      lat: suggestion.lat,
      lng: suggestion.lon
    });
  };

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

            {/* Location suggestions from Nominatim */}
            {isLoading && (
              <div className="suggestions-loading">
                Searching for locations...
              </div>
            )}

            {error && (
              <div className="suggestions-error">
                {error}
              </div>
            )}

            {!isLoading && !error && suggestions.length > 0 && (
              <div className="suggestions-list">
                <div className="suggestions-header">Select a location:</div>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.place_id || index}
                    className="suggestion-item"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <div className="suggestion-name">{suggestion.display_name}</div>
                    <div className="suggestion-coords">
                      {parseFloat(suggestion.lat).toFixed(4)}, {parseFloat(suggestion.lon).toFixed(4)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && !error && suggestions.length === 0 && formData.placeName && (
              <div className="suggestions-empty">
                No locations found. Please enter coordinates manually.
              </div>
            )}
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
              <select
                value={formData.transportFrom || ''}
                onChange={(e) => setFormData({ ...formData, transportFrom: e.target.value })}
              >
                <option value="">Select previous location...</option>
                {existingLocations.map((loc) => (
                  <option key={loc.geoId} value={loc.geoId}>
                    {loc.placeName}
                  </option>
                ))}
              </select>
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

// Extend window interface for React Native WebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

const ProseMirrorViewer = forwardRef<ProseMirrorViewerRef, ProseMirrorViewerProps>((
  {
    content,
    onNodeFocus,
    focusedNodeId,
    editable = false,
    onChange,
    onMessage,
    onShowGeoMarkEditor,
    geoMarkDataToCreate
  },
  ref
) => {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [editingGeoMark, setEditingGeoMark] = useState<{ pos: number; node: ProseMirrorNode } | null>(null);
  const [viewRef, setViewRef] = useState<any>(null);
  const [pendingSelection, setPendingSelection] = useState<{ from: number; to: number } | null>(null);

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

  // Optional: Log container size changes for debugging (without causing re-renders)
  useEffect(() => {
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height } = entry.contentRect;
        // Just log for debugging, don't update state to avoid loops
        console.log('[ProseMirror] Container resized to', Math.round(height), 'px');
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [container]);

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
    if (!editingGeoMark) return;

    console.log('[GeoMarkEditor] Saving geo-mark with attrs:', updatedAttrs);
    const { pos, node } = editingGeoMark;

    // Create transaction to update node attributes
    const tr = state.tr;
    tr.setNodeMarkup(pos, null, { ...node.attrs, ...updatedAttrs });

    // Apply the transaction
    const newState = state.apply(tr);
    setState(newState);

    console.log('[GeoMarkEditor] New state created, calling onChange');

    // Notify parent of changes
    if (onChange) {
      onChange(newState.doc.toJSON());
    } else {
      console.warn('[GeoMarkEditor] No onChange callback provided!');
    }

    // Close editor
    setEditingGeoMark(null);
  };

  // Handle creating a new geo-mark from selection
  const handleCreateGeoMark = () => {
    if (!state.selection) return;

    // Get the selected text to use as initial placeName
    const { from, to } = state.selection;
    const selectedText = state.doc.textBetween(from, to, ' ');

    // Save pending selection for when we receive save message
    setPendingSelection({ from, to });

    // Count existing geo-marks to determine next color
    let geoMarkCount = 0;
    const existingLocations: Array<{ geoId: string; placeName: string }> = [];

    state.doc.descendants((node) => {
      if (node.type.name === 'geoMark') {
        geoMarkCount++;
        if (node.attrs.geoId && node.attrs.placeName) {
          existingLocations.push({
            geoId: node.attrs.geoId,
            placeName: node.attrs.placeName,
          });
        }
      }
    });

    // Cycle through colors (10 colors available)
    const nextColorIndex = geoMarkCount % 10;

    // Call the callback prop to show bottom sheet
    console.log('[ProseMirror] handleCreateGeoMark called, selectedText:', selectedText);
    console.log('[ProseMirror] onShowGeoMarkEditor available?', !!onShowGeoMarkEditor);

    if (onShowGeoMarkEditor) {
      const data = {
        placeName: selectedText,
        colorIndex: nextColorIndex,
      };
      console.log('[ProseMirror] Calling onShowGeoMarkEditor with data:', data);
      onShowGeoMarkEditor(data, existingLocations);
    } else {
      console.error('[ProseMirror] onShowGeoMarkEditor callback not provided!');
    }
  };

  // Create geo-mark with data from bottom sheet
  const createGeoMarkWithData = useCallback((geoMarkData: any) => {
    console.log('[ProseMirror] Creating geo-mark with data:', geoMarkData);

    if (!pendingSelection || !state) {
      console.error('[ProseMirror] No pending selection or state');
      return;
    }

    // Create geo-mark with the provided data
    const newState = createGeoMarkFromSelection(state, geoMarkData);

    if (newState) {
      setState(newState);
      onChange?.(newState.doc.toJSON());
      console.log('[ProseMirror] Geo-mark created successfully');
    }

    // Clear pending selection
    setPendingSelection(null);
  }, [state, pendingSelection, onChange]);

  // Watch for geo-mark data prop changes to trigger creation
  useEffect(() => {
    if (geoMarkDataToCreate) {
      console.log('[ProseMirror] geoMarkDataToCreate prop changed, creating geo-mark');
      createGeoMarkWithData(geoMarkDataToCreate);
    }
  }, [geoMarkDataToCreate, createGeoMarkWithData]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    scrollToNode,
    getState,
    createGeoMarkWithData
  }), [createGeoMarkWithData]);

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

  // Toolbar command handlers
  const toggleBold = () => {
    // TODO: Implement bold toggle
  };

  const toggleItalic = () => {
    // TODO: Implement italic toggle
  };

  return (
    <div className={`prosemirror-editor-wrapper ${editable ? 'edit-mode' : ''}`} style={{ height: '100%' }}>
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

      </div>

      {/* Toolbar - positioned at bottom after content */}
      {editable && (
        <div className="prosemirror-toolbar">
          {/* Text formatting */}
          <div className="toolbar-group">
            <button className="toolbar-button" onClick={toggleBold} title="Bold">
              <strong>B</strong>
            </button>
            <button className="toolbar-button" onClick={toggleItalic} title="Italic">
              <em>I</em>
            </button>
            <button className="toolbar-button" title="Strikethrough">
              <s>S</s>
            </button>
            <button className="toolbar-button" title="Code">
              <code>&lt;/&gt;</code>
            </button>
            <button className="toolbar-button" title="Underline">
              <u>U</u>
            </button>
          </div>

          <div className="toolbar-divider"></div>

          {/* Lists */}
          <div className="toolbar-group">
            <button className="toolbar-button" title="Bullet list">
              ☰
            </button>
            <button className="toolbar-button" title="Numbered list">
              1.
            </button>
          </div>

          <div className="toolbar-divider"></div>

          {/* Geo-mark */}
          <div className="toolbar-group">
            <button
              className="toolbar-button"
              onClick={handleCreateGeoMark}
              disabled={state.selection.empty}
              title="Add location marker"
            >
              📍
            </button>
          </div>

          <div className="toolbar-divider"></div>

          {/* Link */}
          <div className="toolbar-group">
            <button className="toolbar-button" title="Add link">
              🔗
            </button>
          </div>
        </div>
      )}

      {/* Geo-mark editor modal - rendered via portal to appear above everything */}
      {editingGeoMark && createPortal(
        <GeoMarkEditor
          node={editingGeoMark.node}
          onSave={handleGeoMarkUpdate}
          onCancel={() => setEditingGeoMark(null)}
          editorState={state}
        />,
        document.body
      )}
    </div>
  );
});

ProseMirrorViewer.displayName = 'ProseMirrorViewer';

export default ProseMirrorViewer;
'use dom';

import React, { useState, useMemo, forwardRef, useImperativeHandle, useEffect } from 'react';
import { ProseMirror } from '@nytimes/react-prosemirror';
import { EditorState, Plugin, PluginKey, Transaction, Command, TextSelection } from 'prosemirror-state';
import { Schema, Node, DOMSerializer, DOMParser as ProseMirrorDOMParser, Mark } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { history } from 'prosemirror-history';
import { MapView } from './map-view';
import { TransportationModal } from './TransportationModal';
import { SelectionToolbar } from './SelectionToolbar';
import './test-prosemirror-styles.css';

// Location interface for map markers
interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

// Note: Color assignment is now done in the API when generating geo marks
// We preserve the color indices from the HTML attributes

// Create custom schema with geolocation mark
const createSchemaWithGeoMark = () => {
  // Get existing marks from basic schema
  const existingMarks: any = {};
  basicSchema.spec.marks.forEach((markName, markSpec) => {
    existingMarks[markName] = markSpec;
  });

  // Add geo mark
  const marks = {
    ...existingMarks,
    geo: {
      attrs: {
        lat: { default: null },
        lng: { default: null },
        placeName: { default: null },
        placeId: { default: null },
        colorIndex: { default: 0 },
        // Incoming transportation information
        transportFromId: { default: null },
        transportMode: { default: null },
        transportDuration: { default: null },
        transportCostAmount: { default: null },
        transportCostCurrency: { default: null },
        transportNotes: { default: null },
        transportWaypoints: { default: null }  // JSON string of waypoints array
      },
      parseDOM: [{
        tag: 'span[data-geo]',
        getAttrs(dom: any) {
          return {
            lat: parseFloat(dom.getAttribute('data-lat')) || null,
            lng: parseFloat(dom.getAttribute('data-lng')) || null,
            placeName: dom.getAttribute('data-place-name') || null,
            placeId: dom.getAttribute('data-place-id') || null,
            colorIndex: parseInt(dom.getAttribute('data-color-index') || dom.getAttribute('data-location-index') || '0', 10),
            // Parse incoming transportation
            transportFromId: dom.getAttribute('data-transport-from-id') || null,
            transportMode: dom.getAttribute('data-transport-mode') || null,
            transportDuration: dom.getAttribute('data-transport-duration') || null,
            transportCostAmount: dom.getAttribute('data-transport-cost-amount') ? parseFloat(dom.getAttribute('data-transport-cost-amount')) : null,
            transportCostCurrency: dom.getAttribute('data-transport-cost-currency') || null,
            transportNotes: dom.getAttribute('data-transport-notes') || null,
            transportWaypoints: dom.getAttribute('data-transport-waypoints') || null
          };
        }
      }],
      toDOM(mark: Mark) {
        const attrs: any = {
          'class': 'geo-mark',
          'data-geo': 'true',
          'data-lat': mark.attrs.lat,
          'data-lng': mark.attrs.lng,
          'data-color-index': mark.attrs.colorIndex,
          'data-location-index': mark.attrs.colorIndex // For CSS styling
        };
        if (mark.attrs.placeName) attrs['data-place-name'] = mark.attrs.placeName;
        if (mark.attrs.placeId) attrs['data-place-id'] = mark.attrs.placeId;

        // Add transportation attributes if present
        if (mark.attrs.transportFromId) attrs['data-transport-from-id'] = mark.attrs.transportFromId;
        if (mark.attrs.transportMode) {
          attrs['data-transport-mode'] = mark.attrs.transportMode;
          attrs['class'] += ` has-transport transport-${mark.attrs.transportMode}`;
        }
        if (mark.attrs.transportDuration) attrs['data-transport-duration'] = mark.attrs.transportDuration;
        if (mark.attrs.transportCostAmount !== null) attrs['data-transport-cost-amount'] = mark.attrs.transportCostAmount;
        if (mark.attrs.transportCostCurrency) attrs['data-transport-cost-currency'] = mark.attrs.transportCostCurrency;
        if (mark.attrs.transportNotes) attrs['data-transport-notes'] = mark.attrs.transportNotes;
        if (mark.attrs.transportWaypoints) attrs['data-transport-waypoints'] = mark.attrs.transportWaypoints;

        attrs['title'] = mark.attrs.placeName || `Location ${mark.attrs.lat}, ${mark.attrs.lng}`;
        return ['span', attrs];
      }
    },
    pendingChange: {
      attrs: {
        comment: { default: '' },
        originalText: { default: '' },
        timestamp: { default: null }
      },
      parseDOM: [{
        tag: 'span[data-pending-change]',
        getAttrs(dom: any) {
          return {
            comment: dom.getAttribute('data-comment') || '',
            originalText: dom.getAttribute('data-original-text') || '',
            timestamp: dom.getAttribute('data-timestamp') || null
          };
        }
      }],
      toDOM(mark: Mark) {
        return ['span', {
          'class': 'pending-change',
          'data-pending-change': 'true',
          'data-comment': mark.attrs.comment,
          'data-original-text': mark.attrs.originalText,
          'data-timestamp': mark.attrs.timestamp,
          'title': `Suggested change: ${mark.attrs.comment}`
        }, 0];
      }
    }
  };

  return new Schema({
    nodes: basicSchema.spec.nodes,
    marks
  });
};

const geoSchema = createSchemaWithGeoMark();

// Create geo mark commands
const addGeoMark = (lat: number, lng: number, placeName?: string, placeId?: string, colorIndex?: number): Command => {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    if (from === to) return false; // No selection

    if (dispatch) {
      // If no color index provided, find the next available one
      if (colorIndex === undefined) {
        const usedIndices = new Set<number>();
        state.doc.descendants((node) => {
          node.marks.forEach(mark => {
            if (mark.type.name === 'geo' && mark.attrs.colorIndex !== undefined) {
              usedIndices.add(mark.attrs.colorIndex);
            }
          });
        });

        // Find the first available index (1-9)
        colorIndex = 1;
        while (usedIndices.has(colorIndex) && colorIndex <= 9) {
          colorIndex++;
        }
        colorIndex = colorIndex > 9 ? ((colorIndex - 1) % 9) + 1 : colorIndex;
      }

      const geoMark = geoSchema.marks.geo.create({ lat, lng, placeName, placeId, colorIndex });
      const tr = state.tr.addMark(from, to, geoMark);
      dispatch(tr);
    }
    return true;
  };
};

const removeGeoMark: Command = (state, dispatch) => {
  const { from, to } = state.selection;
  const geoMarkType = geoSchema.marks.geo;

  if (dispatch) {
    const tr = state.tr.removeMark(from, to, geoMarkType);
    dispatch(tr);
  }
  return true;
};

// Plugin key for diff visualization
const diffPluginKey = new PluginKey('diff');


// Create diff visualization plugin
const createDiffPlugin = () => {
  return new Plugin({
    key: diffPluginKey,
    state: {
      init() {
        return {
          decorations: DecorationSet.empty,
          originalDoc: null,
          proposedDoc: null,
          isPreview: false,
        };
      },
      apply(tr, pluginState) {
        const meta = tr.getMeta(diffPluginKey);

        if (meta?.setPreview) {
          const decorations = meta.decorations || DecorationSet.empty;
          return {
            decorations,
            originalDoc: meta.originalDoc,
            proposedDoc: meta.proposedDoc || null,
            isPreview: true,
          };
        }

        if (meta?.clearPreview) {
          return {
            decorations: DecorationSet.empty,
            originalDoc: null,
            proposedDoc: null,
            isPreview: false,
          };
        }

        // Map decorations through the transaction
        return {
          ...pluginState,
          decorations: pluginState.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    props: {
      decorations(state) {
        const pluginState = this.getState(state);
        return pluginState?.decorations || DecorationSet.empty;
      },
    },
  });
};

// Create selection tracking plugin
const selectionPluginKey = new PluginKey('selection');

const createSelectionPlugin = (onSelectionChange: (selection: { from: number; to: number; text: string } | null) => void) => {
  return new Plugin({
    key: selectionPluginKey,
    state: {
      init() {
        return null;
      },
      apply(tr, prev) {
        const selection = tr.selection;
        if (selection && !selection.empty) {
          const text = tr.doc.textBetween(selection.from, selection.to);
          return { from: selection.from, to: selection.to, text };
        }
        return null;
      }
    },
    view() {
      return {
        update(view) {
          const pluginState = selectionPluginKey.getState(view.state);
          onSelectionChange(pluginState);
        }
      };
    }
  });
};

// Create initial document - start empty for testing
const createInitialDoc = (schema: Schema) => {
  // Start with an empty document - just a single empty paragraph
  return schema.node('doc', null, [
    schema.node('paragraph', null, [])
  ]);
};

interface TestProseMirrorDOMProps {
  onStateChange?: (state: EditorState) => void;
  initialContent?: any;
  onSuggestChange?: (selectedText: string, suggestion: string, context: {
    from: number;
    to: number;
    documentHtml: string;
    surroundingText?: string;
  }) => void;
}

export interface TestProseMirrorDOMRef {
  showChanges: () => void;
  hideChanges: () => void;
  applyAIProposal: (proposalHtml: string) => void;
  showProposedChanges: (proposalHtml: string) => void;
  acceptProposedChanges: () => void;
  rejectProposedChanges: () => void;
  getHTML: () => string;
  getState: () => EditorState;
  addGeoLocation: (lat: number, lng: number, placeName?: string, placeId?: string, colorIndex?: number) => void;
  removeGeoLocation: () => void;
}

// Location modal component
const LocationModal = ({ isOpen, onClose, onSelect, initialText }: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (location: { lat: number; lng: number; name: string; placeId: string }) => void;
  initialText?: string;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState('');

  // Initialize session token and search query for Google Places
  useEffect(() => {
    if (isOpen) {
      // Generate a unique session token for billing optimization
      setSessionToken(Math.random().toString(36).substring(7));
      // Set initial search query from selected text
      if (initialText) {
        setSearchQuery(initialText);
      }
    } else {
      // Clear search when closing
      setSearchQuery('');
      setSuggestions([]);
    }
  }, [isOpen, initialText]);

  // Fetch places from Google Places API
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn('Google Places API key not configured');
      // Fallback to popular places
      setSuggestions([
        { place_id: 'eiffel-tower', description: 'Eiffel Tower, Paris', lat: 48.8584, lng: 2.2945 },
        { place_id: 'sagrada-familia', description: 'Sagrada Familia, Barcelona', lat: 41.4036, lng: 2.1744 },
      ]);
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);

      try {
        // Use Supabase Edge Function as proxy for Google Places API
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/google-places-proxy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              action: 'autocomplete',
              input: searchQuery,
              sessionToken: sessionToken,
            })
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch suggestions');
        }

        const data = await response.json();

        if (data.predictions) {
          setSuggestions(data.predictions.map((prediction: any) => ({
            place_id: prediction.place_id,
            description: prediction.description,
            // Note: lat/lng will be fetched when selected
          })));
        }
      } catch (error) {
        console.error('Error fetching places:', error);
        // Fallback suggestions
        setSuggestions([
          { place_id: 'eiffel-tower', description: 'Eiffel Tower, Paris', lat: 48.8584, lng: 2.2945 },
          { place_id: 'sagrada-familia', description: 'Sagrada Familia, Barcelona', lat: 41.4036, lng: 2.1744 },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce the API call
    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, sessionToken]);

  if (!isOpen) return null;

  return (
    <div className="location-modal-overlay" onClick={onClose}>
      <div className="location-modal" onClick={(e) => e.stopPropagation()}>
        <div className="location-modal-header">
          <h3>Select Location</h3>
          <button className="location-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="location-modal-search">
          <input
            type="text"
            placeholder="Search for a place..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="location-search-input"
            autoFocus
          />
        </div>

        <div className="location-modal-suggestions">
          {isLoading && (
            <div className="location-loading">
              <span>Loading suggestions...</span>
            </div>
          )}
          {!isLoading && suggestions.map((suggestion) => (
            <div
              key={suggestion.place_id}
              className="location-suggestion"
              onClick={async () => {
                // Fetch place details to get coordinates
                const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

                if (suggestion.lat && suggestion.lng) {
                  // If we already have coordinates (fallback data)
                  onSelect({
                    lat: suggestion.lat,
                    lng: suggestion.lng,
                    name: suggestion.description || suggestion.name,
                    placeId: suggestion.place_id,
                  });
                  onClose();
                  return;
                }

                if (!apiKey) {
                  console.warn('Cannot fetch place details without API key');
                  return;
                }

                try {
                  // Fetch place details using Supabase proxy
                  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
                  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

                  const response = await fetch(
                    `${supabaseUrl}/functions/v1/google-places-proxy`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseAnonKey}`,
                      },
                      body: JSON.stringify({
                        action: 'details',
                        placeId: suggestion.place_id,
                        sessionToken: sessionToken,
                      })
                    }
                  );

                  if (!response.ok) {
                    throw new Error('Failed to fetch place details');
                  }

                  const data = await response.json();

                  if (data.result && data.result.geometry) {
                    onSelect({
                      lat: data.result.geometry.location.lat,
                      lng: data.result.geometry.location.lng,
                      name: suggestion.description,
                      placeId: suggestion.place_id,
                    });
                    onClose();
                  }
                } catch (error) {
                  console.error('Error fetching place details:', error);
                  alert('Failed to get location details. Please try again.');
                }
              }}
            >
              <span className="location-icon">📍</span>
              <span className="location-name">{suggestion.description || suggestion.name}</span>
            </div>
          ))}
          {!isLoading && suggestions.length === 0 && searchQuery && (
            <div className="location-no-results">No places found</div>
          )}
        </div>

        <div className="location-modal-footer">
          <small>💡 Tip: Start typing to search for places</small>
        </div>
      </div>
    </div>
  );
};

// Transport mode colors
const TRANSPORT_COLORS: Record<string, string> = {
  walking: '#10B981',
  metro: '#8B5CF6',
  bus: '#3B82F6',
  taxi: '#F59E0B',
  bike: '#84CC16',
  car: '#6B7280'
};

// Map transport modes to Mapbox routing profiles
const TRANSPORT_MODE_PROFILES: Record<string, string> = {
  walking: 'walking',
  car: 'driving',
  taxi: 'driving',
  bike: 'cycling',
  metro: 'walking', // Use walking as approximation for transit
  bus: 'walking'    // Use walking as approximation for transit
};

const TestProseMirrorDOM = forwardRef<TestProseMirrorDOMRef, TestProseMirrorDOMProps>(
  ({ onStateChange, initialContent, onSuggestChange }, ref) => {
    const [mount, setMount] = useState<HTMLElement | null>(null);
    const [bubbleMenuState, setBubbleMenuState] = useState<{
      visible: boolean;
      left?: number;
      top?: number;
      from?: number;
      to?: number;
    }>({ visible: false });
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [selectedText, setSelectedText] = useState('');
    const [geoLocations, setGeoLocations] = useState<Location[]>([]);
    const [clickedLocation, setClickedLocation] = useState<Location | null>(null);

    // Selection tracking state
    const [currentSelection, setCurrentSelection] = useState<{ from: number; to: number; text: string } | null>(null);
    const [editorView, setEditorView] = useState<any>(null);

    // Transportation state
    const [transportationRoutes, setTransportationRoutes] = useState<Array<{
      id: string;
      mode: 'walking' | 'metro' | 'bus' | 'taxi' | 'bike' | 'car';
      fromLocationId: string;
      toLocationId: string;
      duration: string;
      cost?: { amount: number; currency: string };
      notes?: string;
    }>>([]);
    const [connectionMode, setConnectionMode] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
    const [showTransportModal, setShowTransportModal] = useState(false);
    const [transportModalData, setTransportModalData] = useState<{
      fromLocationId: string;
      toLocationId: string;
    } | null>(null);

    // Create initial document
    const initialDoc = useMemo(() => {
      if (!initialContent) {
        return createInitialDoc(geoSchema);
      }

      if (typeof initialContent === 'string') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = initialContent;
        const parser = ProseMirrorDOMParser.fromSchema(geoSchema);
        let doc = parser.parse(tempDiv);

        // Ensure all geo marks have color indices
        const locationColorMap = new Map<string, number>();
        let needsColorAssignment = false;
        let nextColorIndex = 0; // Start at 0 to match array index

        // First pass: check what locations exist and assign sequential colors
        doc.descendants((node) => {
          node.marks.forEach(mark => {
            if (mark.type.name === 'geo') {
              const locationId = `${mark.attrs.lat}_${mark.attrs.lng}`;

              // If this location doesn't have a color assigned yet
              if (!locationColorMap.has(locationId)) {
                // Assign sequential color index for this unique location
                locationColorMap.set(locationId, nextColorIndex);
                nextColorIndex++;
              }

              // Check if mark needs color update
              if (mark.attrs.colorIndex !== locationColorMap.get(locationId)) {
                needsColorAssignment = true;
              }
            }
          });
        });

        // Second pass: assign consistent color indices to all marks of the same location
        if (needsColorAssignment) {
          const tempState = EditorState.create({
            doc,
            schema: geoSchema
          });
          const tr = tempState.tr;

          doc.descendants((node, pos) => {
            node.marks.forEach(mark => {
              if (mark.type.name === 'geo') {
                const locationId = `${mark.attrs.lat}_${mark.attrs.lng}`;
                const colorIndex = locationColorMap.get(locationId) || 0;

                // Only update if color is different
                if (mark.attrs.colorIndex !== colorIndex) {
                  // Create new mark with correct color index
                  const newMark = geoSchema.marks.geo.create({
                    ...mark.attrs,
                    colorIndex
                  });

                  // Replace the mark
                  const from = pos;
                  const to = pos + node.nodeSize;
                  tr.removeMark(from, to, mark);
                  tr.addMark(from, to, newMark);
                }
              }
            });
          });

          doc = tr.doc;
        }

        return doc;
      }

      return initialContent;
    }, [initialContent]);

    // Store click handler ref to access in plugin
    const geoClickHandlerRef = React.useRef<{
      geoLocations: Location[];
      setClickedLocation: (loc: Location | null) => void;
      setTransportModalData: (data: any) => void;
      setShowTransportModal: (show: boolean) => void;
    }>({
      geoLocations: [],
      setClickedLocation: () => {},
      setTransportModalData: () => {},
      setShowTransportModal: () => {},
    });

    // Update ref whenever dependencies change
    React.useEffect(() => {
      geoClickHandlerRef.current = {
        geoLocations,
        setClickedLocation,
        setTransportModalData,
        setShowTransportModal,
      };
    }, [geoLocations]);

    // Create plugin to handle clicks on geo marks
    const createGeoClickPlugin = () => {
      return new Plugin({
        props: {
          handleClick(view, pos, event) {
            const node = view.state.doc.nodeAt(pos);
            if (!node) return false;

            // Check if clicked position has a geo mark
            const $pos = view.state.doc.resolve(pos);
            const marks = $pos.marks();
            const geoMark = marks.find(mark => mark.type.name === 'geo');

            if (geoMark) {
              const handler = geoClickHandlerRef.current;
              // Find the corresponding location
              const location = handler.geoLocations.find(loc =>
                loc.id === geoMark.attrs.placeId ||
                (loc.lat === geoMark.attrs.lat && loc.lng === geoMark.attrs.lng)
              );

              if (location) {
                event.preventDefault();
                handler.setClickedLocation(location);

                // Find if there's a previous location to set up transportation
                const currentIndex = handler.geoLocations.findIndex(loc => loc.id === location.id);
                if (currentIndex > 0) {
                  const previousLocation = handler.geoLocations[currentIndex - 1];
                  handler.setTransportModalData({
                    fromLocationId: previousLocation.id,
                    toLocationId: location.id
                  });
                  handler.setShowTransportModal(true);
                } else if (currentIndex < handler.geoLocations.length - 1) {
                  // If it's the first location, allow setting transport to the next one
                  const nextLocation = handler.geoLocations[currentIndex + 1];
                  handler.setTransportModalData({
                    fromLocationId: location.id,
                    toLocationId: nextLocation.id
                  });
                  handler.setShowTransportModal(true);
                }
                return true;
              }
            }
            return false;
          }
        }
      });
    };

    // Create plugins with a callback that will have access to the view
    const plugins = useMemo(() => [
      createDiffPlugin(),
      history(),
      keymap(baseKeymap),
      createGeoClickPlugin(),
      createSelectionPlugin(setCurrentSelection),
    ], []);

    // Create initial editor state
    const [state, setState] = useState(() => {
      return EditorState.create({
        doc: initialDoc,
        schema: geoSchema,
        plugins,
      });
    });
    const [originalState, setOriginalState] = useState<EditorState | null>(null);
    const [proposedState, setProposedState] = useState<EditorState | null>(null);
    const [isPreviewActive, setIsPreviewActive] = useState(false);

    // Handle state changes
    const dispatchTransaction = (tr: Transaction) => {
      const newState = state.apply(tr);
      setState(newState);
      onStateChange?.(newState);
    };

    // Helper to generate consistent location IDs
    const getLocationId = (mark: Mark): string => {
      if (mark.attrs.placeId) {
        return mark.attrs.placeId;
      }
      // Generate consistent ID based on coordinates
      if (mark.attrs.lat && mark.attrs.lng) {
        return `geo-${mark.attrs.lat.toFixed(6)}-${mark.attrs.lng.toFixed(6)}`;
      }
      return 'unknown';
    };

    // Helper to find nearest point on a polyline
    const findNearestPointOnLine = (
      point: { lng: number; lat: number },
      lineCoordinates: number[][]
    ): { lng: number; lat: number; insertIndex: number } => {
      let minDistance = Infinity;
      let nearestPoint = { lng: lineCoordinates[0][0], lat: lineCoordinates[0][1], insertIndex: 1 };

      for (let i = 0; i < lineCoordinates.length - 1; i++) {
        const start = { lng: lineCoordinates[i][0], lat: lineCoordinates[i][1] };
        const end = { lng: lineCoordinates[i + 1][0], lat: lineCoordinates[i + 1][1] };

        // Calculate projection of point onto line segment
        const dx = end.lng - start.lng;
        const dy = end.lat - start.lat;
        const t = Math.max(0, Math.min(1, ((point.lng - start.lng) * dx + (point.lat - start.lat) * dy) / (dx * dx + dy * dy)));

        const projection = {
          lng: start.lng + t * dx,
          lat: start.lat + t * dy
        };

        // Calculate distance
        const distance = Math.sqrt(
          Math.pow(projection.lng - point.lng, 2) +
          Math.pow(projection.lat - point.lat, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = { ...projection, insertIndex: i + 1 };
        }
      }

      return nearestPoint;
    };

    // Fetch route geometry from Next.js API
    const fetchRouteGeometry = async (
      fromLng: number,
      fromLat: number,
      toLng: number,
      toLat: number,
      mode: string,
      waypoints?: Array<{ lng: number; lat: number }>
    ): Promise<{ type: 'LineString'; coordinates: number[][] } | null> => {
      try {
        const profile = TRANSPORT_MODE_PROFILES[mode] || 'driving';

        // Build coordinates string with waypoints
        let coordinatesArray = [`${fromLng},${fromLat}`];
        if (waypoints && waypoints.length > 0) {
          waypoints.forEach(wp => {
            coordinatesArray.push(`${wp.lng},${wp.lat}`);
          });
        }
        coordinatesArray.push(`${toLng},${toLat}`);
        const coordinates = coordinatesArray.join(';');

        if (waypoints && waypoints.length > 0) {
          console.log('API call with waypoints:', {
            coordinates,
            waypoints,
            url: `api/route?coordinates=${coordinates}&mode=${profile}`
          });
        }

        const apiUrl = process.env.EXPO_PUBLIC_NEXTJS_API_URL || 'http://localhost:3001';

        const response = await fetch(
          `${apiUrl}/api/route?coordinates=${coordinates}&mode=${profile}`
        );

        if (!response.ok) {
          console.warn(`Failed to fetch route for ${mode}:`, response.statusText);
          return null;
        }

        const data = await response.json();
        return data.geometry || null;
      } catch (error) {
        console.error(`Error fetching route geometry for ${mode}:`, error);
        return null;
      }
    };

    // Extract geo-marked locations and transportation from document
    useEffect(() => {
      const locations: Location[] = [];
      const locationMap: Map<string, Location> = new Map();
      const routePromises: Promise<TransportationRoute | null>[] = [];

      // First pass: collect all locations
      state.doc.descendants((node, pos) => {
        if (node.marks && node.marks.length > 0) {
          node.marks.forEach(mark => {
            if (mark.type.name === 'geo' && mark.attrs.lat && mark.attrs.lng) {
              const locationId = getLocationId(mark);

              // Only add if not already exists
              if (!locationMap.has(locationId)) {
                const location = {
                  id: locationId,
                  name: mark.attrs.placeName || node.textContent || 'Unknown Location',
                  lat: mark.attrs.lat,
                  lng: mark.attrs.lng,
                  description: `${node.textContent}`,
                  colorIndex: mark.attrs.colorIndex || 0,
                };
                locations.push(location);
                locationMap.set(locationId, location);
              }
            }
          });
        }
      });

      // Second pass: collect transportation routes with async API calls
      state.doc.descendants((node, pos) => {
        if (node.marks && node.marks.length > 0) {
          node.marks.forEach(mark => {
            if (mark.type.name === 'geo' && mark.attrs.lat && mark.attrs.lng) {
              const locationId = getLocationId(mark);

              // Check for transportation info
              if (mark.attrs.transportFromId && mark.attrs.transportMode) {
                const fromLocation = locationMap.get(mark.attrs.transportFromId);
                const toLocation = locationMap.get(locationId);

                if (fromLocation && toLocation) {
                  // Check if route already exists (avoid duplicates)
                  const routeId = `${mark.attrs.transportFromId}-${locationId}`;

                  // Create async route promise
                  const routePromise = (async (): Promise<TransportationRoute | null> => {
                    try {
                      // Parse waypoints from mark attributes
                      let waypoints: Array<{ lng: number; lat: number }> | undefined;
                      if (mark.attrs.transportWaypoints) {
                        try {
                          waypoints = JSON.parse(mark.attrs.transportWaypoints);
                        } catch (e) {
                          console.warn('Failed to parse waypoints:', e);
                        }
                      }

                      // Fetch actual route geometry from API with waypoints
                      if (waypoints && waypoints.length > 0) {
                        console.log('Fetching route with waypoints:', waypoints);
                      }

                      const geometry = await fetchRouteGeometry(
                        fromLocation.lng,
                        fromLocation.lat,
                        toLocation.lng,
                        toLocation.lat,
                        mark.attrs.transportMode,
                        waypoints
                      );

                      // Get color based on transport mode
                      const transportColor = TRANSPORT_COLORS[mark.attrs.transportMode as keyof typeof TRANSPORT_COLORS] || '#6B7280';

                      // Use fetched geometry if available, otherwise fall back to straight line
                      const finalGeometry = geometry || {
                        type: 'LineString' as const,
                        coordinates: [
                          [fromLocation.lng, fromLocation.lat],
                          [toLocation.lng, toLocation.lat]
                        ]
                      };

                      console.log('Route created with geometry:', {
                        routeId,
                        mode: mark.attrs.transportMode,
                        hasApiGeometry: !!geometry,
                        hasWaypoints: !!waypoints && waypoints.length > 0,
                        waypointCount: waypoints?.length || 0,
                        coordinatesCount: finalGeometry.coordinates.length,
                        firstCoord: finalGeometry.coordinates[0],
                        lastCoord: finalGeometry.coordinates[finalGeometry.coordinates.length - 1]
                      });

                      return {
                        id: routeId,
                        mode: mark.attrs.transportMode,
                        fromLocationId: mark.attrs.transportFromId,
                        toLocationId: locationId,
                        fromPlace: fromLocation.name,
                        toPlace: toLocation.name,
                        geometry: finalGeometry,
                        color: transportColor,
                        duration: mark.attrs.transportDuration,
                        waypoints: waypoints?.map((wp, index) => ({ ...wp, index })),
                        cost: mark.attrs.transportCostAmount ? {
                          amount: mark.attrs.transportCostAmount,
                          currency: mark.attrs.transportCostCurrency || 'EUR'
                        } : undefined,
                        notes: mark.attrs.transportNotes
                      };
                    } catch (error) {
                      console.error('Failed to fetch route geometry:', error);
                      // Return fallback route with straight line
                      const transportColor = TRANSPORT_COLORS[mark.attrs.transportMode as keyof typeof TRANSPORT_COLORS] || '#6B7280';

                      // Parse waypoints even for fallback
                      let waypoints: Array<{ lng: number; lat: number }> | undefined;
                      if (mark.attrs.transportWaypoints) {
                        try {
                          waypoints = JSON.parse(mark.attrs.transportWaypoints);
                        } catch (e) {
                          console.warn('Failed to parse waypoints:', e);
                        }
                      }

                      return {
                        id: routeId,
                        mode: mark.attrs.transportMode,
                        fromLocationId: mark.attrs.transportFromId,
                        toLocationId: locationId,
                        fromPlace: fromLocation.name,
                        toPlace: toLocation.name,
                        geometry: {
                          type: 'LineString' as const,
                          coordinates: [
                            [fromLocation.lng, fromLocation.lat],
                            [toLocation.lng, toLocation.lat]
                          ]
                        },
                        color: transportColor,
                        duration: mark.attrs.transportDuration,
                        waypoints: waypoints?.map((wp, index) => ({ ...wp, index })),
                        cost: mark.attrs.transportCostAmount ? {
                          amount: mark.attrs.transportCostAmount,
                          currency: mark.attrs.transportCostCurrency || 'EUR'
                        } : undefined,
                        notes: mark.attrs.transportNotes
                      };
                    }
                  })();

                  routePromises.push(routePromise);
                } else {
                  console.log('Route creation failed - missing locations:', {
                    hasFromLocation: !!fromLocation,
                    hasToLocation: !!toLocation,
                    transportFromId: mark.attrs.transportFromId,
                    locationId: locationId
                  });
                }
              }
            }
          });
        }
      });

      // Set locations immediately
      setGeoLocations(locations);

      // Resolve all route promises and filter out nulls
      Promise.all(routePromises).then(resolvedRoutes => {
        const validRoutes = resolvedRoutes.filter((route): route is TransportationRoute => route !== null);

        // Remove duplicates by route id
        const uniqueRoutes = validRoutes.filter((route, index, self) =>
          index === self.findIndex((r) => r.id === route.id)
        );

        console.log('All routes resolved:', {
          totalRoutes: uniqueRoutes.length,
          routes: uniqueRoutes.map(r => ({
            id: r.id,
            mode: r.mode,
            from: r.fromPlace,
            to: r.toPlace,
            coordinatesCount: r.geometry.coordinates.length
          }))
        });

        setTransportationRoutes(uniqueRoutes);
      }).catch(error => {
        console.error('Error resolving routes:', error);
        setTransportationRoutes([]);
      });
    }, [state]);

    // Update bubble menu based on selection
    useEffect(() => {
      const { from, to } = state.selection;

      // No selection
      if (from === to) {
        console.log('No selection, hiding menu');
        setBubbleMenuState({ visible: false });
        return;
      }

      // Small delay to ensure DOM selection is ready
      const timer = setTimeout(() => {
        // Get the editor element to calculate position
        if (mount) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const containerRect = mount.getBoundingClientRect();

            // Calculate relative position
            const left = rect.left - containerRect.left + rect.width / 2;
            const top = rect.top - containerRect.top - 8; // Above selection

            console.log('Selection detected:', {
              from, to, left, top,
              rect,
              containerRect,
              selection: selection.toString()
            });

            setBubbleMenuState({
              visible: true,
              left,
              top,
              from,
              to,
            });

            // Store the selected text
            const text = selection.toString();
            setSelectedText(text);
          } else {
            console.log('No DOM selection found');
          }
        }
      }, 10);

      return () => clearTimeout(timer);
    }, [state.selection, mount]);

    // Convert ProseMirror document to HTML
    const docToHTML = (doc: Node): string => {
      const serializer = DOMSerializer.fromSchema(geoSchema);
      const dom = serializer.serializeFragment(doc.content);

      let nodeId = 0;
      const wrapper = document.createElement('div');
      wrapper.appendChild(dom);

      // Add IDs to each element (required for Edge Function to work)
      const addIds = (node: any) => {
        if (node.nodeType === 1) { // Element node
          // Only add IDs to block-level elements (h1, h2, p, etc.)
          const tagName = node.tagName.toLowerCase();
          if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre'].includes(tagName)) {
            node.setAttribute('id', `node-${nodeId++}`);
          }
          Array.from(node.children).forEach(addIds);
        }
      };

      Array.from(wrapper.children).forEach(addIds);
      console.log('Generated HTML with IDs:', wrapper.innerHTML);
      return wrapper.innerHTML;
    };

    // Show changes with diff decorations
    const showChanges = () => {
      if (isPreviewActive) return;

      // Save the original state
      setOriginalState(state);

      // Create a transform to apply the changes
      const tr = state.tr;

      // Find position after Day 1 paragraph
      let insertAfterDay1 = 0;
      let nodeCount = 0;

      state.doc.descendants((node, pos) => {
        nodeCount++;
        if (nodeCount === 4) { // Day 1 paragraph
          insertAfterDay1 = pos + node.nodeSize;
          return false;
        }
      });

      const decorationSpecs = [];

      // Insert Day 2 content after Day 1
      const day2Heading = geoSchema.node('heading', { level: 2 }, [
        geoSchema.text('Day 2 - Eiffel Tower & Montmartre')
      ]);
      const day2Para1 = geoSchema.node('paragraph', null, [
        geoSchema.text('Morning: Eiffel Tower visit with pre-booked tickets. Lunch at Café de l\'Homme with tower views.')
      ]);
      const day2Para2 = geoSchema.node('paragraph', null, [
        geoSchema.text('Afternoon: Explore Montmartre, visit Sacré-Cœur, artist squares. Evening: Moulin Rouge show (optional).')
      ]);

      tr.insert(insertAfterDay1, [day2Heading, day2Para1, day2Para2]);
      const day2Size = day2Heading.nodeSize + day2Para1.nodeSize + day2Para2.nodeSize;

      // Mark Day 2 as addition
      decorationSpecs.push(
        Decoration.inline(
          insertAfterDay1,
          insertAfterDay1 + day2Size,
          { class: 'diff-addition' },
          { inclusiveStart: true, inclusiveEnd: true }
        )
      );

      // Create decorations
      const decorations = DecorationSet.create(tr.doc, decorationSpecs);

      // Set metadata for the plugin
      tr.setMeta(diffPluginKey, {
        setPreview: true,
        originalDoc: state.doc,
        decorations,
      });

      setState(state.apply(tr));
      setIsPreviewActive(true);
    };

    // Hide changes and restore original
    const hideChanges = () => {
      if (!isPreviewActive || !originalState) return;

      // Restore the original state
      const tr = originalState.tr;
      tr.setMeta(diffPluginKey, { clearPreview: true });

      setState(originalState);
      setIsPreviewActive(false);
      setOriginalState(null);
    };

    // Show proposed changes with diff visualization
    const showProposedChanges = (proposalHtml: string) => {
      try {
        console.log('Showing proposed changes with HTML:', proposalHtml);

        // Save current state as original
        setOriginalState(state);

        // Parse the proposed HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = proposalHtml;

        // Find elements with data-change-type and apply visual styles
        const addedElements = tempDiv.querySelectorAll('[data-change-type="added"]');
        console.log('Found added elements:', addedElements.length);

        const parser = ProseMirrorDOMParser.fromSchema(geoSchema);
        let proposedDoc = parser.parse(tempDiv);

        // Post-process to ensure all geo marks have color indices
        const usedIndices = new Set<number>();
        let needsColorAssignment = false;

        // First pass: collect used indices and check if any marks need color assignment
        proposedDoc.descendants((node) => {
          node.marks.forEach(mark => {
            if (mark.type.name === 'geo') {
              if (mark.attrs.colorIndex !== undefined && mark.attrs.colorIndex !== null && mark.attrs.colorIndex !== 0) {
                usedIndices.add(mark.attrs.colorIndex);
              } else {
                needsColorAssignment = true;
              }
            }
          });
        });

        // Second pass: assign colors to marks that don't have them
        if (needsColorAssignment) {
          let nextColorIndex = 1; // Start at 1, not 0
          // Create a temporary EditorState to work with transactions
          const tempState = EditorState.create({
            doc: proposedDoc,
            schema: geoSchema
          });
          const tr = tempState.tr;

          proposedDoc.descendants((node, pos) => {
            node.marks.forEach(mark => {
              if (mark.type.name === 'geo' && (!mark.attrs.colorIndex || mark.attrs.colorIndex === 0)) {
                // Find next available color index
                while (usedIndices.has(nextColorIndex) && nextColorIndex <= 9) {
                  nextColorIndex++;
                }
                const colorIndex = nextColorIndex > 9 ? ((nextColorIndex - 1) % 9) + 1 : nextColorIndex;
                usedIndices.add(colorIndex);

                // Create new mark with color index
                const newMark = geoSchema.marks.geo.create({
                  ...mark.attrs,
                  colorIndex
                });

                // Replace the mark
                const from = pos;
                const to = pos + node.nodeSize;
                tr.removeMark(from, to, mark);
                tr.addMark(from, to, newMark);

                nextColorIndex++;
              }
            });
          });

          // Apply the transaction to get the updated document
          proposedDoc = tr.doc;
        }

        // Create decorations for added content
        const decorations: Decoration[] = [];

        // Create a map of added element text content for matching
        const addedTextSet = new Set<string>();
        addedElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text) {
            addedTextSet.add(text);
            console.log('Added element text:', text);
          }
        });

        // Traverse the proposed document and find added blocks
        proposedDoc.descendants((node, pos) => {
          if (node.isBlock && node.type.name !== 'doc') {
            const nodeText = node.textContent.trim();

            // Check if this block's text matches any added element
            if (nodeText && addedTextSet.has(nodeText)) {
              console.log(`Adding decoration at pos ${pos} for text: "${nodeText}"`);
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'diff-addition'
                })
              );
            }
          }
        });

        const decorationSet = DecorationSet.create(proposedDoc, decorations);

        // Apply the proposed document with decorations
        const tr = state.tr;
        tr.replaceWith(0, state.doc.content.size, proposedDoc.content);
        tr.setMeta(diffPluginKey, {
          setPreview: true,
          originalDoc: state.doc,
          proposedDoc: proposedDoc,
          decorations: decorationSet,
        });

        setState(state.apply(tr));
        setIsPreviewActive(true);
        console.log('Proposed changes displayed with', decorations.length, 'decorations');
      } catch (error) {
        console.error('Error showing proposed changes:', error);
        throw error;
      }
    };


    // Apply AI proposal directly (without preview)
    const applyAIProposal = (proposalHtml: string) => {
      try {
        console.log('Applying AI proposal with HTML:', proposalHtml);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = proposalHtml;

        const parser = ProseMirrorDOMParser.fromSchema(geoSchema);
        let doc = parser.parse(tempDiv);

        // Ensure all geo marks have color indices
        const locationColorMap = new Map<string, number>();
        let needsColorAssignment = false;
        let nextColorIndex = 0; // Start at 0 to match array index

        // First pass: check what locations exist and assign sequential colors
        doc.descendants((node) => {
          node.marks.forEach(mark => {
            if (mark.type.name === 'geo') {
              const locationId = `${mark.attrs.lat}_${mark.attrs.lng}`;

              // If this location doesn't have a color assigned yet
              if (!locationColorMap.has(locationId)) {
                // Assign sequential color index for this unique location
                locationColorMap.set(locationId, nextColorIndex);
                nextColorIndex++;
              }

              // Check if mark needs color update
              if (mark.attrs.colorIndex !== locationColorMap.get(locationId)) {
                needsColorAssignment = true;
              }
            }
          });
        });

        // Second pass: assign consistent color indices to all marks of the same location
        if (needsColorAssignment) {
          const tempState = EditorState.create({
            doc,
            schema: geoSchema
          });
          const tr = tempState.tr;

          doc.descendants((node, pos) => {
            node.marks.forEach(mark => {
              if (mark.type.name === 'geo') {
                const locationId = `${mark.attrs.lat}_${mark.attrs.lng}`;
                const colorIndex = locationColorMap.get(locationId) || 0;

                // Only update if color is different
                if (mark.attrs.colorIndex !== colorIndex) {
                  // Create new mark with correct color index
                  const newMark = geoSchema.marks.geo.create({
                    ...mark.attrs,
                    colorIndex
                  });

                  // Replace the mark
                  const from = pos;
                  const to = pos + node.nodeSize;
                  tr.removeMark(from, to, mark);
                  tr.addMark(from, to, newMark);
                }
              }
            });
          });

          doc = tr.doc;
        }

        console.log('Parsed document:', doc.toJSON());

        const newState = EditorState.create({
          doc,
          schema: geoSchema,
          plugins: state.plugins,
        });

        setState(newState);
        setIsPreviewActive(false);
        setOriginalState(null);
        setProposedState(null);
        console.log('AI proposal applied successfully');
      } catch (error) {
        console.error('Error applying AI proposal:', error);
        throw error;
      }
    };

    // Accept the proposed changes
    const acceptProposedChanges = () => {
      if (!isPreviewActive) return;

      // Clear decorations but keep the proposed content
      const tr = state.tr;
      tr.setMeta(diffPluginKey, { clearPreview: true });

      setState(state.apply(tr));
      setIsPreviewActive(false);
      setOriginalState(null);
      setProposedState(null);
      console.log('Proposed changes accepted');
    };

    // Reject proposed changes and restore original
    const rejectProposedChanges = () => {
      if (!originalState || !isPreviewActive) return;

      // Restore the original state
      const tr = originalState.tr;
      tr.setMeta(diffPluginKey, { clearPreview: true });

      setState(originalState);
      setIsPreviewActive(false);
      setOriginalState(null);
      setProposedState(null);
      console.log('Proposed changes rejected');
    };

    // Get current HTML
    const getHTML = () => {
      return docToHTML(state.doc);
    };

    // Get current state
    const getState = () => {
      return state;
    };

    // Add geo location to selected text
    const addGeoLocation = (lat: number, lng: number, placeName?: string, placeId?: string, colorIndex?: number) => {
      const command = addGeoMark(lat, lng, placeName, placeId, colorIndex);
      if (command(state, (t) => dispatchTransaction(t))) {
        console.log('Geo location added:', { lat, lng, placeName });
      }
    };

    // Remove geo location from selected text
    const removeGeoLocation = () => {
      if (removeGeoMark(state, (t) => dispatchTransaction(t))) {
        console.log('Geo location removed');
      }
    };

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      showChanges,
      hideChanges,
      applyAIProposal,
      showProposedChanges,
      acceptProposedChanges,
      rejectProposedChanges,
      getHTML,
      getState,
      addGeoLocation,
      removeGeoLocation,
    }));

    // Handle location selection from modal
    const handleLocationSelect = (location: { lat: number; lng: number; name: string; placeId: string }) => {
      console.log('Location selected:', location);
      addGeoLocation(location.lat, location.lng, location.name, location.placeId);
      setIsLocationModalOpen(false);
    };

    // Transportation handlers
    const handlePlaceClick = (location: Location) => {
      if (connectionMode) {
        if (!selectedLocation) {
          // First location selected
          setSelectedLocation(location.id);
        } else if (selectedLocation !== location.id) {
          // Second location selected - open modal
          setTransportModalData({
            fromLocationId: selectedLocation,
            toLocationId: location.id
          });
          setShowTransportModal(true);
          setSelectedLocation(null);
          setConnectionMode(false);
        }
      } else {
        // Normal click behavior - scroll to location in document
        let found = false;
        state.doc.descendants((node, pos) => {
          if (!found && node.marks && node.marks.length > 0) {
            node.marks.forEach(mark => {
              if (!found && mark.type.name === 'geo' &&
                  mark.attrs.lat === location.lat &&
                  mark.attrs.lng === location.lng) {
                const tr = state.tr.setSelection(
                  TextSelection.near(state.doc.resolve(pos))
                );
                dispatchTransaction(tr);
                found = true;
              }
            });
          }
        });
      }
    };

    const handleAddTransportation = (fromId: string, toId: string) => {
      setTransportModalData({ fromLocationId: fromId, toLocationId: toId });
      setShowTransportModal(true);
    };

    const handleSaveTransportation = (transport: any) => {
      if (transportModalData) {
        // Find the destination location to get its coordinates
        const destinationLocation = geoLocations.find(loc => loc.id === transportModalData.toLocationId);

        // Update the geo mark with transportation info
        const tr = state.tr;
        let updated = false;

        state.doc.descendants((node, pos) => {
          if (!updated) {
            node.marks.forEach(mark => {
              if (!updated && mark.type.name === 'geo') {
                // Match by location ID (which uses placeId or coordinate-based ID)
                const markLocationId = getLocationId(mark);

                // Also fallback to coordinate matching if needed
                const isMatch = markLocationId === transportModalData.toLocationId ||
                  (destinationLocation &&
                   Math.abs(mark.attrs.lat - destinationLocation.lat) < 0.000001 &&
                   Math.abs(mark.attrs.lng - destinationLocation.lng) < 0.000001);

                if (isMatch) {
                  // Found the destination mark - add/update transportation info
                  const from = pos;
                  const to = pos + node.nodeSize;

                  // Create new mark with transportation data
                  const newMark = geoSchema.marks.geo.create({
                    ...mark.attrs,
                    transportFromId: transportModalData.fromLocationId,
                    transportMode: transport.mode,
                    transportDuration: transport.duration,
                    transportCostAmount: transport.cost?.amount || null,
                    transportCostCurrency: transport.cost?.currency || null,
                    transportNotes: transport.notes || null
                  });

                  // Remove old mark and add new one
                  tr.removeMark(from, to, mark);
                  tr.addMark(from, to, newMark);
                  updated = true;
                }
              }
            });
          }
        });

        if (updated) {
          dispatchTransaction(tr);
        }

        // Update or add the route in visualization state
        const routeId = `${transportModalData.fromLocationId}-${transportModalData.toLocationId}`;
        const existingRouteIndex = transportationRoutes.findIndex(r =>
          r.fromLocationId === transportModalData.fromLocationId &&
          r.toLocationId === transportModalData.toLocationId
        );

        // Find the locations to get coordinates and names
        const fromLocation = geoLocations.find(loc => loc.id === transportModalData.fromLocationId);
        const toLocation = geoLocations.find(loc => loc.id === transportModalData.toLocationId);

        // Get color based on transport mode
        const transportColor = TRANSPORT_COLORS[transport.mode as keyof typeof TRANSPORT_COLORS] || '#6B7280';

        const newRoute = {
          id: routeId,
          mode: transport.mode,
          fromLocationId: transportModalData.fromLocationId,
          toLocationId: transportModalData.toLocationId,
          fromPlace: fromLocation?.name || 'Unknown',
          toPlace: toLocation?.name || 'Unknown',
          geometry: {
            type: 'LineString' as const,
            coordinates: fromLocation && toLocation ? [
              [fromLocation.lng, fromLocation.lat],
              [toLocation.lng, toLocation.lat]
            ] : []
          },
          color: transportColor,
          duration: transport.duration,
          cost: transport.cost,
          notes: transport.notes
        };

        if (existingRouteIndex >= 0) {
          // Update existing route
          const updatedRoutes = [...transportationRoutes];
          updatedRoutes[existingRouteIndex] = { ...updatedRoutes[existingRouteIndex], ...newRoute };
          setTransportationRoutes(updatedRoutes);
        } else {
          // Add new route
          setTransportationRoutes([...transportationRoutes, newRoute]);
        }

        setShowTransportModal(false);
        setTransportModalData(null);
      }
    };

    // Helper to find transportation between two locations
    const findTransportation = (fromId: string, toId: string) => {
      return transportationRoutes.find(
        route => route.fromLocationId === fromId && route.toLocationId === toId
      );
    };

    // Transport mode icons and colors
    const TRANSPORT_ICONS: Record<string, string> = {
      walking: '🚶',
      metro: '🚇',
      bus: '🚌',
      taxi: '🚕',
      bike: '🚴',
      car: '🚙'
    };

    // Handle suggestion from selection toolbar
    const handleSuggestChange = (selectedText: string, suggestion: string) => {
      if (!currentSelection) return;

      // Add pendingChange mark to the selected text
      const tr = state.tr;
      const pendingChangeMark = geoSchema.marks.pendingChange.create({
        comment: suggestion,
        originalText: selectedText,
        timestamp: new Date().toISOString()
      });

      tr.addMark(currentSelection.from, currentSelection.to, pendingChangeMark);
      dispatchTransaction(tr);

      // Get surrounding context (50 characters before and after)
      const doc = state.doc;
      const contextStart = Math.max(0, currentSelection.from - 50);
      const contextEnd = Math.min(doc.content.size, currentSelection.to + 50);
      const surroundingText = doc.textBetween(contextStart, contextEnd, ' ');

      // Get the current document as HTML
      const documentHtml = docToHTML(state.doc);

      // Call parent callback if provided
      if (onSuggestChange) {
        onSuggestChange(selectedText, suggestion, {
          from: currentSelection.from,
          to: currentSelection.to,
          documentHtml,
          surroundingText
        });
      }

      console.log('Suggestion added:', {
        selectedText,
        suggestion,
        from: currentSelection.from,
        to: currentSelection.to
      });
    };

    return (
      <div className="test-prosemirror-wrapper">
        {/* Map View - Always visible when there are locations */}
        {geoLocations.length > 0 && (
          <div className="map-view-container">
            {/* Places List - Left side */}
            <div className="places-list-container">
              <div className="places-list-header">
                <span>Places ({geoLocations.length})</span>
                <button
                  className={`connection-mode-btn ${connectionMode ? 'active' : ''}`}
                  onClick={() => {
                    setConnectionMode(!connectionMode);
                    setSelectedLocation(null);
                  }}
                  title="Connect places with transportation"
                >
                  {connectionMode ? '🔗 Connecting...' : '➕ Connect'}
                </button>
              </div>
              <div className="places-list-content">
                {geoLocations.map((location, index) => {
                  const colorIndex = location.colorIndex ?? index;
                  const markerColors = [
                    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
                    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
                  ];
                  const color = markerColors[colorIndex % markerColors.length];

                  return (
                    <div
                      key={location.id}
                      className={`place-item ${
                        connectionMode && selectedLocation === location.id ? 'selected' : ''
                      }`}
                      onClick={() => handlePlaceClick(location)}
                    >
                      <div
                        className="place-item-dot"
                        style={{ backgroundColor: color }}
                      />
                      <div className="place-item-info">
                        <div className="place-item-name">{location.name}</div>
                        {location.description && (
                          <div className="place-item-description">{location.description}</div>
                        )}
                      </div>
                    </div>
                  );
                }).reduce<React.ReactNode[]>((acc, item, index, array) => {
                  // Add the place item
                  acc.push(item);

                  // Add transportation or quick action button between consecutive places
                  if (index < array.length - 1 && !connectionMode) {
                    const currentLoc = geoLocations[index];
                    const nextLoc = geoLocations[index + 1];
                    const existingTransport = findTransportation(currentLoc.id, nextLoc.id);

                    if (existingTransport) {
                      // Show existing transportation
                      const icon = TRANSPORT_ICONS[existingTransport.mode] || '🚶';
                      const color = TRANSPORT_COLORS[existingTransport.mode] || '#6B7280';

                      acc.push(
                        <div key={`transport-${index}`} className="transport-display">
                          <div className="transport-info" style={{ borderLeftColor: color }}>
                            <div className="transport-mode">
                              <span className="transport-icon">{icon}</span>
                              <span className="transport-mode-name" style={{ color }}>
                                {existingTransport.mode.charAt(0).toUpperCase() + existingTransport.mode.slice(1)}
                              </span>
                              <span className="transport-duration">{existingTransport.duration}</span>
                            </div>
                            {existingTransport.cost && (
                              <span className="transport-cost">
                                {existingTransport.cost.amount} {existingTransport.cost.currency}
                              </span>
                            )}
                            <button
                              className="transport-edit-btn"
                              onClick={() => handleAddTransportation(currentLoc.id, nextLoc.id)}
                              title="Edit transportation"
                            >
                              ✏️
                            </button>
                          </div>
                        </div>
                      );
                    } else {
                      // Show add transport button
                      acc.push(
                        <div key={`transport-${index}`} className="transport-quick-action">
                          <button
                            className="transport-add-btn"
                            onClick={() => handleAddTransportation(currentLoc.id, nextLoc.id)}
                            title={`Add transportation from ${currentLoc.name} to ${nextLoc.name}`}
                          >
                            <span>↓</span>
                            <span className="transport-add-text">Add transport</span>
                          </button>
                        </div>
                      );
                    }
                  }

                  return acc;
                }, [])}
              </div>
            </div>

            {/* Map - Right side */}
            <div className="map-container">
              <MapView
                locations={geoLocations}
                transportationRoutes={transportationRoutes}
                style={{ width: '100%', height: '100%' }}
                onLocationClick={(location) => {
                  console.log('Map location clicked:', location);
                  // Find and scroll to the location in the document
                  let found = false;
                  state.doc.descendants((node, pos) => {
                    if (!found && node.marks && node.marks.length > 0) {
                      node.marks.forEach(mark => {
                        if (!found && mark.type.name === 'geo' &&
                            mark.attrs.lat === location.lat &&
                            mark.attrs.lng === location.lng) {
                          // Scroll to this position in the editor
                          const tr = state.tr.setSelection(
                            TextSelection.near(state.doc.resolve(pos))
                          );
                          dispatchTransaction(tr);
                          found = true;
                        }
                      });
                    }
                  });
                }}
                onRouteClick={(routeId, lngLat, segmentIndex) => {
                  console.log('Route clicked:', { routeId, lngLat, segmentIndex });

                  // Find the route to get its coordinates
                  const route = transportationRoutes.find(r => r.id === routeId);
                  if (!route) return;

                  // Parse the route ID to get origin and destination info
                  // Route ID format: "geo-<fromLat>-<fromLng>-geo-<toLat>-<toLng>"
                  const parts = routeId.split('-');
                  const fromLat = parseFloat(parts[1]);
                  const fromLng = parseFloat(parts[2]);
                  const toLat = parseFloat(parts[4]);
                  const toLng = parseFloat(parts[5]);

                  // Use exact drop location - don't snap to route
                  console.log('Adding waypoint at exact location:', lngLat);

                  // Update the ProseMirror document with new waypoint
                  let updated = false;
                  const tr = state.tr;

                  state.doc.descendants((node, pos) => {
                    if (!updated && node.marks) {
                      node.marks.forEach(mark => {

                        if (!updated && mark.type.name === 'geo' &&
                            mark.attrs.transportFromId &&
                            `${mark.attrs.transportFromId}-${getLocationId(mark)}` === routeId) {

                          // Get existing waypoints or initialize empty array
                          let waypoints: Array<{ lng: number; lat: number }> = [];
                          if (mark.attrs.transportWaypoints) {
                            try {
                              waypoints = JSON.parse(mark.attrs.transportWaypoints);
                            } catch (e) {
                              console.warn('Failed to parse existing waypoints:', e);
                            }
                          }

                          // Use exact drop location (not snapped to route)
                          const newWaypoint = {
                            lng: lngLat.lng,
                            lat: lngLat.lat
                          };

                          const isDuplicate = waypoints.some(wp =>
                            Math.abs(wp.lng - newWaypoint.lng) < 0.00001 &&
                            Math.abs(wp.lat - newWaypoint.lat) < 0.00001
                          );

                          if (!isDuplicate) {
                            // Determine where to insert the new waypoint based on its position along the route
                            // We'll calculate the cumulative distance along the route through all waypoints

                            // Helper function to calculate distance between two points
                            const distance = (p1: {lng: number, lat: number}, p2: {lng: number, lat: number}) => {
                              const dx = p2.lng - p1.lng;
                              const dy = p2.lat - p1.lat;
                              return Math.sqrt(dx * dx + dy * dy);
                            };

                            // Build the ordered list of points: origin, waypoints, destination
                            const routePoints = [
                              { lng: fromLng, lat: fromLat },
                              ...waypoints,
                              { lng: toLng, lat: toLat }
                            ];

                            // Calculate total distance from origin to the new waypoint through existing waypoints
                            // and find the best insertion point
                            let bestInsertIndex = 0;
                            let minDetour = Infinity;

                            for (let i = 0; i <= waypoints.length; i++) {
                              // Calculate the detour if we insert at position i
                              const testRoute = [
                                { lng: fromLng, lat: fromLat },
                                ...waypoints.slice(0, i),
                                newWaypoint,
                                ...waypoints.slice(i),
                                { lng: toLng, lat: toLat }
                              ];

                              // Calculate total distance of this route
                              let totalDistance = 0;
                              for (let j = 0; j < testRoute.length - 1; j++) {
                                totalDistance += distance(testRoute[j], testRoute[j + 1]);
                              }

                              if (totalDistance < minDetour) {
                                minDetour = totalDistance;
                                bestInsertIndex = i;
                              }
                            }

                            console.log(`Inserting waypoint at index ${bestInsertIndex} (minimizes total route distance, ${waypoints.length} existing waypoints)`);

                            // Insert at the calculated position
                            waypoints.splice(bestInsertIndex, 0, newWaypoint);
                          } else {
                            console.log('Waypoint already exists, not adding duplicate');
                          }

                          // Update the mark with new waypoints
                          const newAttrs = {
                            ...mark.attrs,
                            transportWaypoints: JSON.stringify(waypoints)
                          };

                          const newMark = mark.type.create(newAttrs);

                          // Get the actual text node bounds
                          const from = pos;
                          const to = pos + node.nodeSize;

                          tr.removeMark(from, to, mark)
                            .addMark(from, to, newMark);
                          updated = true;
                        }
                      });
                    }
                  });

                  if (updated) {
                    dispatchTransaction(tr);
                  }
                }}
                onWaypointDrag={(routeId, waypointIndex, newPosition) => {
                  console.log('Waypoint dragged:', { routeId, waypointIndex, newPosition });

                  // Update the ProseMirror document with updated waypoint position
                  let updated = false;
                  const tr = state.tr;

                  state.doc.descendants((node, pos) => {
                    if (!updated && node.marks) {
                      node.marks.forEach(mark => {
                        if (!updated && mark.type.name === 'geo' &&
                            mark.attrs.transportFromId &&
                            `${mark.attrs.transportFromId}-${getLocationId(mark)}` === routeId) {

                          // Get existing waypoints
                          let waypoints: Array<{ lng: number; lat: number }> = [];
                          if (mark.attrs.transportWaypoints) {
                            try {
                              waypoints = JSON.parse(mark.attrs.transportWaypoints);
                            } catch (e) {
                              console.warn('Failed to parse existing waypoints:', e);
                              return;
                            }
                          }

                          // Update waypoint position
                          if (waypointIndex < waypoints.length) {
                            waypoints[waypointIndex] = {
                              lng: newPosition.lng,
                              lat: newPosition.lat
                            };

                            // Update the mark with updated waypoints
                            const newMark = mark.type.create({
                              ...mark.attrs,
                              transportWaypoints: JSON.stringify(waypoints)
                            });

                            tr.removeMark(pos, pos + node.nodeSize, mark)
                              .addMark(pos, pos + node.nodeSize, newMark);
                            updated = true;
                          }
                        }
                      });
                    }
                  });

                  if (updated) {
                    dispatchTransaction(tr);
                  }
                }}
              />
            </div>
          </div>
        )}

        <div className="test-prosemirror-container">
        {/* Location Modal */}
        <LocationModal
          isOpen={isLocationModalOpen}
          onClose={() => setIsLocationModalOpen(false)}
          onSelect={handleLocationSelect}
          initialText={selectedText}
        />

        {/* Transportation Modal */}
        {showTransportModal && transportModalData && (
          <TransportationModal
            isOpen={showTransportModal}
            onClose={() => {
              setShowTransportModal(false);
              setTransportModalData(null);
            }}
            fromLocation={geoLocations.find(loc => loc.id === transportModalData.fromLocationId) || { id: '', name: 'Unknown' }}
            toLocation={geoLocations.find(loc => loc.id === transportModalData.toLocationId) || { id: '', name: 'Unknown' }}
            existingTransportation={findTransportation(transportModalData.fromLocationId, transportModalData.toLocationId)}
            onSave={handleSaveTransportation}
          />
        )}

        {/* Bubble Menu */}
        {bubbleMenuState.visible && (
          <div
            className="bubble-menu"
            style={{
              left: `${bubbleMenuState.left}px`,
              top: `${bubbleMenuState.top}px`,
            }}
          >
            <button
              className="bubble-menu-button"
              onMouseDown={(e) => {
                e.preventDefault();
                toggleMark(geoSchema.marks.strong)(state, dispatchTransaction);
              }}
              title="Bold"
            >
              <strong>B</strong>
            </button>
            <button
              className="bubble-menu-button"
              onMouseDown={(e) => {
                e.preventDefault();
                toggleMark(geoSchema.marks.em)(state, dispatchTransaction);
              }}
              title="Italic"
            >
              <em>I</em>
            </button>
            <div className="bubble-menu-separator" />
            <button
              className="bubble-menu-button"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsLocationModalOpen(true);
              }}
              title="Add Location"
            >
              📍
            </button>
            <button
              className="bubble-menu-button"
              onMouseDown={(e) => {
                e.preventDefault();
                removeGeoLocation();
              }}
              title="Remove Location"
            >
              ✕
            </button>
            <div className="bubble-menu-arrow" />
          </div>
        )}

        <ProseMirror
          mount={mount}
          state={state}
          dispatchTransaction={dispatchTransaction}
          handleDOMEvents={{
            focus: (view) => {
              setEditorView(view);
              return false;
            }
          }}
        >
          <div
            ref={setMount}
            className="test-prosemirror-editor"
            spellCheck={false}
          />
          <SelectionToolbar
            selection={currentSelection}
            editorView={editorView}
            onSuggestChange={handleSuggestChange}
          />
        </ProseMirror>
      </div>
    </div>
  );
  }
);

TestProseMirrorDOM.displayName = 'TestProseMirrorDOM';

export default TestProseMirrorDOM;
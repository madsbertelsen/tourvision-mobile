export default `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ProseMirror Editor</title>

  <!-- ProseMirror CDN -->
  <script src="https://cdn.jsdelivr.net/npm/prosemirror-model@1.19.4/dist/index.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prosemirror-state@1.4.3/dist/index.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prosemirror-view@1.32.7/dist/index.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prosemirror-keymap@1.2.2/dist/index.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prosemirror-history@1.3.2/dist/index.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prosemirror-commands@1.5.2/dist/index.js"></script>

  <style>
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-text-size-adjust: 100%;
    }

    /* Editor wrapper */
    .prosemirror-editor-wrapper {
      width: 100%;
      height: 100%;
      background-color: #ffffff;
      position: relative;
    }

    .prosemirror-viewer-container {
      width: 100%;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      background-color: #ffffff;
      -webkit-overflow-scrolling: touch;
    }

    .prosemirror-viewer {
      width: 100%;
      min-height: 100%;
      padding: 16px;
      padding-right: 20px;
      line-height: 1.6;
      color: #1f2937;
    }

    /* ProseMirror content */
    .ProseMirror {
      outline: none;
      width: 100%;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }

    /* Hide iOS keyboard accessory */
    .ProseMirror::-webkit-input-placeholder {
      color: transparent;
    }

    .prosemirror-viewer [contenteditable="true"] {
      -webkit-user-select: text;
      user-select: text;
    }

    @supports (-webkit-touch-callout: none) {
      .ProseMirror {
        -webkit-user-modify: read-write-plaintext-only;
      }

      .prosemirror-viewer [contenteditable] {
        -webkit-user-modify: read-write-plaintext-only;
      }
    }

    /* Block elements */
    .pm-paragraph {
      margin: 0 0 16px 0;
      transition: all 0.2s ease;
      padding: 0;
      border-left: 3px solid transparent;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .pm-heading {
      margin: 24px 0 16px 0;
      font-weight: 600;
      transition: all 0.2s ease;
      padding: 0;
      border-left: 3px solid transparent;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .pm-blockquote {
      margin: 16px 0;
      padding: 12px 20px;
      border-left: 4px solid #e5e7eb;
      background-color: #f9fafb;
      color: #6b7280;
      font-style: italic;
    }

    /* Heading levels */
    h1.pm-heading { font-size: 2em; }
    h2.pm-heading { font-size: 1.5em; }
    h3.pm-heading { font-size: 1.17em; }
    h4.pm-heading { font-size: 1em; }
    h5.pm-heading { font-size: 0.83em; }
    h6.pm-heading { font-size: 0.75em; }

    /* Lists */
    ul, ol {
      margin: 0 0 16px 0;
      padding: 0 0 0 24px;
    }

    li {
      margin: 4px 0;
    }

    /* Geo-marks */
    .pm-geo-mark {
      display: inline;
      padding: 2px 4px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      font-weight: 500;
    }

    .pm-geo-mark:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    /* Focus state */
    .pm-node-focused {
      background-color: transparent;
      border-left-color: transparent !important;
      box-shadow: none;
    }

    /* Smooth scrolling */
    .prosemirror-viewer-container {
      scroll-behavior: smooth;
    }

    /* Text formatting */
    strong, b { font-weight: 600; }
    em, i { font-style: italic; }

    /* Links */
    a {
      color: #3B82F6;
      text-decoration: underline;
      cursor: pointer;
    }

    a:hover {
      color: #2563eb;
    }
  </style>
</head>
<body>
  <div class="prosemirror-editor-wrapper">
    <div class="prosemirror-viewer-container" id="editor-container">
      <div class="prosemirror-viewer" id="editor"></div>
    </div>
  </div>

  <script>
    (function() {
      'use strict';

      // Access ProseMirror modules from global scope
      const { Schema } = window.PM.model;
      const { EditorState, Plugin } = window.PM.state;
      const { EditorView } = window.PM.view;
      const { keymap } = window.PM.keymap;
      const { history, undo, redo } = window.PM.history;
      const { baseKeymap } = window.PM.commands;

      console.log('[ProseMirror WebView] Initializing...');

      // Color palette for geo-marks
      const COLORS = [
        '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
      ];

      // Define schema (ported from prosemirror-schema.ts)
      const schema = new Schema({
        nodes: {
          doc: {
            content: "block+"
          },
          paragraph: {
            content: "inline*",
            group: "block",
            attrs: {
              id: { default: null }
            },
            parseDOM: [{
              tag: "p",
              getAttrs: function(dom) {
                return { id: dom.getAttribute("id") };
              }
            }],
            toDOM: function(node) {
              return ["p", node.attrs.id ? { id: node.attrs.id } : {}, 0];
            }
          },
          heading: {
            attrs: {
              level: { default: 1 },
              id: { default: null }
            },
            content: "inline*",
            group: "block",
            defining: true,
            parseDOM: [
              { tag: "h1", attrs: { level: 1 } },
              { tag: "h2", attrs: { level: 2 } },
              { tag: "h3", attrs: { level: 3 } },
              { tag: "h4", attrs: { level: 4 } },
              { tag: "h5", attrs: { level: 5 } },
              { tag: "h6", attrs: { level: 6 } }
            ],
            toDOM: function(node) {
              return ["h" + node.attrs.level, node.attrs.id ? { id: node.attrs.id } : {}, 0];
            }
          },
          geoMark: {
            inline: true,
            group: "inline",
            content: "text*",
            attrs: {
              lat: { default: null },
              lng: { default: null },
              placeName: { default: "" },
              geoId: { default: null },
              transportFrom: { default: null },
              transportProfile: { default: null },
              coordSource: { default: null },
              description: { default: null },
              photoName: { default: null },
              colorIndex: { default: 0 },
              waypoints: { default: null }
            },
            parseDOM: [{
              tag: "span.geo-mark",
              getAttrs: function(dom) {
                const waypointsStr = dom.getAttribute("data-waypoints");
                let waypoints = null;
                if (waypointsStr) {
                  try {
                    waypoints = JSON.parse(waypointsStr);
                  } catch (e) {
                    console.error('Failed to parse waypoints:', e);
                  }
                }

                return {
                  lat: dom.getAttribute("data-lat"),
                  lng: dom.getAttribute("data-lng"),
                  placeName: dom.getAttribute("data-place-name") || dom.textContent,
                  geoId: dom.getAttribute("data-geo-id"),
                  transportFrom: dom.getAttribute("data-transport-from"),
                  transportProfile: dom.getAttribute("data-transport-profile"),
                  coordSource: dom.getAttribute("data-coord-source"),
                  description: dom.getAttribute("data-description"),
                  photoName: dom.getAttribute("data-photo-name"),
                  colorIndex: dom.getAttribute("data-color-index") ? parseInt(dom.getAttribute("data-color-index")) : 0,
                  waypoints: waypoints
                };
              }
            }],
            toDOM: function(node) {
              const attrs = {
                class: "geo-mark",
                "data-geo": "true"
              };

              if (node.attrs.lat) attrs["data-lat"] = node.attrs.lat;
              if (node.attrs.lng) attrs["data-lng"] = node.attrs.lng;
              if (node.attrs.placeName) attrs["data-place-name"] = node.attrs.placeName;
              if (node.attrs.geoId) attrs["data-geo-id"] = node.attrs.geoId;
              if (node.attrs.transportFrom) attrs["data-transport-from"] = node.attrs.transportFrom;
              if (node.attrs.transportProfile) attrs["data-transport-profile"] = node.attrs.transportProfile;
              if (node.attrs.coordSource) attrs["data-coord-source"] = node.attrs.coordSource;
              if (node.attrs.description) attrs["data-description"] = node.attrs.description;
              if (node.attrs.photoName) attrs["data-photo-name"] = node.attrs.photoName;
              if (node.attrs.colorIndex !== undefined) attrs["data-color-index"] = node.attrs.colorIndex;
              if (node.attrs.waypoints) attrs["data-waypoints"] = JSON.stringify(node.attrs.waypoints);

              return ["span", attrs, 0];
            }
          },
          blockquote: {
            content: "block+",
            group: "block",
            defining: true,
            parseDOM: [{ tag: "blockquote" }],
            toDOM: function() { return ["blockquote", 0]; }
          },
          bulletList: {
            content: "listItem+",
            group: "block",
            parseDOM: [{ tag: "ul" }],
            toDOM: function() { return ["ul", 0]; }
          },
          orderedList: {
            content: "listItem+",
            group: "block",
            attrs: {
              order: { default: 1 }
            },
            parseDOM: [{
              tag: "ol",
              getAttrs: function(dom) {
                return { order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1 };
              }
            }],
            toDOM: function(node) {
              return node.attrs.order == 1 ? ["ol", 0] : ["ol", { start: node.attrs.order }, 0];
            }
          },
          listItem: {
            content: "paragraph block*",
            parseDOM: [{ tag: "li" }],
            toDOM: function() { return ["li", 0]; },
            defining: true
          },
          text: {
            group: "inline"
          },
          hardBreak: {
            inline: true,
            group: "inline",
            selectable: false,
            parseDOM: [{ tag: "br" }],
            toDOM: function() { return ["br"]; }
          }
        },
        marks: {
          bold: {
            parseDOM: [
              { tag: "strong" },
              { tag: "b" },
              { style: "font-weight", getAttrs: function(value) { return /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null; } }
            ],
            toDOM: function() { return ["strong", 0]; }
          },
          italic: {
            parseDOM: [
              { tag: "em" },
              { tag: "i" },
              { style: "font-style=italic" }
            ],
            toDOM: function() { return ["em", 0]; }
          },
          link: {
            attrs: {
              href: {},
              title: { default: null },
              target: { default: null }
            },
            inclusive: false,
            parseDOM: [{
              tag: "a[href]",
              getAttrs: function(dom) {
                return {
                  href: dom.getAttribute("href"),
                  title: dom.getAttribute("title"),
                  target: dom.getAttribute("target")
                };
              }
            }],
            toDOM: function(node) {
              const href = node.attrs.href;
              const title = node.attrs.title;
              const target = node.attrs.target;
              const attrs = { href: href };
              if (title) attrs.title = title;
              if (target) attrs.target = target;
              return ["a", attrs, 0];
            }
          }
        }
      });

      // Message passing to React Native
      function sendMessage(message) {
        try {
          const jsonMessage = JSON.stringify(message);

          // Try iOS webkit
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView) {
            window.webkit.messageHandlers.ReactNativeWebView.postMessage(jsonMessage);
            return;
          }

          // Try Android ReactNativeWebView
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(jsonMessage);
            return;
          }

          // Fallback to console
          console.log('[WebView Message]', jsonMessage);
        } catch (error) {
          console.error('[WebView] Error sending message:', error);
        }
      }

      // State management
      let editorView = null;
      let isEditable = false;
      let pendingSelection = null;
      let saveTimeout = null;
      let pendingSave = null;
      let isUpdating = false;

      // Debounced save
      function scheduleSave(doc) {
        pendingSave = doc.toJSON();

        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        saveTimeout = setTimeout(function() {
          if (pendingSave) {
            console.log('[ProseMirror WebView] Debounced save triggered');
            sendMessage({
              type: 'documentChange',
              doc: pendingSave
            });
            pendingSave = null;
          }
          saveTimeout = null;

          setTimeout(function() {
            isUpdating = false;
          }, 100);
        }, 1000);
      }

      // Flush pending saves
      function flushPendingSave() {
        if (pendingSave) {
          console.log('[ProseMirror WebView] Flushing pending save');
          sendMessage({
            type: 'documentChange',
            doc: pendingSave
          });
          pendingSave = null;
        }
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = null;
        }
      }

      // Custom node views
      function createNodeView(node, view, getPos) {
        const nodeType = node.type.name;

        // Geo-mark node view
        if (nodeType === 'geoMark') {
          const span = document.createElement('span');
          span.className = 'pm-geo-mark';

          if (node.attrs.geoId) {
            span.setAttribute('data-geo-id', node.attrs.geoId);
          }

          const colorIndex = node.attrs.colorIndex || 0;
          span.style.backgroundColor = COLORS[colorIndex % COLORS.length] + '33';
          span.title = node.attrs.placeName || 'Location';
          span.style.cursor = 'pointer';

          span.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (isEditable) {
              // In edit mode: show editor (not implemented in WebView yet)
              console.log('[ProseMirror WebView] Geo-mark edit clicked:', node.attrs.placeName);
            } else {
              // In read mode: navigate
              console.log('[ProseMirror WebView] Geo-mark navigate clicked:', node.attrs.placeName);
              sendMessage({
                type: 'geoMarkNavigate',
                attrs: node.attrs
              });
            }
          };

          return { dom: span, contentDOM: span };
        }

        // Block nodes with IDs
        if (nodeType === 'paragraph' || nodeType === 'heading' || nodeType === 'blockquote') {
          const tagName = nodeType === 'heading' ? ('h' + (node.attrs.level || 2)) :
                         nodeType === 'blockquote' ? 'blockquote' : 'p';
          const dom = document.createElement(tagName);

          if (node.attrs && node.attrs.id) {
            dom.setAttribute('data-node-id', node.attrs.id);
          }

          dom.className = 'pm-' + nodeType;

          return { dom: dom, contentDOM: dom };
        }

        return null;
      }

      // Create editor
      function initializeEditor(content) {
        console.log('[ProseMirror WebView] Initializing editor with content:', content);

        let doc;
        if (!content) {
          doc = schema.node('doc', null, [
            schema.node('paragraph', { id: 'empty-1' }, [])
          ]);
        } else {
          try {
            doc = schema.nodeFromJSON(content);
          } catch (error) {
            console.error('[ProseMirror WebView] Error parsing content:', error);
            doc = schema.node('doc', null, [
              schema.node('paragraph', { id: 'error-1' }, [schema.text('Error loading content')])
            ]);
          }
        }

        const state = EditorState.create({
          doc: doc,
          plugins: [
            history(),
            keymap({
              'Mod-z': undo,
              'Mod-y': redo,
              'Mod-Shift-z': redo
            }),
            keymap(baseKeymap),
            // Plugin to notify parent of selection changes
            new Plugin({
              view: function() {
                return {
                  update: function(view, prevState) {
                    const state = view.state;
                    if (!prevState.selection.eq(state.selection)) {
                      sendMessage({
                        type: 'selectionChange',
                        empty: state.selection.empty
                      });
                    }
                  }
                };
              }
            })
          ]
        });

        const editorElement = document.getElementById('editor');

        if (editorView) {
          editorView.destroy();
        }

        editorView = new EditorView(editorElement, {
          state: state,
          editable: function() { return isEditable; },
          nodeViews: {
            geoMark: createNodeView,
            paragraph: createNodeView,
            heading: createNodeView,
            blockquote: createNodeView
          },
          dispatchTransaction: function(tr) {
            const newState = editorView.state.apply(tr);
            editorView.updateState(newState);

            // Handle document changes
            if (isEditable && tr.docChanged) {
              isUpdating = true;
              scheduleSave(newState.doc);
            }
          }
        });

        console.log('[ProseMirror WebView] Editor initialized');
        sendMessage({ type: 'ready' });
      }

      // Handle messages from React Native
      window.addEventListener('message', function(event) {
        let data;
        try {
          data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch (error) {
          console.error('[ProseMirror WebView] Error parsing message:', error);
          return;
        }

        console.log('[ProseMirror WebView] Received message:', data);

        switch (data.type) {
          case 'setContent':
            if (isUpdating) {
              console.log('[ProseMirror WebView] Ignoring content update from own change');
              return;
            }

            if (editorView && data.content) {
              try {
                const newDoc = schema.nodeFromJSON(data.content);
                const newState = EditorState.create({
                  doc: newDoc,
                  schema: schema,
                  plugins: editorView.state.plugins
                });
                editorView.updateState(newState);
                console.log('[ProseMirror WebView] Content updated');
              } catch (error) {
                console.error('[ProseMirror WebView] Error setting content:', error);
              }
            }
            break;

          case 'setEditable':
            if (data.editable !== isEditable) {
              flushPendingSave();
            }
            isEditable = data.editable;
            if (editorView) {
              editorView.setProps({ editable: function() { return isEditable; } });
            }
            console.log('[ProseMirror WebView] Editable set to:', isEditable);
            break;

          case 'createGeoMark':
            if (editorView) {
              const state = editorView.state;
              const geoMarkData = data.geoMarkData;

              console.log('[ProseMirror WebView] Creating geo-mark:', geoMarkData);

              let tr = state.tr;

              if (pendingSelection) {
                // Replace selection with geo-mark
                const { from, to } = pendingSelection;
                const geoId = geoMarkData.geoId || 'loc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

                const geoMarkNode = schema.nodes.geoMark.create({
                  geoId: geoId,
                  placeName: geoMarkData.placeName,
                  lat: geoMarkData.lat,
                  lng: geoMarkData.lng,
                  description: geoMarkData.description || '',
                  colorIndex: geoMarkData.colorIndex || 0,
                  transportFrom: geoMarkData.transportFrom || null,
                  transportProfile: geoMarkData.transportProfile || 'walking',
                  waypoints: null
                }, [schema.text(geoMarkData.placeName)]);

                tr = tr.replaceWith(from, to, geoMarkNode);
                pendingSelection = null;
              } else {
                // Insert at end
                const endPos = state.doc.content.size;
                const geoId = geoMarkData.geoId || 'loc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

                const geoMarkNode = schema.nodes.geoMark.create({
                  geoId: geoId,
                  placeName: geoMarkData.placeName,
                  lat: geoMarkData.lat,
                  lng: geoMarkData.lng,
                  description: geoMarkData.description || '',
                  colorIndex: geoMarkData.colorIndex || 0,
                  transportFrom: geoMarkData.transportFrom || null,
                  transportProfile: geoMarkData.transportProfile || 'walking',
                  waypoints: null
                }, [schema.text(geoMarkData.placeName)]);

                const lastNode = state.doc.lastChild;

                if (lastNode && lastNode.type.name === 'paragraph' && lastNode.content.size === 0) {
                  tr = tr.insert(endPos - 1, geoMarkNode);
                } else {
                  const paraNode = schema.nodes.paragraph.create(
                    { id: 'node-' + Date.now() },
                    [geoMarkNode]
                  );
                  tr = tr.insert(endPos, paraNode);
                }
              }

              const newState = state.apply(tr);
              editorView.updateState(newState);

              // Immediately save
              sendMessage({
                type: 'documentChange',
                doc: newState.doc.toJSON()
              });

              console.log('[ProseMirror WebView] Geo-mark created successfully');
            }
            break;

          case 'command':
            if (editorView) {
              const command = data.command;
              console.log('[ProseMirror WebView] Executing command:', command);

              const state = editorView.state;
              const dispatch = function(tr) {
                const newState = editorView.state.apply(tr);
                editorView.updateState(newState);
              };

              switch (command) {
                case 'undo':
                  undo(state, dispatch);
                  break;
                case 'redo':
                  redo(state, dispatch);
                  break;
                case 'createGeoMark':
                  if (!state.selection.empty) {
                    pendingSelection = {
                      from: state.selection.from,
                      to: state.selection.to
                    };

                    // Count existing geo-marks
                    let geoMarkCount = 0;
                    const existingLocations = [];

                    state.doc.descendants(function(node) {
                      if (node.type.name === 'geoMark') {
                        geoMarkCount++;
                        if (node.attrs.geoId && node.attrs.placeName) {
                          existingLocations.push({
                            geoId: node.attrs.geoId,
                            placeName: node.attrs.placeName
                          });
                        }
                      }
                    });

                    const nextColorIndex = geoMarkCount % 10;
                    const selectedText = state.doc.textBetween(state.selection.from, state.selection.to, ' ');

                    sendMessage({
                      type: 'showGeoMarkEditor',
                      data: {
                        placeName: selectedText,
                        colorIndex: nextColorIndex
                      },
                      existingLocations: existingLocations
                    });
                  }
                  break;
                default:
                  console.warn('[ProseMirror WebView] Unknown command:', command);
              }
            }
            break;

          case 'scrollToNode':
            if (data.nodeId) {
              const element = document.querySelector('[data-node-id="' + data.nodeId + '"]');
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
            break;

          case 'getState':
            if (editorView) {
              sendMessage({
                type: 'stateResponse',
                state: editorView.state.doc.toJSON()
              });
            }
            break;

          default:
            console.warn('[ProseMirror WebView] Unknown message type:', data.type);
        }
      });

      // Handle iOS native menu messages
      window.addEventListener('message', function(event) {
        if (event.data && event.data.source === 'nativeMenu') {
          console.log('[ProseMirror WebView] Received native menu message:', event.data);

          const action = event.data.action;
          const data = event.data.data;

          if (action === 'createLocation' && data.selectedText && editorView) {
            const state = editorView.state;

            if (state.selection && !state.selection.empty) {
              pendingSelection = {
                from: state.selection.from,
                to: state.selection.to
              };

              let geoMarkCount = 0;
              const existingLocations = [];

              state.doc.descendants(function(node) {
                if (node.type.name === 'geoMark') {
                  geoMarkCount++;
                  if (node.attrs.geoId && node.attrs.placeName) {
                    existingLocations.push({
                      geoId: node.attrs.geoId,
                      placeName: node.attrs.placeName
                    });
                  }
                }
              });

              const nextColorIndex = geoMarkCount % 10;

              sendMessage({
                type: 'showGeoMarkEditor',
                data: {
                  placeName: data.selectedText,
                  colorIndex: nextColorIndex
                },
                existingLocations: existingLocations
              });
            }
          }
        }
      });

      // Cleanup on unload
      window.addEventListener('beforeunload', function() {
        flushPendingSave();
      });

      // Initialize with empty document
      initializeEditor(null);

      console.log('[ProseMirror WebView] Ready');
    })();
  </script>
</body>
</html>
`;

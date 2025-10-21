// ProseMirror Collaboration Plugin
// This plugin handles real-time collaboration with the WebSocket server

import { Plugin, PluginKey } from 'prosemirror-state';
import { Step } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';

const collabKey = new PluginKey('collab');

export class CollabConnection {
  constructor(socket, docId, userId, userName) {
    this.socket = socket;
    this.docId = docId;
    this.userId = userId;
    this.userName = userName;
    this.version = 0;
    this.doc = null;
    this.users = new Map();
    this.pendingSteps = [];
    this.view = null;
    this.isConnected = false;

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    // Initial document state
    this.socket.on('init', ({ version, doc, users }) => {
      console.log('[Collab] Received initial state, version:', version);
      this.version = version;
      this.doc = doc;

      // Store connected users
      users.forEach(user => {
        this.users.set(user.id, user);
      });

      this.isConnected = true;

      // Update the editor with the server document if needed
      if (this.view && doc) {
        this.updateEditorDoc(doc);
      }
    });

    // Receive steps from other users
    this.socket.on('steps', ({ steps, clientID, version }) => {
      console.log('[Collab] Received', steps.length, 'steps from', clientID);

      if (this.view) {
        this.receiveSteps(steps, clientID);
      }

      this.version = version;
    });

    // Handle step rejection (need to rebase)
    this.socket.on('steps-rejected', ({ currentVersion, steps }) => {
      console.log('[Collab] Steps rejected, need to rebase from version', currentVersion);
      this.version = currentVersion;

      // Reapply pending steps after rebasing
      if (this.pendingSteps.length > 0) {
        this.sendSteps(this.pendingSteps);
      }
    });

    // Step acceptance confirmation
    this.socket.on('steps-accepted', ({ version }) => {
      console.log('[Collab] Steps accepted, new version:', version);
      this.version = version;
      this.pendingSteps = [];
    });

    // User joined
    this.socket.on('user-joined', ({ userId, userName, userColor }) => {
      console.log('[Collab] User joined:', userName);
      this.users.set(userId, { id: userId, name: userName, color: userColor });

      // Trigger UI update if needed
      if (this.view) {
        this.view.dispatch(this.view.state.tr);
      }
    });

    // User left
    this.socket.on('user-left', ({ userId }) => {
      console.log('[Collab] User left:', userId);
      this.users.delete(userId);

      // Trigger UI update if needed
      if (this.view) {
        this.view.dispatch(this.view.state.tr);
      }
    });

    // Selection/cursor updates from other users
    this.socket.on('selection', ({ userId, userName, userColor, from, to }) => {
      if (this.view && userId !== this.userId) {
        this.updateUserCursor(userId, userName, userColor, from, to);
      }
    });

    // Connection error
    this.socket.on('error', (error) => {
      console.error('[Collab] Socket error:', error);
      this.isConnected = false;
    });

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('[Collab] Disconnected from server');
      this.isConnected = false;
    });
  }

  connect(view) {
    this.view = view;

    // Join the document room
    this.socket.emit('join-document', {
      documentId: this.docId,
      clientName: this.userName,
      initialDoc: view.state.doc.toJSON()
    });
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
    this.view = null;
    this.isConnected = false;
  }

  sendSteps(steps) {
    if (!this.isConnected) {
      console.warn('[Collab] Not connected, queuing steps');
      this.pendingSteps.push(...steps);
      return;
    }

    const serializedSteps = steps.map(step => step.toJSON());

    console.log('[Collab] Sending', steps.length, 'steps, version:', this.version);

    this.socket.emit('send-steps', {
      version: this.version,
      steps: serializedSteps,
      clientID: this.userId
    });

    // Store as pending until confirmed
    this.pendingSteps = steps;
  }

  receiveSteps(stepsJSON, clientID) {
    if (!this.view) return;

    try {
      const { state, dispatch } = this.view;
      const steps = stepsJSON.map(json => Step.fromJSON(state.schema, json));

      // Apply the steps to current state
      let tr = state.tr;
      steps.forEach(step => {
        const result = step.apply(tr.doc);
        if (result.failed) {
          console.error('[Collab] Failed to apply step:', result.failed);
          return;
        }
        tr.step(step);
      });

      // Mark as remote transaction so we don't send it back
      tr.setMeta('collab', {
        isRemote: true,
        clientID
      });

      dispatch(tr);
    } catch (error) {
      console.error('[Collab] Error applying received steps:', error);
    }
  }

  updateEditorDoc(docJSON) {
    if (!this.view) return;

    try {
      const { state, dispatch } = this.view;
      const doc = state.schema.nodeFromJSON(docJSON);

      const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
      tr.setMeta('collab', { isRemote: true, isInit: true });

      dispatch(tr);
    } catch (error) {
      console.error('[Collab] Error updating document:', error);
    }
  }

  sendSelection(from, to) {
    if (!this.isConnected) return;

    this.socket.emit('selection-changed', { from, to });
  }

  updateUserCursor(userId, userName, userColor, from, to) {
    if (!this.view) return;

    const { state, dispatch } = this.view;

    // Store cursor position in plugin state
    let tr = state.tr;
    tr.setMeta('collab', {
      cursorUpdate: {
        userId,
        userName,
        userColor,
        from,
        to
      }
    });

    dispatch(tr);
  }
}

export function createCollabPlugin(connection) {
  return new Plugin({
    key: collabKey,
    state: {
      init() {
        return {
          connection,
          cursors: new Map(),
          decorations: DecorationSet.empty
        };
      },
      apply(tr, value, oldState, newState) {
        // Handle cursor updates
        const cursorUpdate = tr.getMeta('collab')?.cursorUpdate;
        if (cursorUpdate) {
          value.cursors.set(cursorUpdate.userId, cursorUpdate);

          // Create cursor decorations
          const decorations = [];
          value.cursors.forEach((cursor, userId) => {
            if (userId !== value.connection.userId) {
              // Add cursor decoration
              if (cursor.from === cursor.to) {
                // Collapsed cursor (caret)
                const deco = Decoration.widget(cursor.from, () => {
                  const cursorEl = document.createElement('span');
                  cursorEl.className = 'collab-cursor';
                  cursorEl.style.borderLeftColor = cursor.userColor;
                  cursorEl.style.borderLeft = `2px solid ${cursor.userColor}`;
                  cursorEl.style.marginLeft = '-1px';
                  cursorEl.style.marginRight = '-1px';

                  const labelEl = document.createElement('span');
                  labelEl.className = 'collab-cursor-label';
                  labelEl.textContent = cursor.userName;
                  labelEl.style.backgroundColor = cursor.userColor;
                  labelEl.style.color = 'white';
                  labelEl.style.fontSize = '11px';
                  labelEl.style.padding = '2px 4px';
                  labelEl.style.borderRadius = '3px';
                  labelEl.style.position = 'absolute';
                  labelEl.style.bottom = '100%';
                  labelEl.style.left = '-2px';
                  labelEl.style.whiteSpace = 'nowrap';
                  labelEl.style.pointerEvents = 'none';

                  cursorEl.appendChild(labelEl);
                  return cursorEl;
                }, {
                  side: 1,
                  key: `cursor-${userId}`
                });
                decorations.push(deco);
              } else {
                // Selection range
                const deco = Decoration.inline(
                  cursor.from,
                  cursor.to,
                  {
                    style: `background-color: ${cursor.userColor}33;`, // 33 = 20% opacity
                    class: 'collab-selection'
                  },
                  { key: `selection-${userId}` }
                );
                decorations.push(deco);
              }
            }
          });

          value.decorations = DecorationSet.create(newState.doc, decorations);
        }

        // Send local changes to server
        const isRemote = tr.getMeta('collab')?.isRemote;
        if (!isRemote && tr.docChanged) {
          const steps = [];
          for (let i = 0; i < tr.steps.length; i++) {
            steps.push(tr.steps[i]);
          }

          if (steps.length > 0) {
            value.connection.sendSteps(steps);
          }
        }

        return value;
      }
    },
    props: {
      decorations(state) {
        const pluginState = collabKey.getState(state);
        return pluginState?.decorations || DecorationSet.empty;
      }
    },
    view(view) {
      const pluginState = collabKey.getState(view.state);
      const connection = pluginState?.connection;

      if (connection) {
        connection.connect(view);

        // Send selection changes
        let selectionTimeout;
        const handleSelectionChange = () => {
          clearTimeout(selectionTimeout);
          selectionTimeout = setTimeout(() => {
            const { from, to } = view.state.selection;
            connection.sendSelection(from, to);
          }, 100); // Debounce selection updates
        };

        // Listen for selection changes
        const originalUpdateState = view.updateState.bind(view);
        view.updateState = function(state) {
          originalUpdateState(state);
          handleSelectionChange();
        };
      }

      return {
        destroy() {
          if (connection) {
            connection.disconnect();
          }
        }
      };
    }
  });
}

// Helper function to initialize collaboration
export function initializeCollaboration(socket, docId, userId, userName) {
  const connection = new CollabConnection(socket, docId, userId, userName);
  const plugin = createCollabPlugin(connection);

  return {
    connection,
    plugin
  };
}

// Export for use in HTML bundle
if (typeof window !== 'undefined') {
  window.ProseMirrorCollab = {
    CollabConnection,
    createCollabPlugin,
    initializeCollaboration
  };
}
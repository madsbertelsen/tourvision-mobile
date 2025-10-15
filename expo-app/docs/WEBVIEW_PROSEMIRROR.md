# WebView + Vanilla JavaScript ProseMirror Approach

## Overview

This document describes the WebView-based ProseMirror implementation that works on iOS, Android, and Web without depending on:
- `@nytimes/react-prosemirror`
- Expo DOM components
- React-based ProseMirror wrappers

## Why This Approach?

### Problems with React + ProseMirror

1. **Re-render Issues**: React's reconciliation can conflict with ProseMirror's direct DOM manipulation
2. **Performance**: Extra layer of React state management adds overhead
3. **Cursor Jumping**: State updates can cause cursor position to reset
4. **Platform Limitations**: Expo DOM components only work on web and development builds

### Benefits of WebView Approach

1. **Platform Support**: Works on iOS, Android, and Web
2. **Performance**: ProseMirror runs in vanilla JavaScript without React overhead
3. **Stability**: No cursor jumping or re-render issues
4. **Independence**: No dependency on third-party React wrappers

## Architecture

### Components

```
┌─────────────────────────────────────────┐
│  React Native Component                 │
│  (prosemirror-test.tsx)                 │
│                                          │
│  - Manages UI controls                  │
│  - Handles message routing              │
│  - Persists data                        │
└──────────────┬──────────────────────────┘
               │
               │ Message Passing
               ├─ setContent
               ├─ setEditable
               ├─ createGeoMark
               ├─ documentChange
               ├─ selectionChange
               └─ geoMarkNavigate
               │
┌──────────────▼──────────────────────────┐
│  WebView                                 │
│  (ProseMirrorWebView.tsx)               │
│                                          │
│  - Bridge between RN and HTML           │
│  - Handles message serialization        │
│  - Platform-specific loading            │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  HTML + Vanilla JavaScript              │
│  (prosemirror-editor.html)              │
│                                          │
│  - ProseMirror editor instance          │
│  - Schema definition                    │
│  - Custom node views                    │
│  - Plugin system                        │
│  - Message handlers                     │
└─────────────────────────────────────────┘
```

## File Structure

```
expo-app/
├── assets/
│   └── prosemirror-editor.html       # Standalone ProseMirror HTML
├── components/
│   └── ProseMirrorWebView.tsx         # WebView wrapper
└── app/
    └── (mock)/
        └── prosemirror-test.tsx       # Test screen
```

## Message Protocol

### From React Native → WebView

```typescript
// Set content
{
  type: 'setContent',
  content: { type: 'doc', content: [...] }
}

// Toggle edit mode
{
  type: 'setEditable',
  editable: true | false
}

// Create geo-mark
{
  type: 'createGeoMark',
  geoMarkData: {
    geoId: string,
    placeName: string,
    lat: string,
    lng: string,
    colorIndex: number,
    ...
  }
}

// Execute command
{
  type: 'command',
  command: 'undo' | 'redo' | 'createGeoMark'
}

// Scroll to node
{
  type: 'scrollToNode',
  nodeId: string
}

// Get state
{
  type: 'getState'
}
```

### From WebView → React Native

```typescript
// Editor ready
{
  type: 'ready'
}

// Document changed
{
  type: 'documentChange',
  doc: { type: 'doc', content: [...] }
}

// Selection changed
{
  type: 'selectionChange',
  empty: boolean
}

// Show geo-mark editor
{
  type: 'showGeoMarkEditor',
  data: { placeName: string, colorIndex: number },
  existingLocations: Array<{ geoId: string, placeName: string }>
}

// Navigate to geo-mark
{
  type: 'geoMarkNavigate',
  attrs: { geoId, placeName, lat, lng, ... }
}

// State response
{
  type: 'stateResponse',
  state: { type: 'doc', content: [...] }
}
```

## Implementation Details

### HTML File Loading

The HTML file is loaded differently on each platform:

```typescript
// iOS
source={require('../assets/prosemirror-editor.html')}

// Android
source={{ uri: 'file:///android_asset/prosemirror-editor.html' }}

// Web
source={{ uri: 'prosemirror-editor.html' }}
```

### ProseMirror Schema

The schema is defined in vanilla JavaScript within the HTML file:

```javascript
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", attrs: { id: { default: null } } },
    heading: { attrs: { level: { default: 1 }, id: { default: null } }, ... },
    geoMark: { inline: true, attrs: { lat, lng, placeName, ... } },
    // ... other nodes
  },
  marks: {
    bold: { ... },
    italic: { ... },
    link: { ... }
  }
});
```

### Debounced Saves

Changes are debounced to reduce message traffic:

```javascript
function scheduleSave(doc) {
  pendingSave = doc.toJSON();

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(function() {
    if (pendingSave) {
      sendMessage({
        type: 'documentChange',
        doc: pendingSave
      });
      pendingSave = null;
    }
  }, 1000);
}
```

### Flush on Mode Change

When switching from edit to read mode, pending saves are flushed immediately:

```javascript
function flushPendingSave() {
  if (pendingSave) {
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
```

### Custom Node Views

Geo-marks and other nodes have custom renderers:

```javascript
function createNodeView(node, view, getPos) {
  if (node.type.name === 'geoMark') {
    const span = document.createElement('span');
    span.className = 'pm-geo-mark';
    span.style.backgroundColor = COLORS[node.attrs.colorIndex % 10] + '33';

    span.onclick = function(e) {
      if (isEditable) {
        // Show editor
      } else {
        // Navigate
        sendMessage({
          type: 'geoMarkNavigate',
          attrs: node.attrs
        });
      }
    };

    return { dom: span, contentDOM: span };
  }
  // ... other node views
}
```

## Testing the Implementation

### 1. Navigate to Test Screen

From the main screen, tap the "Test Editor" button in the header.

### 2. Test Features

- **Edit Mode**: Toggle between read and edit modes
- **Text Editing**: Type and edit content in edit mode
- **Geo-Mark Navigation**: Click locations in read mode to trigger navigation
- **Create Location**: Select text and tap "Create Location" in edit mode
- **Persistence**: Changes are saved with 1-second debounce

### 3. Verify on Different Platforms

- **iOS Device**: Build and test on physical device
- **Android Device**: Build and test on physical device
- **Web**: Test in browser (works but shows WebView instead of native DOM)

## Differences from DOM Component Approach

| Feature | DOM Component | WebView |
|---------|--------------|---------|
| Platform Support | Web + Dev Builds only | iOS, Android, Web |
| React Integration | Native React components | Message passing |
| Performance | Can have re-render issues | No React overhead |
| Debugging | React DevTools | Chrome DevTools (port 8083) |
| File Structure | Components in `/components/dom/` | Single HTML file |
| Dependencies | @nytimes/react-prosemirror | None (vanilla JS) |

## Future Enhancements

1. **Rich Text Formatting**: Add bold, italic, links via toolbar
2. **Offline Support**: Cache editor HTML for offline use
3. **Collaborative Editing**: Add Y.js for real-time collaboration
4. **Advanced Node Types**: Days, transportation, group splits
5. **Image Support**: Upload and embed images in document
6. **Export**: PDF, Markdown, JSON export functionality

## Troubleshooting

### WebView Not Loading

**Problem**: Blank screen or loading indicator forever

**Solutions**:
- Check console for errors
- Verify HTML file exists in `assets/` folder
- Try clearing Metro cache: `npx expo start --clear`
- Check file permissions on HTML file

### Messages Not Being Received

**Problem**: Typing in editor but no changes persisted

**Solutions**:
- Check browser console for `[ProseMirror WebView]` logs
- Verify `onMessage` handler is registered
- Check message format matches protocol
- Ensure JSON.stringify doesn't fail on circular refs

### Cursor Jumping

**Problem**: Cursor resets to beginning while typing

**Solutions**:
- Check if content is being updated from external source
- Verify `isUpdating` flag prevents echo updates
- Ensure debounce timeout is long enough (1000ms)
- Check that external updates don't happen during editing

### Platform-Specific Issues

**iOS**:
- Use `window.webkit.messageHandlers.ReactNativeWebView.postMessage`
- Require the HTML file: `require('../assets/prosemirror-editor.html')`

**Android**:
- Use `window.ReactNativeWebView.postMessage`
- Use asset URI: `file:///android_asset/prosemirror-editor.html`

**Web**:
- Fall back to console.log for debugging
- Use relative URI: `prosemirror-editor.html`

## Related Documentation

- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [React Native WebView](https://github.com/react-native-webview/react-native-webview)
- [Expo Asset Loading](https://docs.expo.dev/versions/latest/sdk/asset/)

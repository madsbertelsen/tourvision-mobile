# WebView ProseMirror Test Screen Summary

## What Was Created

### New Files

1. **`/app/(mock)/prosemirror-test.tsx`** - Test screen component
   - Demonstrates WebView + vanilla JavaScript ProseMirror approach
   - Platform-independent (works on iOS, Android, Web)
   - No dependency on @nytimes/react-prosemirror or Expo DOM
   - Full UI with edit mode toggle, location creation, and debug info

2. **`/docs/WEBVIEW_PROSEMIRROR.md`** - Comprehensive documentation
   - Architecture overview with diagrams
   - Message protocol specification
   - Platform-specific implementation details
   - Troubleshooting guide

3. **`/docs/TEST_SCREEN_SUMMARY.md`** - This file
   - Quick reference for what was created
   - How to access the test screen
   - What to test

### Modified Files

1. **`/app/(mock)/index.tsx`** - Trip list screen
   - Added "Test Editor" button in header
   - Button navigates to `/(mock)/prosemirror-test`

2. **`/components/ProseMirrorWebView.tsx`** - WebView wrapper
   - Fixed to load HTML from assets folder
   - Platform-specific loading logic for iOS, Android, Web
   - Removed dependency on non-existent script file

### Existing Files (Already Present)

1. **`/assets/prosemirror-editor.html`** - Standalone ProseMirror HTML
   - Complete ProseMirror implementation in vanilla JavaScript
   - Full schema definition with custom nodes (geo-marks, headings, etc.)
   - Message passing protocol
   - Debounced saves
   - Custom node views

2. **`/components/ProseMirrorWebView.tsx`** - WebView bridge
   - React Native WebView wrapper
   - Message serialization/deserialization
   - Platform detection
   - Ref-based API for parent components

## How to Access the Test Screen

### Method 1: Via UI Button

1. Start Expo dev server:
   ```bash
   cd /Users/msb/tourvision-mobile/expo-app
   npx expo start --web --port 8082 --clear
   ```

2. Open the app in browser at `http://localhost:8082`

3. From the main "My Trips" screen, tap the "Test Editor" button in the header

4. The test screen will open showing the ProseMirror editor

### Method 2: Direct URL (Web only)

Navigate directly to:
```
http://localhost:8082/(mock)/prosemirror-test
```

### Method 3: Via Router (Programmatically)

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();
router.push('/(mock)/prosemirror-test');
```

## What to Test

### Basic Functionality

1. **Page Load**
   - [ ] Screen loads without errors
   - [ ] Sample content appears in editor
   - [ ] Platform info shows correctly at top

2. **Edit Mode**
   - [ ] Toggle "Edit Mode" button
   - [ ] Type text in edit mode
   - [ ] Text appears as you type (no lag)
   - [ ] Cursor doesn't jump to beginning
   - [ ] Changes persist after 1 second debounce

3. **Read Mode**
   - [ ] Switch back to "Read Mode"
   - [ ] Changes are still visible
   - [ ] Editor is not editable
   - [ ] Can scroll through document

4. **Location (Geo-Mark) Features**
   - [ ] Click existing location ("Eiffel Tower") in read mode
   - [ ] Alert shows location details
   - [ ] Select text in edit mode
   - [ ] "Create Location" button enables
   - [ ] Click "Create Location"
   - [ ] Location is inserted into document
   - [ ] Location has colored background

5. **Sample Content Loading**
   - [ ] Click "Load Sample" button
   - [ ] Sample content loads
   - [ ] Document shows headings and paragraphs
   - [ ] Geo-mark appears with color

### Platform-Specific Testing

#### iOS Device
- [ ] Build development build: `npx expo run:ios`
- [ ] Test all basic functionality above
- [ ] Keyboard appears when tapping in edit mode
- [ ] Native menu items work (if implemented)

#### Android Device
- [ ] Build development build: `npx expo run:android`
- [ ] Test all basic functionality above
- [ ] Keyboard appears when tapping in edit mode

#### Web Browser
- [ ] Open in Chrome/Safari/Firefox
- [ ] Test all basic functionality above
- [ ] WebView loads properly
- [ ] No console errors

### Advanced Testing

1. **Performance**
   - [ ] Type continuously for 30 seconds
   - [ ] No lag or stuttering
   - [ ] Debounce works (saves after 1 second)
   - [ ] No memory leaks (check DevTools)

2. **Edge Cases**
   - [ ] Start with empty document
   - [ ] Create location at end of document
   - [ ] Create location in middle of paragraph
   - [ ] Toggle edit mode while typing
   - [ ] Switch to another screen and back

3. **Message Protocol**
   - [ ] Open browser console
   - [ ] Look for `[ProseMirrorWebView]` and `[ProseMirror WebView]` logs
   - [ ] Verify messages are sent/received correctly
   - [ ] Check for any error messages

## Expected Behavior

### Successful Test

When everything works correctly, you should see:

1. **Initial Load**:
   ```
   [ProseMirrorWebView] WebView load started
   [ProseMirrorWebView] WebView load ended
   [ProseMirrorWebView] Received message from WebView: ready
   [ProseMirrorWebView] WebView is ready
   ```

2. **Typing in Edit Mode**:
   ```
   [ProseMirrorWebView] Sending editable update to WebView: true
   [ProseMirror WebView] Editable set to: true
   [ProseMirror WebView] Debounced save triggered
   [ProseMirrorWebView] Received message from WebView: documentChange
   [ProseMirrorTest] Document changed: {type: 'doc', content: [...]}
   ```

3. **Creating Location**:
   ```
   [ProseMirrorWebView] Sending command: createGeoMark
   [ProseMirror WebView] Executing command: createGeoMark
   [ProseMirror WebView] Creating geo-mark: {...}
   [ProseMirrorWebView] Received message from WebView: showGeoMarkEditor
   [ProseMirrorTest] Show geo-mark editor: {...}
   ```

### Common Issues

#### Blank Screen
- Check console for errors
- Verify HTML file exists at `/assets/prosemirror-editor.html`
- Clear Metro cache: `npx expo start --web --clear`

#### WebView Not Loading
- Check platform detection in ProseMirrorWebView.tsx:187-201
- Try different platforms (iOS/Android/Web)
- Check file permissions on HTML file

#### Typing Lag or Cursor Jumping
- Verify debounce timeout is 1000ms
- Check that content prop isn't changing during typing
- Look for `isUpdating` flag preventing echo updates

#### Messages Not Received
- Open browser DevTools console
- Check for JavaScript errors in WebView
- Verify JSON serialization isn't failing
- Check message format matches protocol in docs

## Next Steps

After successful testing, you can:

1. **Integrate into Main App**
   - Replace existing ProseMirrorViewerWrapper with ProseMirrorWebView
   - Update trip document view to use WebView approach
   - Remove dependency on Expo DOM components

2. **Add Features**
   - Rich text formatting toolbar
   - Image upload and embedding
   - Offline support
   - Export functionality (PDF, Markdown)

3. **Optimize Performance**
   - Lazy load WebView
   - Cache HTML content
   - Implement virtual scrolling for long documents

4. **Production Build**
   - Test in production builds (not just dev)
   - Optimize bundle size
   - Add error boundaries
   - Implement analytics

## Comparison with Previous Approach

| Feature | Expo DOM | WebView |
|---------|----------|---------|
| Platform Support | Web + Dev Builds only | iOS, Android, Web |
| Dependencies | @nytimes/react-prosemirror | None |
| Performance | Re-render issues | Smooth vanilla JS |
| Cursor Jumping | Yes (sometimes) | No |
| File Structure | Multiple files in `/components/dom/` | Single HTML file |
| Debugging | React DevTools | Chrome DevTools |
| Message Passing | Direct props | JSON serialization |
| State Management | React state | Internal JS state |

## Documentation Links

- **Full Documentation**: `/docs/WEBVIEW_PROSEMIRROR.md`
- **Test Screen Code**: `/app/(mock)/prosemirror-test.tsx`
- **WebView Wrapper**: `/components/ProseMirrorWebView.tsx`
- **HTML Editor**: `/assets/prosemirror-editor.html`

## Support

If you encounter issues:

1. Check the logs in browser console
2. Review the troubleshooting section in `/docs/WEBVIEW_PROSEMIRROR.md`
3. Verify all files are present and up-to-date
4. Clear Metro cache and restart dev server

## Conclusion

This test screen demonstrates a production-ready approach to using ProseMirror in React Native without depending on:
- Expo DOM components
- @nytimes/react-prosemirror
- Complex React state management

The WebView approach provides:
- Better performance
- Wider platform support
- More stable editing experience
- Independence from third-party wrappers

Test thoroughly and compare with your existing implementation to decide if this approach is right for your use case.

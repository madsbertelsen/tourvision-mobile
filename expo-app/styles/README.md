# Shared ProseMirror Styles

This directory contains the shared style configuration used by both the React Native renderer and the ProseMirror WebView.

## Overview

The ProseMirror editor can be rendered in two ways:
1. **WebView (Edit Mode)** - ProseMirror running in a WebView with CSS styles
2. **React Native (Read Mode)** - Native React Native components with StyleSheet

To ensure visual consistency, both renderers use styles generated from a single shared configuration.

## Architecture

```
styles/prose-styles.ts
├── PROSE_STYLES (config object)
├── toReactNativeStyles() (generates RN styles)
└── toCSS() (generates CSS string)
```

### File Structure

- **`prose-styles.ts`** - Single source of truth for all prose styling
  - `PROSE_STYLES` - Base configuration object with all style values
  - `toReactNativeStyles()` - Converts config to React Native StyleSheet format
  - `toCSS()` - Generates CSS string for ProseMirror WebView

## Usage

### React Native Renderer

```typescript
import { PROSE_STYLES, toReactNativeStyles } from '@/styles/prose-styles';

// Get React Native-compatible styles
const proseStyles = toReactNativeStyles(PROSE_STYLES);

const styles = StyleSheet.create({
  paragraph: proseStyles.paragraph,
  h1: proseStyles.h1,
  geoMark: proseStyles.geoMark,
  // ... other styles
});
```

### ProseMirror WebView

The WebView automatically injects the shared CSS when it loads:

```typescript
// In ProseMirrorWebView.tsx
import { PROSE_STYLES, toCSS } from '@/styles/prose-styles';

// When WebView is ready
const sharedCSS = toCSS(PROSE_STYLES);
webView.injectJavaScript(`
  let styleEl = document.createElement('style');
  styleEl.textContent = ${JSON.stringify(sharedCSS)};
  document.head.appendChild(styleEl);
`);
```

## Modifying Styles

To change any prose styling, edit the `PROSE_STYLES` object in `prose-styles.ts`:

```typescript
export const PROSE_STYLES: ProseStyleConfig = {
  paragraph: {
    fontSize: 16,        // ← Change here
    color: '#000000',
    lineHeight: 24,
    marginTop: 16,
    marginBottom: 16,
  },
  // ... other styles
};
```

Both the React Native renderer and WebView will automatically use the updated styles.

## Style Categories

### Typography
- `paragraph` - Base paragraph styles
- `h1`, `h2`, `h3` - Heading styles

### Inline Marks
- `bold` - Bold text
- `italic` - Italic text
- `code` - Inline code
- `geoMark` - Location links with underline

### Lists
- `bulletList`, `orderedList` - List containers
- `listItem` - Individual list items
- `bullet` - Bullet character styling

## Benefits

1. **Single Source of Truth** - All styles defined in one place
2. **Type Safety** - TypeScript ensures consistency
3. **No Build Step** - Dynamic injection means no compilation needed
4. **Automatic Sync** - Changes immediately affect both renderers
5. **Easy Maintenance** - Update once, applies everywhere

## Converting Values

### Margins & Padding

React Native uses unitless numbers (defaults to dp/px):
```typescript
marginTop: 16  // 16 density-independent pixels
```

CSS requires units:
```css
margin-top: 16px
```

The `toCSS()` function automatically adds `px` units.

### Em-based Sizing

Some styles use em-based sizing from HTML defaults:
- h1: 2em → 32px (at 16px base)
- h2: 1.5em → 24px
- p: 1em → 16px

The config uses pixel values directly for consistency.

### Property Names

React Native uses camelCase, CSS uses kebab-case:
- `marginTop` (RN) → `margin-top` (CSS)
- `backgroundColor` (RN) → `background-color` (CSS)

The conversion functions handle this automatically.

## Testing

To verify styles match between renderers:

1. Navigate to prosemirror-test screen
2. Add sample content with headings, paragraphs, geo-marks, lists
3. Toggle between Edit Mode (WebView) and Read Mode (Native)
4. Verify that all elements look identical

## Future Improvements

- Add more style properties (blockquotes, horizontal rules, etc.)
- Support theme variants (dark mode, high contrast)
- Add runtime style overrides
- Generate TypeScript types from config

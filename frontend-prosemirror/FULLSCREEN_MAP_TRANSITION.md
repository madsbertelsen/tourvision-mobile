# Fullscreen Map Transition

## Overview

The fullscreen map transition is a visual effect that seamlessly expands a map from its container to fill the entire viewport while keeping location markers in their exact screen positions. This creates an intuitive "zoom out" effect where the user's focus point (the markers) stays stationary while the surrounding map area is revealed.

## Visual Behavior

When the user clicks on a map in a container:

1. **Initial State**: Map displayed in a container (e.g., 800px wide, 50vh tall) showing specific geographic bounds
2. **Transition Begins**: Fullscreen overlay appears with semi-transparent backdrop
3. **Map Expands**: The map fills the entire viewport (100vw × 100vh)
4. **Markers Stay Put**: Location markers remain in the exact same screen coordinates
5. **Surrounding Area Revealed**: Additional map area becomes visible around the original view

This approach feels natural because the user's point of reference (the markers) doesn't move, reducing cognitive load.

## Technical Concept

### The Challenge

When transitioning from a small map to fullscreen:
- The small map shows specific geographic bounds in a limited screen area
- The fullscreen map must show the same bounds in the same screen position
- Additional map area must be revealed around the original view

### The Solution: Padding-Based Alignment

The key insight is to use **padding** to position the geographic bounds within the fullscreen viewport.

```
┌─────────────────────────────────────────┐
│                                         │ ← Top padding
│         ┌─────────────────┐             │
│ Left    │   Original      │   Right     │
│ padding │   Map Bounds    │   padding   │
│         └─────────────────┘             │
│                                         │ ← Bottom padding
└─────────────────────────────────────────┘
      Fullscreen Map (100vw × 100vh)
```

The padding values are calculated from the original map's screen position:
- **Top padding** = Distance from viewport top to map top
- **Left padding** = Distance from viewport left to map left
- **Right padding** = Distance from map right to viewport right
- **Bottom padding** = Distance from map bottom to viewport bottom

## Implementation Details

### CSS Structure

```css
/* Fullscreen overlay - fills entire viewport */
#fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
}

/* Semi-transparent backdrop */
.backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.55);
}

/* Map container - fills entire viewport */
#fullscreen-map-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10002;
}

/* Map element - fills container */
#fullscreen-map {
  width: 100vw;
  height: 100vh;
}
```

### JavaScript Implementation

```javascript
function openFullscreenMap() {
  // 1. Get current geographic bounds from block map
  const bounds = blockMap.getBounds();

  // 2. Get block map's screen position
  const blockMapElement = document.getElementById('block-map');
  const rect = blockMapElement.getBoundingClientRect();

  // 3. Calculate padding to align markers
  const padding = {
    top: rect.top,
    left: rect.left,
    right: window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom
  };

  // 4. Create fullscreen map with same bounds and padding
  fullscreenMap = new mapboxgl.Map({
    container: 'fullscreen-map',
    style: 'mapbox://styles/mapbox/light-v11',
    bounds: bounds,
    fitBoundsOptions: {
      padding: padding,
      duration: 0  // No animation on initial render
    }
  });

  // 5. Add markers at same geographic coordinates
  locations.forEach((location) => {
    new mapboxgl.Marker(createMarkerElement(location.colorIndex))
      .setLngLat([location.lng, location.lat])
      .addTo(fullscreenMap);
  });
}
```

## Key Features

### 1. **Container-Based Positioning**
The fullscreen container fills the entire viewport from the start. No complex positioning calculations needed.

### 2. **Padding-Based Alignment**
Mapbox's `fitBounds` with padding automatically positions the geographic bounds in the correct screen location.

### 3. **No Manual Coordinate Translation**
The map library handles all coordinate-to-screen transformations. We only specify bounds and padding.

### 4. **Shared Geographic Bounds**
Both maps use the same geographic bounds, ensuring identical marker positions.

### 5. **Simplicity**
This approach is much simpler than alternatives like:
- Manually translating coordinates
- Using CSS transforms to scale/position
- Calculating pixel offsets for markers

## Step-by-Step Flow

### Initialization
1. Block map loads with specific bounds (e.g., Copenhagen to Svendborg)
2. Markers added at geographic coordinates
3. User sees map in container with markers

### Transition
1. User clicks map
2. JavaScript gets current bounds from block map
3. JavaScript calculates block map's screen rect
4. Padding calculated from rect: `{top, left, right, bottom}`
5. Fullscreen overlay becomes visible
6. Fullscreen map created with:
   - Same geographic bounds
   - Padding to position bounds at same screen location
   - Same markers at same coordinates

### Result
- Markers appear in exact same screen positions
- Additional map area visible around original view
- User can interact with fullscreen map (pan, zoom)
- Close button returns to original view

## Code Example: Calculating Padding

```javascript
// Get block map's position on screen
const rect = blockMapElement.getBoundingClientRect();
// Example: rect = { top: 100, left: 200, width: 800, height: 400 }

// Viewport dimensions
const viewportWidth = window.innerWidth;   // e.g., 1920
const viewportHeight = window.innerHeight; // e.g., 1080

// Calculate padding
const padding = {
  top: rect.top,                              // 100
  left: rect.left,                            // 200
  right: viewportWidth - rect.right,          // 1920 - 1000 = 920
  bottom: viewportHeight - rect.bottom        // 1080 - 500 = 580
};

// When fitBounds applies these padding values:
// - The map bounds will occupy a 800×400 area
// - Starting at (200, 100) from top-left of viewport
// - Exactly where the block map was
```

## Visual Diagram

```
Original Map in Container:
┌─────────────────────────────────────────┐
│  Viewport (1920 × 1080)                 │
│                                         │
│    ┌──────────────────────┐             │
│    │                      │             │
│    │   Block Map          │             │
│    │   (800 × 400)        │             │
│    │                      │             │
│    │   📍 Copenhagen      │             │
│    │                      │             │
│    │            📍        │             │
│    │            Svendborg │             │
│    │                      │             │
│    └──────────────────────┘             │
│                                         │
└─────────────────────────────────────────┘

Fullscreen Map with Padding:
┌─────────────────────────────────────────┐
│  Fullscreen Overlay (1920 × 1080)       │
│  ╔═══════════════════════════════════╗  │
│  ║ Top Padding (100px)               ║  │
│  ║   ┌──────────────────────┐        ║  │
│  ║ L │ Original Bounds      │ Right  ║  │
│  ║ e │ (800 × 400)          │ Pad    ║  │
│  ║ f │                      │ (920)  ║  │
│  ║ t │ 📍 Copenhagen        │        ║  │
│  ║   │                      │        ║  │
│  ║ P │            📍        │        ║  │
│  ║ a │            Svendborg │        ║  │
│  ║ d │                      │        ║  │
│  ║   └──────────────────────┘        ║  │
│  ║ (200)                             ║  │
│  ║ Bottom Padding (580px)            ║  │
│  ╚═══════════════════════════════════╝  │
│         Additional map area revealed    │
└─────────────────────────────────────────┘
```

## Benefits

1. **Visual Continuity**: Markers don't jump, reducing disorientation
2. **Context Preservation**: User knows exactly where they are
3. **Simple Implementation**: Library handles complexity
4. **Performant**: No frame-by-frame animation calculations
5. **Responsive**: Works with any container size or viewport
6. **Maintainable**: Clear separation between layout (CSS) and behavior (JS)

## Alternative Approaches (Not Used)

### ❌ Center-Based Positioning
```javascript
// Bad: Centers the map, markers jump around
fullscreenMap = new mapboxgl.Map({
  center: blockMap.getCenter(),
  zoom: blockMap.getZoom()
});
```
**Problem**: Markers appear in different screen positions.

### ❌ CSS Transforms
```javascript
// Bad: Complex coordinate math
container.style.transform = `scale(2.5) translate(...)`;
```
**Problem**: Requires manual calculation of scale and translation values.

### ❌ Negative Margins
```css
/* Bad: Clips content, hard to debug */
#fullscreen-map-container {
  overflow: hidden;
  width: 800px;
  height: 400px;
}
#fullscreen-map {
  margin-top: -100px;
  margin-left: -200px;
  /* ... */
}
```
**Problem**: `overflow: hidden` clips the extended map.

## Usage in Other Components

This pattern can be applied to any map component:

```javascript
// Generic helper function
function calculateAlignmentPadding(sourceElement) {
  const rect = sourceElement.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom
  };
}

// Usage
const padding = calculateAlignmentPadding(mapElement);
fullscreenMap.fitBounds(bounds, { padding });
```

## Testing

Open `test-fullscreen-map.html` to see the transition in action:

1. Two markers visible in block map (Copenhagen, Svendborg)
2. Click anywhere on the map
3. Observe markers stay in exact same screen position
4. Notice surrounding area revealed
5. Click close button to return

## Future Enhancements

- Add smooth animation between block and fullscreen views
- Support mobile touch gestures
- Add route visualization in fullscreen mode
- Implement pinch-to-zoom for progressive reveal
- Add transition callbacks for custom behaviors

## Related Files

- **Implementation**: `/agent-poc/test-fullscreen-map.html`
- **Production Component**: `/expo-app/components/DocumentSplitMap.tsx` (to be updated)
- **Test Cases**: Manual testing via test-fullscreen-map.html

## Commit History

- `c315611` - Fix: Make fullscreen map fill viewport with proper marker alignment
- Previous iterations using negative margin approach (deprecated)

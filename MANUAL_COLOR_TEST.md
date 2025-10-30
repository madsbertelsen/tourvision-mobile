# Manual Color Verification Test

## What Was Fixed

The `COLORS` array in `/expo-app/components/DocumentSplitMap.tsx` (line 21-23) was corrected from:

```javascript
// WRONG ORDER
const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'
  // Blue,    Green,    Orange,   Red,      Purple
];
```

To:

```javascript
// CORRECT ORDER
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'
  // Blue,    Purple,   Green,    Orange,   Red
];
```

## How to Verify the Fix

1. **Open the app**: Navigate to http://localhost:8082 in your browser

2. **Create/Open a document**: Click "New Document" or open an existing trip document

3. **Add Paris**:
   - Type some text mentioning "Paris"
   - Select the word "Paris"
   - Click the 📍 location button in the toolbar
   - Click "Continue" and then "Add to Document"
   - **Expected**: Paris should appear with a BLUE background in the document (#3B82F6)
   - **Expected**: Paris marker on map should be BLUE

4. **Add Brussels**:
   - Type text mentioning "Brussels"
   - Select the word "Brussels"
   - Click the 📍 location button
   - Click "Continue" and then "Add to Document"
   - **Expected**: Brussels should appear with a PURPLE background in the document (#8B5CF6, 20% opacity)
   - **Expected**: Brussels marker on map should be PURPLE

5. **Verify Color Indices**:
   - Paris (colorIndex: 0) → Blue (#3B82F6) ✓
   - Brussels (colorIndex: 1) → Purple (#8B5CF6) ✓

## Before the Fix

Brussels would show with a GREEN marker instead of PURPLE because:
- colorIndex 1 → COLORS[1] → '#10B981' (Green) ❌

## After the Fix

Brussels now correctly shows PURPLE:
- colorIndex 1 → COLORS[1] → '#8B5CF6' (Purple) ✓

## RGB Color References

For console/inspector verification:
- Blue: `rgb(59, 130, 246)` or `#3B82F6`
- Purple: `rgb(139, 92, 246)` or `#8B5CF6`
- Green: `rgb(16, 185, 129)` or `#10B981`

Open browser DevTools and inspect the geo-mark elements and map markers to verify the computed background-color/fill values match the expected colors.

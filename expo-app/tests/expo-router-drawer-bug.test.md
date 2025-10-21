# Expo Router Drawer Navigation Bug Test

## Issue Summary
When navigating between trips using the Expo Router drawer navigation, the URL updates correctly but the layout component does not receive the updated route parameters. This causes the document content to not update when switching between trips.

## Test Results

### Test Setup
- Browser: Chrome (via Playwright)
- Environment: Local development server (http://localhost:8081)
- Expo Router: Using `<Drawer>` component with dynamic routes

### Test Case 1: Navigate to First Trip
**Action**: Click on first trip card in drawer
**Expected URL**: `/trip/trip-1761031130829-aw6ivrihc`
**Actual URL**: `/trip/trip-1761031130829-aw6ivrihc` ✅

**Expected TripLayout tripId**: `trip-1761031130829-aw6ivrihc`
**Actual TripLayout tripId**: `trip-1761031130829-aw6ivrihc` ✅

**Document Content**: " TEST ", "sdfsdf", "sdf" ✅

### Test Case 2: Navigate to Second Trip
**Action**: Click on second trip card in drawer
**Expected URL**: `/trip/trip-1761031111937-2thjmh0iw`
**Actual URL**: `/trip/trip-1761031111937-2thjmh0iw` ✅

**Expected TripLayout tripId**: `trip-1761031111937-2thjmh0iw`
**Actual TripLayout tripId**: `trip-1761031130829-aw6ivrihc` ❌ (WRONG! Still showing first trip ID)

**Expected Document Content**: Content from second trip
**Actual Document Content**: " TEST ", "sdfsdf", "sdf" ❌ (WRONG! Still showing first trip content)

## Evidence from Console Logs

### When clicking second trip:
```
[LOG] [TripLayout] Component rendering with tripId: trip-1761031130829-aw6ivrihc
```

**Issue**: The TripLayout component is still rendering with the OLD tripId even though:
1. The URL changed to the new trip ID
2. The navigation was triggered via `router.push({ pathname: '/(mock)/trip/[id]', params: { id: tripId } })`

### What should happen:
1. URL changes ✅
2. `useLocalSearchParams()` in TripLayout detects the param change ❌
3. `tripId` variable updates to new value ❌
4. `useEffect` with `[tripId]` dependency triggers ❌
5. New trip data loads and document updates ❌

### What actually happens:
1. URL changes ✅
2. `useLocalSearchParams()` does NOT emit a new value ❌
3. Layout component keeps the old tripId
4. No re-render with new data
5. Document stays the same

## Code Configuration

### Navigation Code (`app/(mock)/_layout.tsx`)
```typescript
const handleTripSelect = (tripId: string, initialMessage?: string) => {
  router.push({
    pathname: '/(mock)/trip/[id]' as any,
    params: {
      id: tripId,
      ...(initialMessage ? { initialMessage } : {})
    }
  });
  props.navigation.closeDrawer();
};
```

### Layout Code (`app/(mock)/trip/[id]/_layout.tsx`)
```typescript
export default function TripLayout() {
  const params = useLocalSearchParams();
  const tripId = params.id as string;

  // This useEffect should trigger when tripId changes
  useEffect(() => {
    console.log('[TripLayout] tripId from params changed to:', tripId);
    setCurrentTrip(null);
    setCurrentDoc(null);
    lastLoadedTripIdRef.current = null;
  }, [tripId]);

  // ... rest of component
}
```

## Root Cause Analysis

The issue appears to be with **Expo Router's Drawer navigation not properly updating params** when navigating between different instances of the same dynamic route.

### Possible Causes:
1. **Drawer navigation optimization**: Expo Router Drawer might be reusing the same screen instance instead of creating a new one
2. **useLocalSearchParams reactivity**: The hook might not detect param changes when the route pattern is the same
3. **React Navigation integration**: The underlying React Navigation drawer might have caching behavior

### This is NOT our code's fault because:
1. ✅ We're using `router.push()` correctly with proper params
2. ✅ We're using `useLocalSearchParams()` as documented
3. ✅ We have `useEffect` with proper dependencies
4. ✅ Direct navigation works (typing URL in browser)
5. ✅ The URL actually changes (proven by `window.location.pathname`)

## Workaround Attempts

### Attempt 1: Force remount with key
```typescript
<ProseMirrorWebView key={tripId} ... />
```
**Result**: WebView remounts but still receives old tripId ❌

### Attempt 2: Use template literal paths
```typescript
pathname: `/(mock)/trip/${tripId}` as any
```
**Result**: Same issue, params don't update ❌

### Attempt 3: Reset state when tripId changes
```typescript
useEffect(() => {
  setCurrentTrip(null);
  setCurrentDoc(null);
}, [tripId]);
```
**Result**: Doesn't help because tripId never changes ❌

## Recommended Solution

This needs to be reported to Expo Router team as it appears to be a framework bug. Until fixed, possible workarounds:

1. **Use Stack navigation instead of Drawer** for trip switching
2. **Manually reload on focus** using `useFocusEffect` to check URL params
3. **Use global state** to pass tripId instead of relying on route params
4. **Force full navigation** by navigating to home first, then to new trip

## Test Reproducibility

Run this test with Playwright:
```bash
npx expo start --web --port 8081
# In another terminal:
npx playwright test expo-router-drawer-bug.test.js
```

Expected: All assertions pass
Actual: Assertions for Test Case 2 fail

## Related Documentation

- Expo Router Drawer: https://docs.expo.dev/router/advanced/drawer/
- useLocalSearchParams: https://docs.expo.dev/router/reference/url-parameters/
- Dynamic routes: https://docs.expo.dev/router/reference/dynamic-routes/

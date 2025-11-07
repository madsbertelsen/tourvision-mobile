import { Stack } from 'expo-router';

// CRITICAL: This anchor keeps the parent document route mounted
// while showing geo screens as modals on top
export const unstable_settings = {
  anchor: '../index', // Anchor to the document index route
};

export default function GeoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'transparentModal', // Show as overlay with transparent background
        animation: 'slide_from_bottom', // Bottom sheet animation
      }}
    >
      <Stack.Screen name="[geoId]/picker" />
      <Stack.Screen name="[geoId]/search" />
      <Stack.Screen name="[geoId]/transport" />
    </Stack>
  );
}

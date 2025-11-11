import { AppProvider } from '@/contexts/AppContext';
import { PresentationProvider } from '@/contexts/presentation-context';
import { Stack } from 'expo-router';
import React from 'react';

export default function AppLayout() {
  return (
    <AppProvider>
      <PresentationProvider>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="document/[id]" />
          <Stack.Screen name="create-location" />
          <Stack.Screen name="prosemirror-test" />
          <Stack.Screen name="link-preview-test" />
          <Stack.Screen name="prompt-trip" />
          <Stack.Screen name="generate-trip" />
          <Stack.Screen
            name="test-modal-top"
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </PresentationProvider>
    </AppProvider>
  );
}


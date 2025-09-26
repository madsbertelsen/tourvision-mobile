import { Redirect } from 'expo-router';
import React from 'react';

export default function IndexScreen() {
  // Redirect to test-transparency screen
  return <Redirect href="/test-transparency" />;
}

// Original SimpleChatScreen is preserved in index-original.tsx if needed
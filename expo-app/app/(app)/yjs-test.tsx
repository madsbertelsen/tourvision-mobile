/**
 * Y.js Test Screen
 *
 * Simple screen to test Y.js collaboration with hardcoded document ID
 * Navigate to this screen to test the simplified setup
 */

import SimpleYjsEditor from '@/components/SimpleYjsEditor';
import { Stack } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function YjsTestScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Y.js Collaboration Test',
          headerShown: true,
        }}
      />
      <View style={styles.container}>
        <SimpleYjsEditor />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});

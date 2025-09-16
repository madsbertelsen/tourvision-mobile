import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import BranchingVisualization from '@/components/BranchingVisualization';

export default function BranchingDemoScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <BranchingVisualization />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
});
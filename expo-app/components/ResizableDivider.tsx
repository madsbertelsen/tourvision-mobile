import React, { useRef, useState } from 'react';
import { View, StyleSheet, Platform, PanResponder } from 'react-native';

interface ResizableDividerProps {
  onDrag: (deltaX: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  orientation?: 'vertical' | 'horizontal';
}

export default function ResizableDivider({
  onDrag,
  onDragStart,
  onDragEnd,
  orientation = 'vertical'
}: ResizableDividerProps) {
  const isVertical = orientation === 'vertical';
  const [isDragging, setIsDragging] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsDragging(true);
        onDragStart?.();
        if (Platform.OS === 'web') {
          (document.body.style as any).cursor = isVertical ? 'ew-resize' : 'ns-resize';
        }
      },
      onPanResponderMove: (_, gestureState) => {
        if (isVertical) {
          onDrag(gestureState.dx);
        } else {
          onDrag(gestureState.dy);
        }
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        onDragEnd?.();
        if (Platform.OS === 'web') {
          (document.body.style as any).cursor = 'default';
        }
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        onDragEnd?.();
        if (Platform.OS === 'web') {
          (document.body.style as any).cursor = 'default';
        }
      },
    })
  ).current;

  // Add mouse cursor styling for web
  const webStyle = Platform.OS === 'web' ? {
    cursor: isVertical ? 'ew-resize' : 'ns-resize',
    userSelect: 'none',
  } as any : {};

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.divider,
        isVertical ? styles.vertical : styles.horizontal,
        isDragging && styles.dragging,
        webStyle,
      ]}
    >
      <View style={[
        styles.handle,
        isVertical ? styles.handleVertical : styles.handleHorizontal,
        isDragging && styles.handleDragging,
      ]} />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  vertical: {
    width: 6,
    height: '100%',
  },
  horizontal: {
    width: '100%',
    height: 6,
  },
  dragging: {
    backgroundColor: '#d1d5db',
  },
  handle: {
    backgroundColor: '#9CA3AF',
    borderRadius: 2,
  },
  handleVertical: {
    width: 3,
    height: 40,
  },
  handleHorizontal: {
    width: 40,
    height: 3,
  },
  handleDragging: {
    backgroundColor: '#6B7280',
  },
});

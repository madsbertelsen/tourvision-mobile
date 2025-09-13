import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from '@expo/dom-webview';
import { JSONContent } from '@tiptap/react';
import { TipTapEditor } from './dom/tiptap-editor';

interface TipTapEditorDomProps {
  content?: JSONContent | string;
  onChange?: (content: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
  height?: number;
}

export function TipTapEditorDom({
  content,
  onChange,
  editable = true,
  placeholder,
  height = 400,
}: TipTapEditorDomProps) {
  return (
    <View style={[styles.container, { height }]}>
      <WebView
        dom={TipTapEditor}
        {...{ content, onChange, editable, placeholder }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    overflow: 'hidden',
  },
});
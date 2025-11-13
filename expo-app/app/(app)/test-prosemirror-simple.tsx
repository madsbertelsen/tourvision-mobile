import React, { useRef, useState } from 'react';
import { View, Text, Button, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ProseMirrorWebViewSimple, { ProseMirrorWebViewSimpleRef } from '../../components/ProseMirrorWebViewSimple';

// Sample document content
const sampleContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Welcome to the simplified ProseMirror editor test!' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This is a test of the ' },
        {
          type: 'text',
          text: 'simplified WebView component',
          marks: [{ type: 'strong' }]
        },
        { type: 'text', text: ' loading from the agent-poc URL.' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Try editing this text and see the changes appear in the console.' }
      ]
    }
  ]
};

export default function TestProseMirrorSimple() {
  const router = useRouter();
  const editorRef = useRef<ProseMirrorWebViewSimpleRef>(null);
  const [isEditable, setIsEditable] = useState(true);
  const [documentContent, setDocumentContent] = useState(sampleContent);
  const [lastChange, setLastChange] = useState<string>('');

  const handleDocumentChange = (doc: any) => {
    console.log('[TestPage] Document changed:', doc);
    setDocumentContent(doc);
    setLastChange(new Date().toLocaleTimeString());
  };

  const handleReady = () => {
    console.log('[TestPage] Editor is ready!');
  };

  const handleMessage = (data: any) => {
    console.log('[TestPage] Received message:', data);

    if (data.type === 'openFullscreenMap') {
      console.log('[TestPage] Map request with locations:', data.locations);

      // Navigate to fullscreen map with locations
      router.push({
        pathname: '/(app)/fullscreen-map',
        params: {
          locations: JSON.stringify(data.locations)
        }
      });
    }
  };

  const handleGetState = () => {
    if (editorRef.current) {
      editorRef.current.getState();
    }
  };

  const handleScrollToBottom = () => {
    if (editorRef.current) {
      editorRef.current.scrollToBottom();
    }
  };

  const handleFocus = () => {
    if (editorRef.current) {
      editorRef.current.focusEditor();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ProseMirrorWebViewSimple Test</Text>
        <Text style={styles.subtitle}>Document: test-document-simple</Text>
        {lastChange && (
          <Text style={styles.lastChange}>Last change: {lastChange}</Text>
        )}
      </View>

      <View style={styles.controls}>
        <Button
          title={isEditable ? 'Make Read-Only' : 'Make Editable'}
          onPress={() => setIsEditable(!isEditable)}
        />
        <Button
          title="Get State"
          onPress={handleGetState}
        />
        <Button
          title="Scroll to Bottom"
          onPress={handleScrollToBottom}
        />
        <Button
          title="Focus Editor"
          onPress={handleFocus}
        />
      </View>

      <View style={styles.editorContainer}>
        <ProseMirrorWebViewSimple
          ref={editorRef}
          documentId="test-document-simple"
          content={documentContent}
          editable={isEditable}
          onChange={handleDocumentChange}
          onReady={handleReady}
          onMessage={handleMessage}
          style={styles.editor}
        />
      </View>

      <Text style={styles.info}>
        Check console for log messages. The editor above is loading from:
        {'\n'}http://localhost:5174/editor.html?doc=test-document-simple
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  lastChange: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  editorContainer: {
    flex: 1,
    margin: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  editor: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  info: {
    padding: 16,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});
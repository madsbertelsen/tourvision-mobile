import { View, Platform, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AgentEditorTest() {
  // Add hideHeader parameter when loading in iframe/webview
  const editorUrl = 'http://localhost:5174/editor.html?doc=test-doc&hideHeader=true';

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[AgentEditorTest] Received message from WebView:', data);

      if (data.type === 'openFullscreenMap') {
        console.log('[AgentEditorTest] Opening fullscreen map with locations:', data.locations);
        Alert.alert(
          'Fullscreen Map',
          `Would open map with ${data.locations?.length || 0} locations`,
          [{ text: 'OK' }]
        );
        // TODO: Navigate to fullscreen map screen with data.locations
      }
    } catch (error) {
      console.error('[AgentEditorTest] Error handling message:', error);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1 }}>
        <iframe
          src={editorUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top', 'left', 'right', 'bottom']}>
      <WebView
        source={{ uri: editorUrl }}
        style={{ flex: 1 }}
        onMessage={handleMessage}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error: ', nativeEvent);
        }}
        onLoad={() => {
          console.log('WebView loaded');
        }}
      />
    </SafeAreaView>
  );
}

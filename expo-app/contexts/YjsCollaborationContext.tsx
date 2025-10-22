import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Y from 'yjs';
import { YSupabaseProvider } from '@/lib/YSupabaseProvider';
import { supabase } from '@/lib/supabase/client';
import { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { useAuth } from '@/lib/supabase/auth-context';

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

interface YjsCollaborationContextType {
  isCollaborating: boolean;
  collaborationStatus: 'disconnected' | 'connecting' | 'connected';
  collaborationUsers: CollaborationUser[];
  startCollaboration: (tripId: string) => Promise<void>;
  stopCollaboration: () => void;
  setEditorRef: (ref: React.RefObject<ProseMirrorWebViewRef>) => void;
  ydoc: Y.Doc | null;
  provider: YSupabaseProvider | null;
}

const YjsCollaborationContext = createContext<YjsCollaborationContextType | undefined>(undefined);

export const useYjsCollaboration = () => {
  const context = useContext(YjsCollaborationContext);
  if (!context) {
    throw new Error('useYjsCollaboration must be used within YjsCollaborationProvider');
  }
  return context;
};

interface YjsCollaborationProviderProps {
  children: React.ReactNode;
}

export const YjsCollaborationProvider: React.FC<YjsCollaborationProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborationStatus, setCollaborationStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [collaborationUsers, setCollaborationUsers] = useState<CollaborationUser[]>([]);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<YSupabaseProvider | null>(null);
  const editorRef = useRef<React.RefObject<ProseMirrorWebViewRef> | null>(null);

  const setEditorRef = useCallback((ref: React.RefObject<ProseMirrorWebViewRef>) => {
    console.log('[YjsCollaboration] Editor ref set');
    editorRef.current = ref;
  }, []);

  const startCollaboration = useCallback(async (tripId: string) => {
    console.log('[YjsCollaboration] Starting collaboration for trip:', tripId);

    if (!user) {
      console.error('[YjsCollaboration] User not authenticated');
      if (Platform.OS === 'web') {
        window.alert('You must be logged in to collaborate');
      } else {
        Alert.alert('Error', 'You must be logged in to collaborate');
      }
      return;
    }

    if (!editorRef.current?.current) {
      console.error('[YjsCollaboration] Editor ref not available');
      if (Platform.OS === 'web') {
        window.alert('Editor not ready for collaboration');
      } else {
        Alert.alert('Error', 'Editor not ready for collaboration');
      }
      return;
    }

    try {
      setCollaborationStatus('connecting');
      setIsCollaborating(true);

      // Use authenticated user's ID and email
      const userId = user.id;
      const userName = user.email?.split('@')[0] || 'Unknown User';

      console.log('[YjsCollaboration] Starting with user:', { userId, userName });

      // The WebView's startCollaboration will create its own Y.Doc and provider
      // We just need to tell it to start
      await editorRef.current.current.startCollaboration(
        '', // serverUrl not needed for Y.js
        tripId, // Use trip ID as document ID
        userId,
        userName
      );

      console.log('[YjsCollaboration] Collaboration started successfully');
    } catch (error) {
      console.error('[YjsCollaboration] Error starting collaboration:', error);
      setCollaborationStatus('disconnected');
      setIsCollaborating(false);

      if (Platform.OS === 'web') {
        window.alert('Failed to start collaboration. Please check your network connection.');
      } else {
        Alert.alert('Connection Error', 'Failed to start collaboration. Please check your network connection.');
      }
    }
  }, [user]);

  const stopCollaboration = useCallback(async () => {
    console.log('[YjsCollaboration] Stopping collaboration');

    try {
      // Stop collaboration in WebView
      if (editorRef.current?.current) {
        await editorRef.current.current.stopCollaboration();
      }

      // Cleanup local provider and ydoc
      if (providerRef.current) {
        await providerRef.current.destroy();
        providerRef.current = null;
      }

      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }

      setIsCollaborating(false);
      setCollaborationStatus('disconnected');
      setCollaborationUsers([]);

      console.log('[YjsCollaboration] Collaboration stopped successfully');
    } catch (error) {
      console.error('[YjsCollaboration] Error stopping collaboration:', error);
    }
  }, []);

  // Handle collaboration status updates from WebView
  useEffect(() => {
    const handleCollaborationMessage = (message: any) => {
      console.log('[YjsCollaboration] Received message:', message.type);

      switch (message.type) {
        case 'collaborationStatus':
          setCollaborationStatus(message.status);
          break;

        case 'collaborationStarted':
          if (message.success) {
            console.log('[YjsCollaboration] Collaboration successfully started with clientID:', message.clientId);
            setCollaborationStatus('connected');
          } else {
            console.error('[YjsCollaboration] Failed to start collaboration:', message.error);
            setIsCollaborating(false);
            setCollaborationStatus('disconnected');

            if (Platform.OS === 'web') {
              window.alert(message.error || 'Failed to start collaboration');
            } else {
              Alert.alert('Collaboration Error', message.error || 'Failed to start collaboration');
            }
          }
          break;

        case 'collaborationStopped':
          console.log('[YjsCollaboration] Collaboration stopped');
          setIsCollaborating(false);
          setCollaborationStatus('disconnected');
          break;

        case 'collaborationUsers':
          setCollaborationUsers(message.users || []);
          break;
      }
    };

    // Export the handler for the WebView to call
    (global as any).handleCollaborationMessage = handleCollaborationMessage;

    return () => {
      delete (global as any).handleCollaborationMessage;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[YjsCollaboration] Provider unmounting - cleaning up');

      if (providerRef.current) {
        providerRef.current.destroy().catch(err =>
          console.error('[YjsCollaboration] Error destroying provider on unmount:', err)
        );
      }

      if (ydocRef.current) {
        ydocRef.current.destroy();
      }
    };
  }, []);

  return (
    <YjsCollaborationContext.Provider
      value={{
        isCollaborating,
        collaborationStatus,
        collaborationUsers,
        startCollaboration,
        stopCollaboration,
        setEditorRef,
        ydoc: ydocRef.current,
        provider: providerRef.current,
      }}
    >
      {children}
    </YjsCollaborationContext.Provider>
  );
};

export default YjsCollaborationProvider;

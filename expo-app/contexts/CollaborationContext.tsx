import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

interface CollaborationContextType {
  isCollaborating: boolean;
  collaborationStatus: 'disconnected' | 'connecting' | 'connected';
  collaborationUsers: CollaborationUser[];
  startCollaboration: (tripId: string) => Promise<void>;
  stopCollaboration: () => void;
  setEditorRef: (ref: React.RefObject<ProseMirrorWebViewRef>) => void;
}

const CollaborationContext = createContext<CollaborationContextType | undefined>(undefined);

export const useCollaboration = () => {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }
  return context;
};

interface CollaborationProviderProps {
  children: React.ReactNode;
}

export const CollaborationProvider: React.FC<CollaborationProviderProps> = ({ children }) => {
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborationStatus, setCollaborationStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [collaborationUsers, setCollaborationUsers] = useState<CollaborationUser[]>([]);
  const editorRef = useRef<React.RefObject<ProseMirrorWebViewRef> | null>(null);

  // Configuration for the collaboration server
  const COLLAB_SERVER_URL = process.env.EXPO_PUBLIC_COLLAB_SERVER_URL || 'http://localhost:3003';

  const setEditorRef = useCallback((ref: React.RefObject<ProseMirrorWebViewRef>) => {
    editorRef.current = ref;
  }, []);

  const generateUserId = useCallback(async () => {
    // Try to get stored user ID, or generate a new one
    const storedUserId = await AsyncStorage.getItem('collaboration_user_id');
    if (storedUserId) {
      return storedUserId;
    }

    const newUserId = `user_${Math.random().toString(36).substr(2, 9)}`;
    await AsyncStorage.setItem('collaboration_user_id', newUserId);
    return newUserId;
  }, []);

  const generateUserName = useCallback(async () => {
    // Try to get stored user name, or generate a default one
    const storedUserName = await AsyncStorage.getItem('collaboration_user_name');
    if (storedUserName) {
      return storedUserName;
    }

    const adjectives = ['Swift', 'Bright', 'Calm', 'Bold', 'Wise', 'Quick', 'Noble', 'Clever'];
    const nouns = ['Explorer', 'Traveler', 'Navigator', 'Adventurer', 'Wanderer', 'Pioneer', 'Scout', 'Voyager'];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const newUserName = `${randomAdj} ${randomNoun}`;

    await AsyncStorage.setItem('collaboration_user_name', newUserName);
    return newUserName;
  }, []);

  const startCollaboration = useCallback(async (tripId: string) => {
    console.log('[CollaborationProvider] Starting collaboration for trip:', tripId);

    if (!editorRef.current?.current) {
      console.error('[CollaborationProvider] Editor ref not available');
      Alert.alert('Error', 'Editor not ready for collaboration');
      return;
    }

    try {
      setCollaborationStatus('connecting');
      setIsCollaborating(true);

      // Generate user ID and name
      const userId = await generateUserId();
      const userName = await generateUserName();

      // Start collaboration in the WebView
      editorRef.current.current.startCollaboration(
        COLLAB_SERVER_URL,
        tripId, // Use trip ID as document ID
        userId,
        userName
      );

      console.log('[CollaborationProvider] Collaboration started with:', {
        serverUrl: COLLAB_SERVER_URL,
        documentId: tripId,
        userId,
        userName
      });
    } catch (error) {
      console.error('[CollaborationProvider] Error starting collaboration:', error);
      setCollaborationStatus('disconnected');
      setIsCollaborating(false);
      Alert.alert('Connection Error', 'Failed to start collaboration. Please check your network connection.');
    }
  }, [generateUserId, generateUserName, COLLAB_SERVER_URL]);

  const stopCollaboration = useCallback(() => {
    console.log('[CollaborationProvider] Stopping collaboration');

    if (editorRef.current?.current) {
      editorRef.current.current.stopCollaboration();
    }

    setIsCollaborating(false);
    setCollaborationStatus('disconnected');
    setCollaborationUsers([]);
  }, []);

  // Handle collaboration status updates from WebView
  useEffect(() => {
    const handleCollaborationMessage = (message: any) => {
      switch (message.type) {
        case 'collaborationStatus':
          setCollaborationStatus(message.status);
          break;
        case 'collaborationStarted':
          if (message.success) {
            console.log('[CollaborationProvider] Collaboration successfully started');
          } else {
            console.error('[CollaborationProvider] Failed to start collaboration:', message.error);
            setIsCollaborating(false);
            setCollaborationStatus('disconnected');
            Alert.alert('Collaboration Error', message.error || 'Failed to start collaboration');
          }
          break;
        case 'collaborationStopped':
          console.log('[CollaborationProvider] Collaboration stopped');
          setIsCollaborating(false);
          setCollaborationStatus('disconnected');
          break;
        case 'collaborationUsers':
          setCollaborationUsers(message.users);
          break;
      }
    };

    // In a real implementation, you'd set up message listeners here
    // For now, we'll export the handler for the WebView to call
    (global as any).handleCollaborationMessage = handleCollaborationMessage;

    return () => {
      delete (global as any).handleCollaborationMessage;
    };
  }, []);

  return (
    <CollaborationContext.Provider
      value={{
        isCollaborating,
        collaborationStatus,
        collaborationUsers,
        startCollaboration,
        stopCollaboration,
        setEditorRef,
      }}
    >
      {children}
    </CollaborationContext.Provider>
  );
};

export default CollaborationProvider;
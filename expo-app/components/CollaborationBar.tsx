import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useYjsCollaboration } from '@/contexts/YjsCollaborationContext';

interface CollaborationBarProps {
  tripId: string;
}

export const CollaborationBar: React.FC<CollaborationBarProps> = ({ tripId }) => {
  const {
    isCollaborating,
    collaborationStatus,
    collaborationUsers,
    startCollaboration,
    stopCollaboration,
  } = useYjsCollaboration();

  const handleToggleCollaboration = async () => {
    if (isCollaborating) {
      stopCollaboration();
    } else {
      await startCollaboration(tripId);
    }
  };

  const getStatusColor = () => {
    switch (collaborationStatus) {
      case 'connected':
        return '#10B981'; // green
      case 'connecting':
        return '#F59E0B'; // amber
      case 'disconnected':
        return '#6B7280'; // gray
    }
  };

  const getStatusText = () => {
    if (!isCollaborating) return 'Collaboration Off';
    switch (collaborationStatus) {
      case 'connected':
        return `Connected (${collaborationUsers.length + 1} users)`;
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
        <Text style={styles.statusText}>{getStatusText()}</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          isCollaborating ? styles.stopButton : styles.startButton,
        ]}
        onPress={handleToggleCollaboration}
        disabled={collaborationStatus === 'connecting'}
      >
        <Text style={styles.buttonText}>
          {isCollaborating ? 'Stop' : 'Start'} Collaboration
        </Text>
      </TouchableOpacity>

      {isCollaborating && collaborationUsers.length > 0 && (
        <View style={styles.usersContainer}>
          {collaborationUsers.map((user) => (
            <View
              key={user.id}
              style={[styles.userBadge, { backgroundColor: user.color }]}
            >
              <Text style={styles.userBadgeText}>{user.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  startButton: {
    backgroundColor: '#3B82F6',
  },
  stopButton: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  usersContainer: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
    flexWrap: 'wrap',
  },
  userBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  userBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
});

export default CollaborationBar;
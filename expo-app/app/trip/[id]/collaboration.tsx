import { Feather, Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface Message {
  id: string;
  user: string;
  avatar: string;
  message: string;
  timestamp: string;
  type: 'message' | 'suggestion' | 'comment';
}

interface Activity {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  icon: string;
  color: string;
}

const SAMPLE_MESSAGES: Message[] = [
  {
    id: '1',
    user: 'Sarah',
    avatar: '👩',
    message: 'Should we book the Eiffel Tower tickets in advance?',
    timestamp: '10:30 AM',
    type: 'message',
  },
  {
    id: '2',
    user: 'John',
    avatar: '👨',
    message: 'Definitely! Skip-the-line tickets save so much time.',
    timestamp: '10:32 AM',
    type: 'message',
  },
  {
    id: '3',
    user: 'Emma',
    avatar: '👩‍🦰',
    message: 'I suggest adding a Seine cruise at sunset - it\'s magical! 🌅',
    timestamp: '11:15 AM',
    type: 'suggestion',
  },
  {
    id: '4',
    user: 'Sarah',
    avatar: '👩',
    message: 'Great idea! Let\'s add it to Day 1',
    timestamp: '11:20 AM',
    type: 'message',
  },
];

const SAMPLE_ACTIVITIES: Activity[] = [
  {
    id: '1',
    user: 'Emma',
    action: 'added',
    target: 'Seine River Cruise',
    timestamp: '11:22 AM',
    icon: 'plus-circle',
    color: '#10B981',
  },
  {
    id: '2',
    user: 'John',
    action: 'commented on',
    target: 'Louvre Museum visit',
    timestamp: '10:00 AM',
    icon: 'message-circle',
    color: '#3B82F6',
  },
  {
    id: '3',
    user: 'Sarah',
    action: 'updated time for',
    target: 'Arc de Triomphe',
    timestamp: 'Yesterday',
    icon: 'edit',
    color: '#F59E0B',
  },
];

export default function CollaborationTab() {
  const [activeTab, setActiveTab] = useState<'chat' | 'activity'>('chat');
  const [message, setMessage] = useState('');

  const renderMessage = ({ item }: { item: Message }) => {
    const isSuggestion = item.type === 'suggestion';
    
    return (
      <View style={[styles.messageContainer, isSuggestion && styles.suggestionContainer]}>
        <Text style={styles.avatar}>{item.avatar}</Text>
        <View style={styles.messageContent}>
          <View style={styles.messageHeader}>
            <Text style={styles.userName}>{item.user}</Text>
            <Text style={styles.timestamp}>{item.timestamp}</Text>
          </View>
          <Text style={styles.messageText}>{item.message}</Text>
          {isSuggestion && (
            <View style={styles.suggestionBadge}>
              <Feather name="lightbulb" size={12} color="#F59E0B" />
              <Text style={styles.suggestionText}>Suggestion</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderActivity = ({ item }: { item: Activity }) => {
    return (
      <View style={styles.activityItem}>
        <View style={[styles.activityIcon, { backgroundColor: `${item.color}20` }]}>
          <Feather name={item.icon as any} size={16} color={item.color} />
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityText}>
            <Text style={styles.activityUser}>{item.user}</Text>
            {' '}{item.action}{' '}
            <Text style={styles.activityTarget}>{item.target}</Text>
          </Text>
          <Text style={styles.activityTime}>{item.timestamp}</Text>
        </View>
      </View>
    );
  };

  const sendMessage = () => {
    if (message.trim()) {
      // In production, this would send to the backend
      console.log('Sending message:', message);
      setMessage('');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
          onPress={() => setActiveTab('chat')}
        >
          <Ionicons 
            name="chatbubbles-outline" 
            size={20} 
            color={activeTab === 'chat' ? '#3B82F6' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>
            Chat
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'activity' && styles.activeTab]}
          onPress={() => setActiveTab('activity')}
        >
          <Feather 
            name="activity" 
            size={20} 
            color={activeTab === 'activity' ? '#3B82F6' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'activity' && styles.activeTabText]}>
            Activity
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'chat' ? (
        <>
          <FlatList
            data={SAMPLE_MESSAGES}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            inverted={false}
          />
          
          {/* Message Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={500}
            />
            <TouchableOpacity 
              style={styles.sendButton}
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <Ionicons 
                name="send" 
                size={20} 
                color={message.trim() ? '#3B82F6' : '#999'} 
              />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView style={styles.activityList}>
          {SAMPLE_ACTIVITIES.map((activity) => (
            <View key={activity.id}>
              {renderActivity({ item: activity })}
            </View>
          ))}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  activeTabText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  messagesList: {
    padding: 20,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  suggestionContainer: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: -12,
  },
  avatar: {
    fontSize: 32,
    marginRight: 12,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  messageText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  suggestionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  suggestionText: {
    fontSize: 12,
    color: '#F59E0B',
    marginLeft: 4,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    marginLeft: 12,
    padding: 8,
  },
  activityList: {
    flex: 1,
    padding: 20,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  activityUser: {
    fontWeight: '600',
    color: '#333',
  },
  activityTarget: {
    fontWeight: '600',
    color: '#3B82F6',
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
});
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  Platform,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-context';
import { router } from 'expo-router';

interface ShareDocumentModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
}

interface Collaborator {
  user_id: string;
  email: string;
  name: string;
  permission: 'view' | 'edit' | 'admin';
  is_owner: boolean;
  shared_at: string;
  accepted_at: string;
}

interface ShareLink {
  id: string;
  share_code: string;
  permission: 'view' | 'edit' | 'admin';
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
}

export default function ShareDocumentModal({ visible, onClose, tripId, tripTitle }: ShareDocumentModalProps) {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'people' | 'link' | 'account'>('people');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkPermission, setLinkPermission] = useState<'view' | 'edit'>('view');
  const [linkExpiry, setLinkExpiry] = useState<'never' | '24h' | '7d' | '30d'>('7d');
  const [maxUses, setMaxUses] = useState<string>('');

  useEffect(() => {
    if (visible) {
      loadCollaborators();
      loadShareLinks();
    }
  }, [visible, tripId]);

  const loadCollaborators = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_document_collaborators', { p_document_id: tripId });

      if (error) throw error;
      setCollaborators(data || []);
    } catch (error) {
      console.error('Error loading collaborators:', error);
    }
  };

  const loadShareLinks = async () => {
    try {
      const { data, error} = await supabase
        .rpc('get_document_share_links', { p_document_id: tripId });

      if (error) throw error;
      setShareLinks(data || []);
    } catch (error) {
      console.error('Error loading share links:', error);
    }
  };

  const inviteByEmail = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // Check if user exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      const { error } = await supabase
        .from('document_shares')
        .insert({
          document_id: tripId,
          owner_id: userData.user.id,
          shared_with_user_id: existingUser?.id || null,
          shared_with_email: existingUser ? null : email.toLowerCase(),
          permission: permission,
          accepted_at: existingUser ? new Date().toISOString() : null,
        });

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Info', 'This person already has access to the trip');
        } else {
          throw error;
        }
      } else {
        Alert.alert('Success', existingUser
          ? 'User has been granted access to the trip'
          : 'Invitation sent! They will get access when they sign up.');
        setEmail('');
        loadCollaborators();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to share trip');
    } finally {
      setLoading(false);
    }
  };

  const createShareLink = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // Calculate expiry
      let expiresAt = null;
      if (linkExpiry === '24h') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (linkExpiry === '7d') {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (linkExpiry === '30d') {
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { data, error } = await supabase
        .from('document_share_links')
        .insert({
          document_id: tripId,
          created_by: userData.user.id,
          permission: linkPermission,
          max_uses: maxUses ? parseInt(maxUses) : null,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert('Success', 'Share link created!');
      loadShareLinks();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create share link');
    } finally {
      setLoading(false);
    }
  };

  const copyShareLink = async (shareCode: string) => {
    const baseUrl = Platform.select({
      web: window.location.origin,
      default: 'https://tourvision.com',
    });
    const shareUrl = `${baseUrl}/invite/${shareCode}`;

    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(shareUrl);
      Alert.alert('Copied!', 'Share link copied to clipboard');
    } else {
      Clipboard.setString(shareUrl);
      Alert.alert('Copied!', 'Share link copied to clipboard');
    }
  };

  const shareLink = async (shareCode: string) => {
    const baseUrl = Platform.select({
      web: window.location.origin,
      default: 'https://tourvision.com',
    });
    const shareUrl = `${baseUrl}/invite/${shareCode}`;

    try {
      await Share.share({
        title: `Join "${tripTitle}" on TourVision`,
        message: `You've been invited to collaborate on "${tripTitle}". Join here: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const revokeAccess = async (userId: string) => {
    Alert.alert(
      'Revoke Access',
      'Are you sure you want to remove this person\'s access?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('document_shares')
                .delete()
                .eq('document_id', tripId)
                .eq('shared_with_user_id', userId);

              if (error) throw error;
              Alert.alert('Success', 'Access revoked');
              loadCollaborators();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to revoke access');
            }
          },
        },
      ]
    );
  };

  const deactivateLink = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from('document_share_links')
        .update({ is_active: false })
        .eq('id', linkId);

      if (error) throw error;
      Alert.alert('Success', 'Share link deactivated');
      loadShareLinks();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to deactivate link');
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[ShareDocumentModal] Logging out...');
              await signOut();
              console.log('[ShareDocumentModal] Sign out successful, navigating to login...');
              onClose();
              // Use push instead of replace to ensure navigation works
              router.push('/(auth)/login');
            } catch (error: any) {
              console.error('[ShareDocumentModal] Logout error:', error);
              Alert.alert('Error', error.message || 'Failed to log out');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Share "{tripTitle}"</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'people' && styles.activeTab]}
              onPress={() => setActiveTab('people')}
            >
              <Ionicons name="people" size={20} color={activeTab === 'people' ? '#3B82F6' : '#9CA3AF'} />
              <Text style={[styles.tabText, activeTab === 'people' && styles.activeTabText]}>
                People
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'link' && styles.activeTab]}
              onPress={() => setActiveTab('link')}
            >
              <Ionicons name="link" size={20} color={activeTab === 'link' ? '#3B82F6' : '#9CA3AF'} />
              <Text style={[styles.tabText, activeTab === 'link' && styles.activeTabText]}>
                Share Link
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'account' && styles.activeTab]}
              onPress={() => setActiveTab('account')}
            >
              <Ionicons name="person" size={20} color={activeTab === 'account' ? '#3B82F6' : '#9CA3AF'} />
              <Text style={[styles.tabText, activeTab === 'account' && styles.activeTabText]}>
                Account
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {activeTab === 'account' ? (
              <View>
                <Text style={styles.sectionTitle}>Account Settings</Text>
                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={handleLogout}
                >
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                  <Text style={styles.logoutButtonText}>Log Out</Text>
                </TouchableOpacity>
              </View>
            ) : activeTab === 'people' ? (
              <View>
                <Text style={styles.sectionTitle}>Invite by Email</Text>
                <View style={styles.inviteSection}>
                  <TextInput
                    style={styles.emailInput}
                    placeholder="Enter email address"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <View style={styles.permissionRow}>
                    <TouchableOpacity
                      style={[styles.permissionButton, permission === 'view' && styles.permissionActive]}
                      onPress={() => setPermission('view')}
                    >
                      <Text style={[styles.permissionText, permission === 'view' && styles.permissionActiveText]}>
                        Can View
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.permissionButton, permission === 'edit' && styles.permissionActive]}
                      onPress={() => setPermission('edit')}
                    >
                      <Text style={[styles.permissionText, permission === 'edit' && styles.permissionActiveText]}>
                        Can Edit
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.inviteButton, loading && styles.disabledButton]}
                    onPress={inviteByEmail}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.inviteButtonText}>Send Invite</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>People with Access</Text>
                {collaborators.map((collab) => (
                  <View key={collab.user_id} style={styles.collaboratorItem}>
                    <View style={styles.collaboratorInfo}>
                      <Text style={styles.collaboratorName}>
                        {collab.name || collab.email}
                        {collab.is_owner && ' (Owner)'}
                      </Text>
                      <Text style={styles.collaboratorEmail}>{collab.email}</Text>
                      <Text style={styles.collaboratorPermission}>
                        {collab.permission === 'admin' ? 'Admin' :
                         collab.permission === 'edit' ? 'Can Edit' : 'Can View'}
                      </Text>
                    </View>
                    {!collab.is_owner && (
                      <TouchableOpacity
                        onPress={() => revokeAccess(collab.user_id)}
                        style={styles.revokeButton}
                      >
                        <Ionicons name="close-circle" size={24} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View>
                <Text style={styles.sectionTitle}>Create Share Link</Text>
                <View style={styles.linkSection}>
                  <Text style={styles.label}>Permission</Text>
                  <View style={styles.permissionRow}>
                    <TouchableOpacity
                      style={[styles.permissionButton, linkPermission === 'view' && styles.permissionActive]}
                      onPress={() => setLinkPermission('view')}
                    >
                      <Text style={[styles.permissionText, linkPermission === 'view' && styles.permissionActiveText]}>
                        Can View
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.permissionButton, linkPermission === 'edit' && styles.permissionActive]}
                      onPress={() => setLinkPermission('edit')}
                    >
                      <Text style={[styles.permissionText, linkPermission === 'edit' && styles.permissionActiveText]}>
                        Can Edit
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>Expires</Text>
                  <View style={styles.expiryRow}>
                    {(['never', '24h', '7d', '30d'] as const).map((exp) => (
                      <TouchableOpacity
                        key={exp}
                        style={[styles.expiryButton, linkExpiry === exp && styles.expiryActive]}
                        onPress={() => setLinkExpiry(exp)}
                      >
                        <Text style={[styles.expiryText, linkExpiry === exp && styles.expiryActiveText]}>
                          {exp === 'never' ? 'Never' :
                           exp === '24h' ? '24 Hours' :
                           exp === '7d' ? '7 Days' : '30 Days'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Max Uses (optional)</Text>
                  <TextInput
                    style={styles.maxUsesInput}
                    placeholder="Unlimited"
                    value={maxUses}
                    onChangeText={setMaxUses}
                    keyboardType="number-pad"
                  />

                  <TouchableOpacity
                    style={[styles.createLinkButton, loading && styles.disabledButton]}
                    onPress={createShareLink}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.createLinkButtonText}>Create Link</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>Active Links</Text>
                {shareLinks.length === 0 ? (
                  <Text style={styles.noLinks}>No active share links</Text>
                ) : (
                  shareLinks.map((link) => (
                    <View key={link.id} style={styles.linkItem}>
                      <View style={styles.linkInfo}>
                        <Text style={styles.linkCode}>
                          {link.permission === 'edit' ? '✏️' : '👁'}
                          {' '}Link: {link.share_code}
                        </Text>
                        <Text style={styles.linkDetails}>
                          Uses: {link.current_uses}/{link.max_uses || '∞'} •
                          {link.expires_at ?
                            ` Expires: ${new Date(link.expires_at).toLocaleDateString()}` :
                            ' No expiry'}
                        </Text>
                      </View>
                      <View style={styles.linkActions}>
                        <TouchableOpacity
                          onPress={() => copyShareLink(link.share_code)}
                          style={styles.linkActionButton}
                        >
                          <Ionicons name="copy" size={20} color="#3B82F6" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => shareLink(link.share_code)}
                          style={styles.linkActionButton}
                        >
                          <Ionicons name="share" size={20} color="#3B82F6" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => deactivateLink(link.id)}
                          style={styles.linkActionButton}
                        >
                          <Ionicons name="trash" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  activeTabText: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    marginTop: 16,
  },
  inviteSection: {
    marginBottom: 20,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  permissionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  permissionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  permissionActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  permissionText: {
    fontSize: 14,
    color: '#6B7280',
  },
  permissionActiveText: {
    color: 'white',
  },
  inviteButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  inviteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  collaboratorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  collaboratorInfo: {
    flex: 1,
  },
  collaboratorName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  collaboratorEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  collaboratorPermission: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 4,
  },
  revokeButton: {
    padding: 4,
  },
  linkSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  expiryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  expiryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  expiryActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  expiryText: {
    fontSize: 12,
    color: '#6B7280',
  },
  expiryActiveText: {
    color: 'white',
  },
  maxUsesInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
  },
  createLinkButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createLinkButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  linkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  linkInfo: {
    flex: 1,
  },
  linkCode: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  linkDetails: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  linkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  linkActionButton: {
    padding: 4,
  },
  noLinks: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
    marginTop: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
});
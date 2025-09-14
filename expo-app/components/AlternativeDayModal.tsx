import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface Destination {
  id: string;
  name: string;
  duration: string;
  cost: number;
  time: string;
  description?: string;
}

interface AlternativeDayModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (proposal: {
    title: string;
    description: string;
    destinations: Destination[];
  }) => void;
  dayNumber: number;
  originalDestinations: Destination[];
}

export default function AlternativeDayModal({
  visible,
  onClose,
  onSubmit,
  dayNumber,
  originalDestinations,
}: AlternativeDayModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [editingDestination, setEditingDestination] = useState<string | null>(null);
  const [showAddDestination, setShowAddDestination] = useState(false);
  const [newDestination, setNewDestination] = useState<Partial<Destination>>({
    name: '',
    duration: '1h',
    cost: 0,
    time: '09:00',
  });

  useEffect(() => {
    // Clone original destinations when modal opens
    if (visible) {
      setDestinations([...originalDestinations]);
      setTitle('');
      setDescription('');
      setShowAddDestination(false);
      setEditingDestination(null);
    }
  }, [visible, originalDestinations]);

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please provide a title for your proposal');
      return;
    }
    if (destinations.length === 0) {
      Alert.alert('Error', 'Please add at least one destination');
      return;
    }

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      destinations,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setDestinations([]);
  };

  const handleAddDestination = () => {
    if (!newDestination.name?.trim()) {
      Alert.alert('Error', 'Please enter a destination name');
      return;
    }

    const destination: Destination = {
      id: `dest-${Date.now()}`,
      name: newDestination.name!.trim(),
      duration: newDestination.duration || '1h',
      cost: newDestination.cost || 0,
      time: newDestination.time || '09:00',
      description: newDestination.description,
    };

    setDestinations([...destinations, destination]);
    setNewDestination({
      name: '',
      duration: '1h',
      cost: 0,
      time: '09:00',
    });
    setShowAddDestination(false);
  };

  const handleRemoveDestination = (id: string) => {
    setDestinations(destinations.filter((d) => d.id !== id));
  };

  const handleUpdateDestination = (id: string, updates: Partial<Destination>) => {
    setDestinations(
      destinations.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  const calculateTotalCost = () => {
    return destinations.reduce((sum, d) => sum + (d.cost || 0), 0);
  };

  const calculateTotalDuration = () => {
    const totalMinutes = destinations.reduce((sum, d) => {
      const match = d.duration.match(/(\d+)h?(?:\s*(\d+)m)?/);
      if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        return sum + hours * 60 + minutes;
      }
      return sum;
    }, 0);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  const renderDestination = ({ item, drag, isActive }: RenderItemParams<Destination>) => {
    const isEditing = editingDestination === item.id;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.destinationCard,
            isActive && styles.destinationCardActive,
          ]}
        >
          <View style={styles.destinationHandle}>
            <Ionicons name="reorder-three" size={20} color="#9CA3AF" />
          </View>

          <View style={styles.destinationContent}>
            {isEditing ? (
              <View style={styles.editingContainer}>
                <TextInput
                  style={styles.editInput}
                  value={item.name}
                  onChangeText={(text) => handleUpdateDestination(item.id, { name: text })}
                  placeholder="Destination name"
                />
                <View style={styles.editRow}>
                  <TextInput
                    style={[styles.editInput, styles.smallInput]}
                    value={item.duration}
                    onChangeText={(text) =>
                      handleUpdateDestination(item.id, { duration: text })
                    }
                    placeholder="Duration"
                  />
                  <TextInput
                    style={[styles.editInput, styles.smallInput]}
                    value={item.time}
                    onChangeText={(text) => handleUpdateDestination(item.id, { time: text })}
                    placeholder="Time"
                  />
                  <TextInput
                    style={[styles.editInput, styles.smallInput]}
                    value={item.cost.toString()}
                    onChangeText={(text) =>
                      handleUpdateDestination(item.id, { cost: parseFloat(text) || 0 })
                    }
                    placeholder="Cost"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.destinationInfo}>
                  <Text style={styles.destinationName}>{item.name}</Text>
                  <View style={styles.destinationMeta}>
                    <View style={styles.metaItem}>
                      <Feather name="clock" size={12} color="#6B7280" />
                      <Text style={styles.metaText}>{item.time}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Feather name="activity" size={12} color="#6B7280" />
                      <Text style={styles.metaText}>{item.duration}</Text>
                    </View>
                    {item.cost > 0 && (
                      <View style={styles.metaItem}>
                        <Feather name="dollar-sign" size={12} color="#6B7280" />
                        <Text style={styles.metaText}>{item.cost}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </>
            )}

            <View style={styles.destinationActions}>
              <TouchableOpacity
                onPress={() => setEditingDestination(isEditing ? null : item.id)}
                style={styles.actionButton}
              >
                <Feather
                  name={isEditing ? 'check' : 'edit-2'}
                  size={16}
                  color={isEditing ? '#10B981' : '#6B7280'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveDestination(item.id)}
                style={styles.actionButton}
              >
                <Feather name="trash-2" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <GestureHandlerRootView style={styles.modalContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={24} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Suggest Alternative for Day {dayNumber}</Text>
            <TouchableOpacity onPress={handleSubmit} style={styles.submitButton}>
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Proposal Title</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Beach day instead of museums"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Description Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Why this alternative?</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Explain your reasoning..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Feather name="map-pin" size={16} color="#6B7280" />
                <Text style={styles.statValue}>{destinations.length}</Text>
                <Text style={styles.statLabel}>Places</Text>
              </View>
              <View style={styles.statCard}>
                <Feather name="clock" size={16} color="#6B7280" />
                <Text style={styles.statValue}>{calculateTotalDuration()}</Text>
                <Text style={styles.statLabel}>Duration</Text>
              </View>
              <View style={styles.statCard}>
                <Feather name="dollar-sign" size={16} color="#6B7280" />
                <Text style={styles.statValue}>${calculateTotalCost()}</Text>
                <Text style={styles.statLabel}>Cost</Text>
              </View>
            </View>

            {/* Destinations */}
            <View style={styles.destinationsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Destinations</Text>
                <TouchableOpacity
                  onPress={() => setShowAddDestination(!showAddDestination)}
                  style={styles.addButton}
                >
                  <Feather name="plus" size={18} color="#3B82F6" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>

              {showAddDestination && (
                <View style={styles.addDestinationForm}>
                  <TextInput
                    style={styles.textInput}
                    value={newDestination.name}
                    onChangeText={(text) =>
                      setNewDestination({ ...newDestination, name: text })
                    }
                    placeholder="Destination name"
                    placeholderTextColor="#9CA3AF"
                  />
                  <View style={styles.formRow}>
                    <TextInput
                      style={[styles.textInput, styles.smallInput]}
                      value={newDestination.duration}
                      onChangeText={(text) =>
                        setNewDestination({ ...newDestination, duration: text })
                      }
                      placeholder="Duration"
                      placeholderTextColor="#9CA3AF"
                    />
                    <TextInput
                      style={[styles.textInput, styles.smallInput]}
                      value={newDestination.time}
                      onChangeText={(text) =>
                        setNewDestination({ ...newDestination, time: text })
                      }
                      placeholder="Time"
                      placeholderTextColor="#9CA3AF"
                    />
                    <TextInput
                      style={[styles.textInput, styles.smallInput]}
                      value={newDestination.cost?.toString()}
                      onChangeText={(text) =>
                        setNewDestination({
                          ...newDestination,
                          cost: parseFloat(text) || 0,
                        })
                      }
                      placeholder="Cost"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={handleAddDestination}
                    style={styles.confirmAddButton}
                  >
                    <Text style={styles.confirmAddText}>Add Destination</Text>
                  </TouchableOpacity>
                </View>
              )}

              {destinations.length > 0 ? (
                <DraggableFlatList
                  data={destinations}
                  onDragEnd={({ data }) => setDestinations(data)}
                  keyExtractor={(item) => item.id}
                  renderItem={renderDestination}
                  scrollEnabled={false}
                />
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="place" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No destinations yet</Text>
                  <Text style={styles.emptySubtext}>
                    Start by adding destinations for your alternative itinerary
                  </Text>
                </View>
              )}
            </View>

            {/* Comparison Preview */}
            {destinations.length > 0 && (
              <View style={styles.comparisonPreview}>
                <Text style={styles.previewTitle}>Changes from Original</Text>
                <View style={styles.changesList}>
                  <View style={styles.changeItem}>
                    <View style={[styles.changeBadge, styles.addedBadge]}>
                      <Text style={styles.changeBadgeText}>+{destinations.length}</Text>
                    </View>
                    <Text style={styles.changeText}>New destinations</Text>
                  </View>
                  <View style={styles.changeItem}>
                    <View style={[styles.changeBadge, styles.timeBadge]}>
                      <Feather name="clock" size={12} color="#6B7280" />
                    </View>
                    <Text style={styles.changeText}>{calculateTotalDuration()} total</Text>
                  </View>
                  <View style={styles.changeItem}>
                    <View style={[styles.changeBadge, styles.costBadge]}>
                      <Text style={styles.changeBadgeText}>${calculateTotalCost()}</Text>
                    </View>
                    <Text style={styles.changeText}>Estimated cost</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  submitText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  inputGroup: {
    padding: 16,
    backgroundColor: 'white',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 10,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  destinationsSection: {
    backgroundColor: 'white',
    marginTop: 8,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    gap: 4,
  },
  addButtonText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  addDestinationForm: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallInput: {
    flex: 1,
  },
  confirmAddButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  confirmAddText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  destinationCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  destinationCardActive: {
    opacity: 0.9,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  destinationHandle: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  destinationContent: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingRight: 12,
  },
  destinationInfo: {
    flex: 1,
  },
  destinationName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  destinationMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  destinationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  editingContainer: {
    flex: 1,
  },
  editInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    marginBottom: 6,
  },
  editRow: {
    flexDirection: 'row',
    gap: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  comparisonPreview: {
    backgroundColor: 'white',
    marginTop: 8,
    padding: 16,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  changesList: {
    gap: 8,
  },
  changeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedBadge: {
    backgroundColor: '#D1FAE5',
  },
  timeBadge: {
    backgroundColor: '#F3F4F6',
  },
  costBadge: {
    backgroundColor: '#FEF3C7',
  },
  changeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  changeText: {
    fontSize: 13,
    color: '#6B7280',
  },
});
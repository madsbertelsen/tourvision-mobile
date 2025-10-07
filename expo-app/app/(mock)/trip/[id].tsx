import TripDetailView from '@/components/TripDetailView';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function MockChatScreen() {
  const params = useLocalSearchParams();
  const tripId = params.id as string;
  const initialMessage = params.initialMessage as string | undefined;

  return <TripDetailView tripId={tripId} initialMessage={initialMessage} />;
}

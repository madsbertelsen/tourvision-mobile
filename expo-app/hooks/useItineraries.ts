import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-context';
import type { Tables } from '@/lib/database.types';

type Itinerary = Tables<'itineraries'>;

export function useItineraries() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['itineraries', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('itineraries')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching itineraries:', error);
        throw error;
      }

      return data as Itinerary[];
    },
    enabled: !!user,
  });
}

export function useItinerary(id: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['itinerary', id],
    queryFn: async () => {
      if (!user || !id) return null;

      const { data, error } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching itinerary:', error);
        throw error;
      }

      return data as Itinerary;
    },
    enabled: !!user && !!id,
  });
}
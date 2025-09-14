import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-context';
import type { Tables } from '@/lib/database.types';

type Trip = Tables<'trips'>;

export function useTrips() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['trips', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching trips:', error);
        throw error;
      }

      return data as Trip[];
    },
    enabled: !!user,
  });
}

export function useTrip(id: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['trip', id],
    queryFn: async () => {
      if (!user || !id) return null;

      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching trip:', error);
        throw error;
      }

      return data as Trip;
    },
    enabled: !!user && !!id,
  });
}
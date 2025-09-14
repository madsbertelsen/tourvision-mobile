import { useEffect, useState } from 'react';
import { useDataStream } from '@/components/data-stream-provider';

export function useExplorePlacesStream() {
  const { dataStream } = useDataStream();
  const [explorePlacesData, setExplorePlacesData] = useState<{
    city: string;
    places: any[];
  } | null>(null);

  useEffect(() => {
    if (!dataStream?.length) return;

    // Look for data-textDelta events that contain explorePlacesUpdate
    const latestUpdate = [...dataStream]
      .reverse()
      .find(item => {
        if (item.type === 'data-textDelta' && item.data) {
          try {
            const parsed = JSON.parse(item.data);
            return parsed.type === 'explorePlacesUpdate';
          } catch {
            return false;
          }
        }
        return false;
      });

    if (latestUpdate && latestUpdate.data) {
      try {
        const parsed = JSON.parse(latestUpdate.data);
        if (parsed.type === 'explorePlacesUpdate') {
          console.log('[useExplorePlacesStream] Found update with places:', parsed.places?.length);
          setExplorePlacesData({
            city: parsed.city,
            places: parsed.places || [],
          });
        }
      } catch (error) {
        console.error('[useExplorePlacesStream] Failed to parse update:', error);
      }
    }
  }, [dataStream]);

  return explorePlacesData;
}
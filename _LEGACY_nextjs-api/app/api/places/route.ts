import { NextResponse, type NextRequest } from 'next/server';

// Cache for geocoding results (24 hour TTL)
const geocodeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const type = searchParams.get('type') || 'geocode'; // 'geocode' or 'details'
    const placeId = searchParams.get('place_id');

    if (!query && type === 'geocode') {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 },
      );
    }

    // Check cache first
    const cacheKey = `${type}:${query || placeId}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[Cache] Returning cached result for:', query || placeId);
      return NextResponse.json(cached.data);
    }

    // Check if we have a Google Places API key
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!googleApiKey) {
      console.warn('No GOOGLE_PLACES_API_KEY configured. Add it to your .env.local file.');
      
      // Return a mock response for common Oslo locations during development
      if (query) {
        const mockLocations: Record<string, any> = {
          'royal palace': {
            name: 'Royal Palace, Oslo',
            coordinates: [10.7275, 59.9167],
            formattedAddress: 'Slottsplassen 1, 0010 Oslo, Norway',
            types: ['tourist_attraction', 'point_of_interest'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9167,10.7275`,
            source: 'mock'
          },
          'vigeland park': {
            name: 'Vigeland Park, Oslo',
            coordinates: [10.7007, 59.9269],
            formattedAddress: 'Nobels gate 32, 0268 Oslo, Norway',
            types: ['park', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9269,10.7007`,
            source: 'mock'
          },
          'vigeland sculpture park': {
            name: 'Vigeland Sculpture Park, Oslo',
            coordinates: [10.7007, 59.9269],
            formattedAddress: 'Nobels gate 32, 0268 Oslo, Norway',
            types: ['park', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9269,10.7007`,
            source: 'mock'
          },
          'frogner park': {
            name: 'Frogner Park, Oslo',
            coordinates: [10.7042, 59.9272],
            formattedAddress: 'Kirkeveien, 0268 Oslo, Norway',
            types: ['park'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9272,10.7042`,
            source: 'mock'
          },
          'viking ship museum': {
            name: 'Viking Ship Museum, Oslo',
            coordinates: [10.6844, 59.9047],
            formattedAddress: 'Huk Aveny 35, 0287 Oslo, Norway',
            types: ['museum', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9047,10.6844`,
            source: 'mock'
          },
          'akershus fortress': {
            name: 'Akershus Fortress, Oslo',
            coordinates: [10.7361, 59.9075],
            formattedAddress: 'Akershus Festning, 0015 Oslo, Norway',
            types: ['castle', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9075,10.7361`,
            source: 'mock'
          },
          'oslo opera house': {
            name: 'Oslo Opera House',
            coordinates: [10.7531, 59.9075],
            formattedAddress: 'Kirsten Flagstads Plass 1, 0150 Oslo, Norway',
            types: ['point_of_interest', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9075,10.7531`,
            source: 'mock'
          },
          'munch museum': {
            name: 'Munch Museum, Oslo',
            coordinates: [10.7731, 59.9064],
            formattedAddress: 'Edvard Munchs Plass 1, 0194 Oslo, Norway',
            types: ['museum', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9064,10.7731`,
            source: 'mock'
          },
          'nobel peace center': {
            name: 'Nobel Peace Center, Oslo',
            coordinates: [10.7306, 59.9119],
            formattedAddress: 'Brynjulf Bulls plass 1, 0250 Oslo, Norway',
            types: ['museum', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9119,10.7306`,
            source: 'mock'
          },
          'oslo city hall': {
            name: 'Oslo City Hall',
            coordinates: [10.7333, 59.9119],
            formattedAddress: 'Rådhusplassen 1, 0037 Oslo, Norway',
            types: ['city_hall', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9119,10.7333`,
            source: 'mock'
          },
          'national gallery': {
            name: 'National Gallery, Oslo',
            coordinates: [10.7378, 59.9156],
            formattedAddress: 'Universitetsgata 13, 0164 Oslo, Norway',
            types: ['museum', 'art_gallery'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9156,10.7378`,
            source: 'mock'
          },
          'fram museum': {
            name: 'Fram Museum, Oslo',
            coordinates: [10.6989, 59.9031],
            formattedAddress: 'Bygdøynesveien 39, 0286 Oslo, Norway',
            types: ['museum', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9031,10.6989`,
            source: 'mock'
          },
          'kon-tiki museum': {
            name: 'Kon-Tiki Museum, Oslo',
            coordinates: [10.6986, 59.9036],
            formattedAddress: 'Bygdøynesveien 36, 0286 Oslo, Norway',
            types: ['museum', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9036,10.6986`,
            source: 'mock'
          },
          'grünerløkka': {
            name: 'Grünerløkka, Oslo',
            coordinates: [10.7597, 59.9233],
            formattedAddress: 'Grünerløkka, Oslo, Norway',
            types: ['neighborhood'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9233,10.7597`,
            source: 'mock'
          },
          'ekeberg park': {
            name: 'Ekeberg Park, Oslo',
            coordinates: [10.7606, 59.8997],
            formattedAddress: 'Kongsveien 23, 1177 Oslo, Norway',
            types: ['park', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.8997,10.7606`,
            source: 'mock'
          },
          'botanical garden': {
            name: 'University Botanical Garden, Oslo',
            coordinates: [10.7653, 59.9172],
            formattedAddress: 'Sars gate 1, 0562 Oslo, Norway',
            types: ['park', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9172,10.7653`,
            source: 'mock'
          },
          'bygdøy': {
            name: 'Bygdøy Peninsula, Oslo',
            coordinates: [10.6831, 59.9058],
            formattedAddress: 'Bygdøy, Oslo, Norway',
            types: ['peninsula', 'tourist_attraction'],
            url: `https://www.google.com/maps/search/?api=1&query=59.9058,10.6831`,
            source: 'mock'
          },
          'oslo gardermoen': {
            name: 'Oslo Gardermoen Airport',
            coordinates: [11.1004, 60.1939],
            formattedAddress: 'Edvard Munchs veg, 2061 Gardermoen, Norway',
            types: ['airport'],
            url: `https://www.google.com/maps/search/?api=1&query=60.1939,11.1004`,
            source: 'mock'
          },
          'oslo airport': {
            name: 'Oslo Airport',
            coordinates: [11.1004, 60.1939],
            formattedAddress: 'Edvard Munchs veg, 2061 Gardermoen, Norway',
            types: ['airport'],
            url: `https://www.google.com/maps/search/?api=1&query=60.1939,11.1004`,
            source: 'mock'
          }
        };

        // Check if query matches any mock location
        const queryLower = query.toLowerCase();
        for (const [key, location] of Object.entries(mockLocations)) {
          if (queryLower.includes(key)) {
            console.log('[Mock] Returning mock data for:', location.name);
            geocodeCache.set(cacheKey, { data: location, timestamp: Date.now() });
            return NextResponse.json(location);
          }
        }
      }

      return NextResponse.json(
        { error: 'Google Places API key not configured. Please add GOOGLE_PLACES_API_KEY to your environment variables.' },
        { status: 500 },
      );
    }

    // Google Places API implementation
    if (type === 'geocode' && query) {
      console.log('[Google Places] Searching for:', query);
      
      // Use Text Search API for better results - Note: Text Search doesn't return photos
      // We'd need to make a separate Place Details call to get photos
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${googleApiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Google Places API error: ${response.statusText}`);
        throw new Error(`Google Places API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('Google Places API error:', data.status, data.error_message);
        throw new Error(`Google Places API error: ${data.status}`);
      }

      if (data.results && data.results.length > 0) {
        const place = data.results[0];
        console.log('[Google Places] Found place:', {
          name: place.name,
          address: place.formatted_address,
          location: place.geometry.location,
          types: place.types,
          hasPhotos: place.photos?.length > 0
        });
        
        // Get photo URLs if photos exist
        let photoUrl = undefined;
        let photos = undefined;
        
        if (place.photos && place.photos.length > 0 && googleApiKey) {
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${googleApiKey}`;
          photos = place.photos.slice(0, 3).map((photo: any) => ({
            reference: photo.photo_reference,
            width: photo.width,
            height: photo.height,
            url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${googleApiKey}`,
          }));
          console.log('[Google Places] Generated photo URL:', photoUrl);
        }
        
        const result = {
          name: place.name,
          coordinates: [
            place.geometry.location.lng,
            place.geometry.location.lat,
          ] as [number, number],
          placeId: place.place_id,
          formattedAddress: place.formatted_address,
          types: place.types,
          rating: place.rating,
          url: `https://www.google.com/maps/search/?api=1&query=${place.geometry.location.lat},${place.geometry.location.lng}`,
          photoUrl,
          photos,
          source: 'google',
        };

        // Cache the result
        geocodeCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return NextResponse.json(result);
      }

      console.log('[Google Places] No results found for:', query);
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 },
      );
    }

    if (type === 'details' && placeId) {
      console.log('[Google Places] Getting details for place_id:', placeId);
      
      // Google Place Details API
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,photos,rating,opening_hours,website,url&key=${googleApiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.result) {
        const place = data.result;
        const result = {
          name: place.name,
          coordinates: [
            place.geometry.location.lng,
            place.geometry.location.lat,
          ] as [number, number],
          placeId,
          formattedAddress: place.formatted_address,
          rating: place.rating,
          website: place.website,
          url: place.url,
          openingHours: place.opening_hours,
          photos: place.photos?.slice(0, 3).map((photo: any) => ({
            reference: photo.photo_reference,
            width: photo.width,
            height: photo.height,
            url: photo.photo_reference && googleApiKey 
              ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${googleApiKey}`
              : undefined,
          })),
          photoUrl: place.photos?.[0]?.photo_reference && googleApiKey
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${googleApiKey}`
            : undefined,
          source: 'google',
        };

        // Cache the result
        geocodeCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return NextResponse.json(result);
      }

      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Invalid request parameters' },
      { status: 400 },
    );
  } catch (error) {
    console.error('Places API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
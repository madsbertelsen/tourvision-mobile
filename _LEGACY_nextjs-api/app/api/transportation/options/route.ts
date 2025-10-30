import { NextResponse, type NextRequest } from 'next/server';

interface TransportationOption {
  mode: 'walking' | 'metro' | 'bus' | 'taxi' | 'uber' | 'bike' | 'car' | 'train';
  duration: number; // seconds
  distance: number; // meters
  formattedDuration: string;
  formattedDistance: string;
  estimatedCost?: number;
  routeUrl: string;
  recommended?: boolean;
}

// Map our transport modes to Mapbox profiles
const MODE_TO_PROFILE: Record<string, string> = {
  walking: 'walking',
  car: 'driving',
  taxi: 'driving',
  uber: 'driving',
  bike: 'cycling',
  // For transit modes, we'll use walking as approximation
  metro: 'walking',
  bus: 'walking',
  train: 'walking',
};

// Estimated costs per mode (in USD)
const COST_ESTIMATES = {
  walking: 0,
  bike: 0,
  bus: 2.5,
  metro: 2.5,
  car: (distance: number) => (distance / 1000) * 0.5, // $0.50 per km
  taxi: (distance: number) => 5 + (distance / 1000) * 2, // $5 base + $2 per km
  uber: (distance: number) => 4 + (distance / 1000) * 1.8, // $4 base + $1.80 per km
  train: 10,
};

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  if (km < 1) {
    return `${Math.round(meters)} m`;
  }
  return `${km.toFixed(1)} km`;
}

function estimateCost(mode: string, distance: number): number | undefined {
  const costFn = COST_ESTIMATES[mode as keyof typeof COST_ESTIMATES];
  if (!costFn) return undefined;
  if (typeof costFn === 'function') {
    return Math.round(costFn(distance) * 100) / 100;
  }
  return costFn;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fromLat = searchParams.get('fromLat');
    const fromLng = searchParams.get('fromLng');
    const toLat = searchParams.get('toLat');
    const toLng = searchParams.get('toLng');

    if (!fromLat || !fromLng || !toLat || !toLng) {
      return NextResponse.json(
        { error: 'From and to coordinates are required' },
        { status: 400 }
      );
    }

    const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    
    if (!mapboxToken) {
      return NextResponse.json(
        { error: 'Mapbox token not configured' },
        { status: 500 }
      );
    }

    // Define modes to fetch
    const modes = ['walking', 'car', 'bike', 'metro', 'bus', 'taxi', 'uber'];
    const options: TransportationOption[] = [];

    // Fetch basic route info for each mode (just to get duration/distance)
    const fetchPromises = modes.map(async (mode) => {
      const profile = MODE_TO_PROFILE[mode] || 'driving';
      const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json();
        if (!data.routes || data.routes.length === 0) return null;
        
        const route = data.routes[0];
        
        // Adjust duration for transit modes (rough estimates)
        let adjustedDuration = route.duration;
        if (mode === 'metro' || mode === 'bus') {
          adjustedDuration = route.duration * 0.8; // Transit can be faster than walking
        } else if (mode === 'train') {
          adjustedDuration = route.duration * 0.6; // Train is usually faster
        }
        
        return {
          mode: mode as TransportationOption['mode'],
          duration: adjustedDuration,
          distance: route.distance,
          formattedDuration: formatDuration(adjustedDuration),
          formattedDistance: formatDistance(route.distance),
          estimatedCost: estimateCost(mode, route.distance),
          routeUrl: `/api/route?coordinates=${coordinates}&mode=${profile}`,
          recommended: false,
        };
      } catch (error) {
        console.error(`Failed to fetch route for ${mode}:`, error);
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);
    const validOptions = results.filter((opt): opt is TransportationOption => opt !== null);

    // Mark the fastest option as recommended
    if (validOptions.length > 0) {
      const fastest = validOptions.reduce((prev, current) => 
        prev.duration < current.duration ? prev : current
      );
      fastest.recommended = true;
      options.push(...validOptions);
    }

    // Sort by duration
    options.sort((a, b) => a.duration - b.duration);

    return NextResponse.json(options, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300', // Cache for 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Transportation options API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transportation options' },
      { status: 500 }
    );
  }
}
import { NextResponse, type NextRequest } from 'next/server';

// OPTIONS handler for CORS preflight
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

// GET handler for cacheable route requests
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coordinates = searchParams.get('coordinates');
    const mode = searchParams.get('mode') || 'driving';

    if (!coordinates) {
      return NextResponse.json(
        { error: 'Coordinates are required' },
        { status: 400 }
      );
    }

    // Map mode to Mapbox profile
    const profile = mode === 'driving' ? 'driving-traffic' : mode;
    
    // Mapbox Directions API
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    
    if (!mapboxToken) {
      return NextResponse.json(
        { error: 'Mapbox token not configured' },
        { status: 500 }
      );
    }

    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      return NextResponse.json(
        { error: 'No route found' },
        { status: 404 }
      );
    }

    // Return the first route with cache headers
    const route = data.routes[0];
    
    return NextResponse.json(
      {
        geometry: route.geometry,
        distance: route.distance, // in meters
        duration: route.duration, // in seconds
        legs: route.legs, // detailed segments if there are waypoints
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error) {
    console.error('Route API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch route' },
      { status: 500 }
    );
  }
}
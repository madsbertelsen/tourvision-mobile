import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const city = searchParams.get('city');
    const categories = searchParams.get('categories')?.split(',') || ['tourist_attraction', 'restaurant', 'museum'];
    
    if (!city) {
      return NextResponse.json(
        { error: 'City parameter is required' },
        { status: 400 }
      );
    }

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!googleApiKey) {
      console.warn('No GOOGLE_PLACES_API_KEY configured');
      // Return mock Barcelona data for testing
      const mockBarcelonaPlaces = {
        city: 'Barcelona',
        destinations: [
          {
            id: 'sagrada-familia',
            name: 'Sagrada Familia',
            coordinates: [2.1744, 41.4036],
            category: 'attraction',
            description: 'Antoni Gaudí\'s unfinished masterpiece and Barcelona\'s most iconic landmark',
            rating: 4.7,
            priceLevel: '$$',
            tags: ['must-see', 'architecture', 'historic'],
            estimatedDuration: '2-3 hours',
            address: 'C/ de Mallorca, 401, 08013 Barcelona'
          },
          {
            id: 'park-guell',
            name: 'Park Güell',
            coordinates: [2.1527, 41.4145],
            category: 'attraction',
            description: 'Whimsical park with colorful mosaics and city views designed by Gaudí',
            rating: 4.5,
            priceLevel: '$$',
            tags: ['park', 'architecture', 'views', 'must-see'],
            estimatedDuration: '2 hours',
            address: '08024 Barcelona'
          },
          {
            id: 'la-rambla',
            name: 'La Rambla',
            coordinates: [2.1734, 41.3814],
            category: 'attraction',
            description: 'Famous tree-lined pedestrian street filled with shops and street performers',
            rating: 4.2,
            priceLevel: '$',
            tags: ['shopping', 'historic', 'walking'],
            estimatedDuration: '1-2 hours',
            address: 'La Rambla, Barcelona'
          },
          {
            id: 'casa-batllo',
            name: 'Casa Batlló',
            coordinates: [2.1649, 41.3916],
            category: 'attraction',
            description: 'Fantastical Gaudí-designed house with dragon-inspired roof',
            rating: 4.6,
            priceLevel: '$$$',
            tags: ['architecture', 'historic', 'must-see'],
            estimatedDuration: '1-2 hours',
            address: 'Pg. de Gràcia, 43, 08007 Barcelona'
          },
          {
            id: 'barceloneta-beach',
            name: 'Barceloneta Beach',
            coordinates: [2.1896, 41.3797],
            category: 'nature',
            description: 'Popular urban beach with golden sand and waterfront restaurants',
            rating: 4.3,
            priceLevel: '$',
            tags: ['beach', 'relaxation', 'swimming'],
            estimatedDuration: '2-4 hours',
            address: 'Passeig Marítim de la Barceloneta, Barcelona'
          },
          {
            id: 'gothic-quarter',
            name: 'Gothic Quarter (Barri Gòtic)',
            coordinates: [2.1769, 41.3829],
            category: 'attraction',
            description: 'Medieval streets filled with history, shops, and hidden squares',
            rating: 4.5,
            priceLevel: '$',
            tags: ['historic', 'walking', 'shopping', 'must-see'],
            estimatedDuration: '2-3 hours',
            address: 'Barri Gòtic, Barcelona'
          },
          {
            id: 'camp-nou',
            name: 'Camp Nou',
            coordinates: [2.1228, 41.3809],
            category: 'attraction',
            description: 'Home stadium of FC Barcelona and largest stadium in Europe',
            rating: 4.5,
            priceLevel: '$$',
            tags: ['sports', 'stadium', 'football'],
            estimatedDuration: '1-2 hours',
            address: 'C. d\'Arístides Maillol, 12, 08028 Barcelona'
          },
          {
            id: 'boqueria-market',
            name: 'Mercat de la Boqueria',
            coordinates: [2.1716, 41.3819],
            category: 'attraction',
            description: 'Vibrant public market with fresh produce, seafood, and tapas bars',
            rating: 4.4,
            priceLevel: '$$',
            tags: ['market', 'food', 'local', 'must-see'],
            estimatedDuration: '1 hour',
            address: 'La Rambla, 91, 08001 Barcelona'
          },
          {
            id: 'tibidabo',
            name: 'Tibidabo',
            coordinates: [2.1188, 41.4225],
            category: 'attraction',
            description: 'Mountain peak with amusement park and panoramic city views',
            rating: 4.4,
            priceLevel: '$$',
            tags: ['views', 'amusement park', 'family-friendly'],
            estimatedDuration: '3-4 hours',
            address: 'Plaça del Tibidabo, 3-4, 08035 Barcelona'
          },
          {
            id: 'montjuic',
            name: 'Montjuïc',
            coordinates: [2.1631, 41.3648],
            category: 'nature',
            description: 'Hill with gardens, museums, and Olympic facilities',
            rating: 4.5,
            priceLevel: '$',
            tags: ['park', 'views', 'museums', 'historic'],
            estimatedDuration: '3-4 hours',
            address: 'Montjuïc, Barcelona'
          },
          {
            id: 'tickets-bar',
            name: 'Tickets Bar',
            coordinates: [2.1658, 41.3752],
            category: 'restaurant',
            description: 'Innovative tapas restaurant by Albert Adrià',
            rating: 4.4,
            priceLevel: '$$$$',
            tags: ['fine dining', 'tapas', 'molecular gastronomy'],
            estimatedDuration: '2 hours',
            address: 'Av. del Paral·lel, 164, 08015 Barcelona'
          },
          {
            id: 'cal-pep',
            name: 'Cal Pep',
            coordinates: [2.1831, 41.3856],
            category: 'restaurant',
            description: 'Famous tapas bar known for fresh seafood',
            rating: 4.5,
            priceLevel: '$$$',
            tags: ['tapas', 'seafood', 'local favorite'],
            estimatedDuration: '1-2 hours',
            address: 'Plaça de les Olles, 8, 08003 Barcelona'
          },
          {
            id: 'flamenco-show',
            name: 'Tablao Flamenco Cordobes',
            coordinates: [2.1738, 41.3796],
            category: 'activity',
            description: 'Authentic flamenco performances in intimate venue',
            rating: 4.5,
            priceLevel: '$$$',
            tags: ['cultural', 'music', 'dance', 'nightlife'],
            estimatedDuration: '1.5 hours',
            address: 'La Rambla, 35, 08002 Barcelona'
          },
          {
            id: 'picasso-museum',
            name: 'Picasso Museum',
            coordinates: [2.1807, 41.3852],
            category: 'attraction',
            description: 'Extensive collection of Picasso\'s early works',
            rating: 4.3,
            priceLevel: '$$',
            tags: ['museum', 'art', 'culture'],
            estimatedDuration: '1-2 hours',
            address: 'C/ de Montcada, 15-23, 08003 Barcelona'
          },
          {
            id: 'casa-mila',
            name: 'Casa Milà (La Pedrera)',
            coordinates: [2.1618, 41.3953],
            category: 'attraction',
            description: 'Gaudí\'s wavy stone apartment building with rooftop sculptures',
            rating: 4.5,
            priceLevel: '$$',
            tags: ['architecture', 'historic', 'rooftop views'],
            estimatedDuration: '1-2 hours',
            address: 'Passeig de Gràcia, 92, 08008 Barcelona'
          }
        ]
      };
      
      return NextResponse.json(mockBarcelonaPlaces);
    }

    // Use Google Places API to search for places
    const destinations = [];
    
    // First, get the city coordinates
    const citySearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(city)}&key=${googleApiKey}`;
    const cityResponse = await fetch(citySearchUrl);
    const cityData = await cityResponse.json();
    
    if (cityData.results && cityData.results.length > 0) {
      const cityLocation = cityData.results[0].geometry.location;
      
      // Map categories to Google Places types
      const categoryTypeMap: Record<string, string[]> = {
        'tourist_attraction': ['tourist_attraction', 'point_of_interest'],
        'restaurant': ['restaurant', 'cafe', 'bar'],
        'museum': ['museum', 'art_gallery'],
        'park': ['park'],
        'shopping': ['shopping_mall', 'store'],
        'activity': ['amusement_park', 'aquarium', 'zoo', 'stadium']
      };
      
      // Search for places in each category
      for (const category of categories) {
        const types = categoryTypeMap[category] || [category];
        
        for (const type of types) {
          const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${cityLocation.lat},${cityLocation.lng}&radius=10000&type=${type}&key=${googleApiKey}`;
          const nearbyResponse = await fetch(nearbyUrl);
          const nearbyData = await nearbyResponse.json();
          
          if (nearbyData.results) {
            // Take top 5 results per type
            const places = nearbyData.results.slice(0, 5).map((place: any) => ({
              id: place.place_id,
              name: place.name,
              coordinates: [place.geometry.location.lng, place.geometry.location.lat],
              category: category === 'tourist_attraction' ? 'attraction' : category,
              description: place.vicinity,
              rating: place.rating,
              priceLevel: place.price_level ? '$'.repeat(place.price_level) : undefined,
              tags: place.types?.slice(0, 3),
              address: place.vicinity,
              photoReference: place.photos?.[0]?.photo_reference,
              imageUrl: place.photos?.[0]?.photo_reference && googleApiKey
                ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${googleApiKey}`
                : undefined
            }));
            
            destinations.push(...places);
          }
        }
      }
      
      // Remove duplicates based on place_id
      const uniqueDestinations = destinations.filter((dest, index, self) => 
        index === self.findIndex(d => d.id === dest.id)
      );
      
      return NextResponse.json({
        city,
        destinations: uniqueDestinations.slice(0, 20) // Limit to 20 destinations
      });
    }
    
    return NextResponse.json(
      { error: 'City not found' },
      { status: 404 }
    );
    
  } catch (error) {
    console.error('Places explore API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch places' },
      { status: 500 }
    );
  }
}
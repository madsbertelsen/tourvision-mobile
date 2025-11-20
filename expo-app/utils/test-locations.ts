// Test location data for document map testing

export interface TestLocation {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  displayText?: string;
  colorIndex?: number;
  description?: string;
  transportProfile?: 'walking' | 'driving' | 'cycling';
  transportFrom?: string;
  waypoints?: Array<{ lat: number; lng: number }>;
}

export const testLocations: TestLocation[] = [
  {
    geoId: 'loc-cph-1',
    placeName: 'Copenhagen Central Station, Denmark',
    lat: 55.6731,
    lng: 12.5641,
    displayText: 'Copenhagen Central',
    colorIndex: 0,
    description: 'Main railway station and transportation hub'
  },
  {
    geoId: 'loc-tivoli-2',
    placeName: 'Tivoli Gardens, Copenhagen, Denmark',
    lat: 55.6737,
    lng: 12.5681,
    displayText: 'Tivoli Gardens',
    colorIndex: 1,
    description: 'Historic amusement park and pleasure garden'
    // Transport configuration removed - users can configure any routes
  },
  {
    geoId: 'loc-nyhavn-3',
    placeName: 'Nyhavn, Copenhagen, Denmark',
    lat: 55.6797,
    lng: 12.5892,
    displayText: 'Nyhavn',
    colorIndex: 2,
    description: '17th-century waterfront and entertainment district'
    // Transport configuration removed - users can configure any routes
  },
  {
    geoId: 'loc-mermaid-4',
    placeName: 'The Little Mermaid, Copenhagen, Denmark',
    lat: 55.6929,
    lng: 12.5993,
    displayText: 'Little Mermaid',
    colorIndex: 3,
    description: 'Iconic bronze statue on a waterside promenade'
    // Transport configuration removed - users can configure any routes
  },
  {
    geoId: 'loc-rosenborg-5',
    placeName: 'Rosenborg Castle, Copenhagen, Denmark',
    lat: 55.6859,
    lng: 12.5775,
    displayText: 'Rosenborg Castle',
    colorIndex: 4,
    description: 'Renaissance castle housing crown jewels'
    // Transport configuration removed - users can configure any routes
  }
];

export const getTestBounds = (locations: TestLocation[]) => {
  if (locations.length === 0) {
    // Default to Copenhagen center
    return {
      ne: [12.6, 55.7],
      sw: [12.5, 55.65]
    };
  }

  if (locations.length === 1) {
    const loc = locations[0];
    return {
      ne: [loc.lng + 0.01, loc.lat + 0.01],
      sw: [loc.lng - 0.01, loc.lat - 0.01]
    };
  }

  const lngs = locations.map(loc => loc.lng);
  const lats = locations.map(loc => loc.lat);

  // Add some padding to the bounds
  const lngPadding = 0.005;
  const latPadding = 0.005;

  return {
    ne: [Math.max(...lngs) + lngPadding, Math.max(...lats) + latPadding],
    sw: [Math.min(...lngs) - lngPadding, Math.min(...lats) - latPadding]
  };
};

// Function to generate a test document with locations
export const generateTestDocument = () => {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Copenhagen City Tour' }]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'A walking tour through the highlights of Copenhagen, starting at ' },
          {
            type: 'text',
            marks: [{
              type: 'geoMark',
              attrs: testLocations[0]
            }],
            text: 'Copenhagen Central Station'
          },
          { type: 'text', text: ' and ending at ' },
          {
            type: 'text',
            marks: [{
              type: 'geoMark',
              attrs: testLocations[4]
            }],
            text: 'Rosenborg Castle'
          },
          { type: 'text', text: '.' }
        ]
      }
    ]
  };
};
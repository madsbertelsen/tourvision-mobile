/**
 * Location graph builder utility
 * Builds a connected graph of locations using geo-IDs and transport references
 */

export interface LocationNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  photoName?: string;
  colorIndex?: number;
}

export interface TransportEdge {
  from: string; // geo-ID of origin
  to: string; // geo-ID of destination
  profile: 'walking' | 'driving' | 'cycling' | 'transit';
  distance?: number; // meters (to be calculated)
  duration?: number; // seconds (to be calculated)
  waypoints?: Array<{ lat: number; lng: number }>; // Optional waypoints for complex routes
}

export interface LocationGraph {
  nodes: Map<string, LocationNode>;
  edges: TransportEdge[];
  roots: string[]; // Starting points (nodes with no incoming edges)
  getNode: (id: string) => LocationNode | undefined;
  getOutgoingEdges: (nodeId: string) => TransportEdge[];
  getIncomingEdges: (nodeId: string) => TransportEdge[];
  getRoute: (fromId: string, toId: string) => TransportEdge | undefined;
  getAllRoutes: () => TransportEdge[];
  getConnectedComponents: () => LocationNode[][];
  toJSON: () => SerializedLocationGraph;
}

export interface SerializedLocationGraph {
  nodes: Array<LocationNode & { id: string }>;
  edges: TransportEdge[];
}

/**
 * Build a location graph from parsed locations
 */
export function buildLocationGraph(
  locations: Array<{
    id?: string;
    name: string;
    lat: number;
    lng: number;
    description?: string;
    photoName?: string;
    colorIndex?: number;
    geoId?: string;
    transportFrom?: string;
    transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit';
  }>
): LocationGraph {
  const nodes = new Map<string, LocationNode>();
  const edges: TransportEdge[] = [];
  const incomingEdges = new Map<string, TransportEdge[]>();
  const outgoingEdges = new Map<string, TransportEdge[]>();

  // First pass: Create nodes
  locations.forEach((loc) => {
    const nodeId = loc.geoId || loc.id || `auto-${nodes.size}`;

    if (!nodes.has(nodeId)) {
      nodes.set(nodeId, {
        id: nodeId,
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        description: loc.description,
        photoName: loc.photoName,
        colorIndex: loc.colorIndex,
      });
    }
  });

  // Second pass: Create edges
  locations.forEach((loc) => {
    const nodeId = loc.geoId || loc.id || `auto-${Array.from(nodes.keys()).indexOf(loc.name)}`;

    if (loc.transportFrom && loc.transportProfile) {
      const edge: TransportEdge = {
        from: loc.transportFrom,
        to: nodeId,
        profile: loc.transportProfile,
      };

      edges.push(edge);

      // Track incoming edges
      if (!incomingEdges.has(nodeId)) {
        incomingEdges.set(nodeId, []);
      }
      incomingEdges.get(nodeId)!.push(edge);

      // Track outgoing edges
      if (!outgoingEdges.has(loc.transportFrom)) {
        outgoingEdges.set(loc.transportFrom, []);
      }
      outgoingEdges.get(loc.transportFrom)!.push(edge);
    }
  });

  // Find root nodes (no incoming edges)
  const roots: string[] = [];
  nodes.forEach((node, id) => {
    if (!incomingEdges.has(id) || incomingEdges.get(id)!.length === 0) {
      roots.push(id);
    }
  });

  // Create the graph object
  const graph: LocationGraph = {
    nodes,
    edges,
    roots,

    getNode: (id: string) => nodes.get(id),

    getOutgoingEdges: (nodeId: string) => {
      return outgoingEdges.get(nodeId) || [];
    },

    getIncomingEdges: (nodeId: string) => {
      return incomingEdges.get(nodeId) || [];
    },

    getRoute: (fromId: string, toId: string) => {
      return edges.find(e => e.from === fromId && e.to === toId);
    },

    getAllRoutes: () => edges,

    getConnectedComponents: () => {
      const visited = new Set<string>();
      const components: LocationNode[][] = [];

      const dfs = (nodeId: string, component: LocationNode[]) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const node = nodes.get(nodeId);
        if (node) {
          component.push(node);

          // Visit all connected nodes
          const outgoing = outgoingEdges.get(nodeId) || [];
          const incoming = incomingEdges.get(nodeId) || [];

          outgoing.forEach(edge => dfs(edge.to, component));
          incoming.forEach(edge => dfs(edge.from, component));
        }
      };

      nodes.forEach((node, id) => {
        if (!visited.has(id)) {
          const component: LocationNode[] = [];
          dfs(id, component);
          if (component.length > 0) {
            components.push(component);
          }
        }
      });

      return components;
    },

    toJSON: () => {
      return {
        nodes: Array.from(nodes.values()),
        edges,
      };
    },
  };

  return graph;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Estimate travel duration based on distance and transport profile
 */
export function estimateDuration(
  distance: number, // meters
  profile: 'walking' | 'driving' | 'cycling' | 'transit'
): number {
  // Average speeds in m/s
  const speeds = {
    walking: 1.4, // ~5 km/h
    cycling: 4.2, // ~15 km/h
    driving: 13.9, // ~50 km/h (city driving)
    transit: 8.3, // ~30 km/h (includes stops)
  };

  return Math.round(distance / speeds[profile]); // Duration in seconds
}

/**
 * Enhance graph edges with calculated distances and durations
 */
export function enhanceGraphWithDistances(graph: LocationGraph): void {
  graph.edges.forEach(edge => {
    const fromNode = graph.getNode(edge.from);
    const toNode = graph.getNode(edge.to);

    if (fromNode && toNode) {
      edge.distance = calculateDistance(
        fromNode.lat,
        fromNode.lng,
        toNode.lat,
        toNode.lng
      );
      edge.duration = estimateDuration(edge.distance, edge.profile);
    }
  });
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes} min`;
  } else {
    return `< 1 min`;
  }
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  } else {
    return `${(meters / 1000).toFixed(1)} km`;
  }
}

/**
 * Get transport mode emoji
 */
export function getTransportEmoji(profile: 'walking' | 'driving' | 'cycling' | 'transit'): string {
  const emojis = {
    walking: '🚶',
    driving: '🚗',
    cycling: '🚴',
    transit: '🚌',
  };
  return emojis[profile];
}

/**
 * Generate a textual summary of the graph
 */
export function summarizeGraph(graph: LocationGraph): string {
  const nodeCount = graph.nodes.size;
  const edgeCount = graph.edges.length;
  const components = graph.getConnectedComponents();

  let summary = `Location Graph Summary:\n`;
  summary += `- ${nodeCount} locations\n`;
  summary += `- ${edgeCount} routes\n`;
  summary += `- ${components.length} connected trip${components.length !== 1 ? 's' : ''}\n`;

  if (graph.roots.length > 0) {
    summary += `\nStarting points:\n`;
    graph.roots.forEach(rootId => {
      const node = graph.getNode(rootId);
      if (node) {
        summary += `  • ${node.name}\n`;
      }
    });
  }

  if (edgeCount > 0) {
    summary += `\nRoutes:\n`;
    graph.edges.forEach(edge => {
      const from = graph.getNode(edge.from);
      const to = graph.getNode(edge.to);
      if (from && to) {
        const emoji = getTransportEmoji(edge.profile);
        const distance = edge.distance ? ` (${formatDistance(edge.distance)})` : '';
        const duration = edge.duration ? ` ~${formatDuration(edge.duration)}` : '';
        summary += `  ${emoji} ${from.name} → ${to.name}${distance}${duration}\n`;
      }
    });
  }

  return summary;
}
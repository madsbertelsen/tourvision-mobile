import React, { useEffect, useState } from 'react';

interface HexGridOverlayProps {
  width: number;
  height: number;
  focusedLocation: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    description?: string;
  } | null;
  locationScreenPos?: { x: number; y: number };
  onClose: () => void;
}

// Generate hexagonal grid positions for flat-top hexagons
function generateHexGrid(width: number, height: number, hexSize: number) {
  // Based on Red Blob Games formulas for flat-top hexagons
  // horiz = 3/2 * size, vert = sqrt(3) * size
  const horiz = hexSize * 1.5; // Horizontal spacing between columns
  const vert = Math.sqrt(3) * hexSize; // Vertical spacing between rows

  const cells: { x: number; y: number; col: number; row: number }[] = [];

  // Calculate grid dimensions
  const cols = Math.ceil(width / horiz) + 2;
  const rows = Math.ceil(height / vert) + 2;

  // Generate hexagons using odd-q offset (odd columns are pushed down)
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      // Calculate position
      const x = col * horiz;
      const y = row * vert + (col % 2) * (vert / 2); // Odd columns offset by half vertical spacing

      cells.push({ x, y, col, row });
    }
  }

  return cells;
}

// Create SVG path for flat-top hexagon
function hexagonPath(x: number, y: number, size: number) {
  const points: [number, number][] = [];
  // Flat-top hexagon: vertices at 0°, 60°, 120°, 180°, 240°, 300°
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i;
    const angle_rad = (Math.PI / 180) * angle_deg;
    points.push([
      x + size * Math.cos(angle_rad),
      y + size * Math.sin(angle_rad)
    ]);
  }
  return `M ${points.map(p => p.join(',')).join(' L ')} Z`;
}

// Get vertices of a hexagon
function getHexagonVertices(x: number, y: number, size: number): [number, number][] {
  const vertices: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i;
    const angle_rad = (Math.PI / 180) * angle_deg;
    vertices.push([
      x + size * Math.cos(angle_rad),
      y + size * Math.sin(angle_rad)
    ]);
  }
  return vertices;
}

export default function HexGridOverlay({ width, height, focusedLocation, locationScreenPos, onClose }: HexGridOverlayProps) {
  const [animatedCells, setAnimatedCells] = useState<Set<string>>(new Set());
  const hexSize = 30;

  const cells = generateHexGrid(width, height, hexSize);

  // Define transparent radius (in pixels) - all cells within this distance are transparent
  const transparentRadius = hexSize * 3; // Approximately 2-3 hexagon rings

  // Determine which cells are in upper right corner (for content display)
  const upperRightCells = cells
    .filter(cell => {
      const isRightSide = cell.x > width * 0.6;
      const isUpperSide = cell.y < height * 0.4;
      return isRightSide && isUpperSide;
    })
    .slice(0, 8); // Take first 8 cells for content

  useEffect(() => {
    if (!focusedLocation) {
      setAnimatedCells(new Set());
      return;
    }

    // Animate cells one by one with delay
    const cellIds = upperRightCells.map((cell, i) => `${cell.col}-${cell.row}`);

    cellIds.forEach((id, index) => {
      setTimeout(() => {
        setAnimatedCells(prev => new Set([...prev, id]));
      }, index * 50);
    });
  }, [focusedLocation]);

  // Find boundary vertices
  const boundaryVertices: [number, number][] = [];
  if (locationScreenPos) {
    const vertexMap = new Map<string, { filled: boolean; transparent: boolean }>();

    cells.forEach(cell => {
      const dx = cell.x - locationScreenPos.x;
      const dy = cell.y - locationScreenPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isFilled = distance > transparentRadius;

      const vertices = getHexagonVertices(cell.x, cell.y, hexSize);
      vertices.forEach(([vx, vy]) => {
        const key = `${vx.toFixed(1)},${vy.toFixed(1)}`;
        const existing = vertexMap.get(key) || { filled: false, transparent: false };
        if (isFilled) {
          existing.filled = true;
        } else {
          existing.transparent = true;
        }
        vertexMap.set(key, existing);
      });
    });

    // Find vertices that are on the boundary
    vertexMap.forEach((value, key) => {
      if (value.filled && value.transparent) {
        const [x, y] = key.split(',').map(Number);
        boundaryVertices.push([x, y]);
      }
    });

    // Sort vertices by angle to form a continuous path
    boundaryVertices.sort((a, b) => {
      const angleA = Math.atan2(a[1] - locationScreenPos.y, a[0] - locationScreenPos.x);
      const angleB = Math.atan2(b[1] - locationScreenPos.y, b[0] - locationScreenPos.x);
      return angleA - angleB;
    });
  }

  if (!focusedLocation) return null;

  // Calculate the left edge of the overlay view (where transparent region ends)
  // Add extra margin (hexSize) to ensure it doesn't overlap transparent cells
  const overlayLeft = locationScreenPos ? locationScreenPos.x + transparentRadius + hexSize : width * 0.5;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      {/* Hex grid overlay */}
      <svg
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {cells.map((cell, i) => {
          // Calculate distance from cell center to location screen position
          let shouldFill = true;
          if (locationScreenPos) {
            const dx = cell.x - locationScreenPos.x;
            const dy = cell.y - locationScreenPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Cell is transparent if within the radius
            shouldFill = distance > transparentRadius;
          }

          return (
            <path
              key={i}
              d={hexagonPath(cell.x, cell.y, hexSize)}
              fill={shouldFill ? "rgba(255, 255, 255, 1)" : "none"}
              stroke="none"
            />
          );
        })}

        {/* Render connected boundary line */}
        {boundaryVertices.length > 0 && (
          <polygon
            points={boundaryVertices.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="rgba(0, 0, 0, 1)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
      </svg>

      {/* Dynamic overlay view extending from transparent region to right edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: `${overlayLeft}px`,
          right: 0,
          height: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'auto',
          zIndex: 101,
          padding: '32px 24px',
          overflowY: 'auto',
          borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: '600',
            color: '#111',
            letterSpacing: '-0.02em',
          }}>
            {focusedLocation.name.split(',')[0]}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0, 0, 0, 0.04)',
              border: 'none',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              padding: 0,
              marginLeft: '16px',
              color: '#666',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.08)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
          >
            ×
          </button>
        </div>

        <div style={{
          fontSize: '13px',
          color: '#999',
          marginBottom: '20px',
          fontFamily: 'monospace',
        }}>
          {focusedLocation.lat.toFixed(6)}, {focusedLocation.lng.toFixed(6)}
        </div>

        {focusedLocation.description && (
          <p style={{
            margin: 0,
            fontSize: '15px',
            color: '#444',
            lineHeight: '1.6',
            fontWeight: '400',
          }}>
            {focusedLocation.description}
          </p>
        )}
      </div>
    </div>
  );
}

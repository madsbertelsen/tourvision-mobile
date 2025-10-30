// Diverse color palette for unique location markers
export const locationColors = [
  '#3B82F6', // blue
  '#10B981', // green
  '#9333EA', // purple
  '#F97316', // orange
  '#EC4899', // pink
  '#0EA5E9', // sky blue
  '#22C55E', // lime green
  '#A855F7', // violet
  '#F59E0B', // amber
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#C084FC', // plum
  '#FB923C', // orange light
  '#F472B6', // pink light
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#8B5CF6', // purple medium
  '#FACC15', // yellow
  '#DC2626', // red dark
];

export function getMarkerColor(index: number): string {
  // Use modulo to cycle through colors if there are more locations than colors
  return locationColors[index % locationColors.length];
}

// Get a lighter shade of the color for hover effects
export function getLighterShade(hexColor: string, opacity = 0.2): string {
  // Convert hex to RGB
  const r = Number.parseInt(hexColor.slice(1, 3), 16);
  const g = Number.parseInt(hexColor.slice(3, 5), 16);
  const b = Number.parseInt(hexColor.slice(5, 7), 16);
  
  // Return rgba with opacity
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Get color name for accessibility
export function getColorName(index: number): string {
  const names = [
    'blue', 'green', 'purple', 'orange', 'pink',
    'sky blue', 'lime green', 'violet', 'amber', 'red',
    'cyan', 'lime', 'plum', 'light orange', 'light pink',
    'indigo', 'teal', 'medium purple', 'yellow', 'dark red'
  ];
  return names[index % names.length] || 'blue';
}
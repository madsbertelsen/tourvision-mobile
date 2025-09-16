# Git-Style Branching Visualization for Trip Itineraries

## Overview
This document describes the approach for visualizing trip itineraries with parallel activities using Git-style branching diagrams. The visualization represents how travel groups can split into subgroups, pursue different activities, and merge back together.

## Core Concepts

### 1. Grid-Based Layout
- Each card represents a **400x400px container**
- Cards are arranged in a grid (columns × rows)
- Each column represents a branch path
- Each row represents a point in time

### 2. Stacked SVG Approach
The visualization uses **layered SVG elements**:
```html
<!-- Base layer: Main branch -->
<svg style="position: absolute;">
  <!-- Blue vertical line -->
</svg>

<!-- Overlay layer: Additional branches -->
<svg style="position: absolute;">
  <!-- Green/Red branch lines -->
</svg>
```

### 3. Branch Components

#### Vertical Lines
- Represent continuous branch progression
- Color-coded: Blue (main), Green (branch 1), Red (branch 2)

#### Horizontal Lines
- Represent branch splits from a common point
- Connect branch points across columns

#### Curved Connections
- Quarter-circle arcs using quadratic Bezier curves
- Smooth transitions at branch and merge points
- Formula: `Q controlX controlY, endX endY`

#### Commit Dots
- **One dot per row maximum** (representing single point in time)
- Filled circles with branch color
- Border for visual clarity

## Implementation Details

### HTML Structure
```html
<div style="display: flex; flex-direction: column;">
  <!-- Row -->
  <div style="display: flex;">
    <!-- Column 1: Container -->
    <div class="container">
      <svg><!-- Branch visuals --></svg>
    </div>
    <!-- Column 2: Container -->
    <div class="container">
      <svg><!-- Branch visuals --></svg>
    </div>
    <!-- Description -->
    <div class="description">
      <span>Commit description</span>
    </div>
  </div>
</div>
```

### Visual Flow Pattern

1. **Branch Split**: Single line diverges into multiple paths
   ```
   ──●── (before)
     ├── (after - branch 1)
     └── (after - branch 2)
   ```

2. **Parallel Progression**: Each branch continues in its column
   ```
   │ │ │
   │ │ │
   ● │ │ (commits on different branches)
   ```

3. **Branch Merge**: Branches converge back
   ```
   │ └─● (merge point)
   │
   ```

## Use Cases in Trip Planning

### Example Scenario
**Barcelona Trip - Day 1**:
1. **Row 1**: Group starts together at Sagrada Familia (branch point)
2. **Row 2**: Main group continues to Hotel Casa Fuster
3. **Row 3**:
   - Blue/Purple users: Gothic Quarter
   - Green user: Barceloneta Beach (parallel activity)
   - Red user: Park Güell (parallel activity)
4. **Row 4-5**: Activities continue
5. **Row 5**: Red merges with Green (groups reconverge partially)
6. **Row 6-7**: All groups eventually merge at Las Ramblas

### Benefits
- **Visual Clarity**: Clear representation of group splits/merges
- **Temporal Flow**: Vertical progression shows time sequence
- **Flexibility**: Supports multiple parallel activities
- **Familiar Metaphor**: Git users instantly understand the concept

## Technical Advantages

1. **Modular Design**: Each card is independent
2. **Scalable**: Easy to add more branches or rows
3. **Responsive**: SVG scales cleanly
4. **Performant**: Simple DOM structure
5. **Accessible**: Can add ARIA labels to describe flow

## Future Enhancements

1. **Interactive Elements**: Click to expand branch details
2. **Real-time Updates**: Show current position of travelers
3. **Annotations**: Add notes at specific points
4. **Time Labels**: Show actual times alongside rows
5. **Dynamic Rendering**: Generate from trip data structure

## React Native Implementation

For the mobile app, this translates to:
- `react-native-svg` for rendering
- Component-based architecture
- State management for dynamic updates
- Gesture handling for interactions

The approach demonstrated in `simple-branching.html` provides a foundation for building a sophisticated trip visualization system that handles complex group dynamics in an intuitive, visually appealing way.
# Git-Style Branching Visualization for Trip Itineraries

## Overview
This document describes the approach for visualizing trip itineraries with parallel activities using Git-style branching diagrams. The visualization represents how travel groups can split into subgroups, pursue different activities, and merge back together.

## Core Concepts

### 1. User-Centric Perspective
- **The leftmost column always shows the selected user's journey**
- Can view from ANY user's perspective (yourself or others)
- The selected user's path remains in the left column throughout
- Other users' activities branch off to the right
- This allows you to see any traveler's complete experience

### 2. Colors Represent Groups
- **Colors represent groups of people**, not paths or locations
- When a group splits, the original color ends and new colors begin
- When groups merge, they form a new group with a new color
- Example with travelers (Alex, Sam, Maya, Jordan):
  - Blue: All 4 together
  - Purple: Alex & Sam
  - Green: Maya alone
  - Red: Jordan alone
  - Orange: Maya & Jordan together

### 3. Grid-Based Layout
- Each card represents a **400x400px container**
- Cards are arranged in a grid (columns × rows)
- Each column represents a branch path
- Each row represents a specific point in time with exactly one activity

### 4. Stacked SVG Approach
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

### 5. Branch Components

#### Vertical Lines
- Represent continuous group progression
- Color changes indicate group transformation (split/merge)
- Each color represents a specific group composition

#### Horizontal Lines
- Show group transitions (splits/merges) between columns
- Connect related groups across the visualization

#### Curved Connections
- Quarter-circle arcs using quadratic Bezier curves
- Smooth transitions at branch and merge points
- Formula: `Q controlX controlY, endX endY`

#### Commit Dots
- **One dot per row** (representing single activity at a point in time)
- Filled circles with group color
- Indicates where a group performs an activity
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
**Barcelona Trip - Day 1** (from simple-branching.html):

**Travelers:** Alex, Sam, Maya, Jordan

1. **Row 1**: Hotel Casa Fuster (Blue group - all 4 people together, then splits)
   - Blue line ends, Purple/Green/Red lines begin
2. **Row 2**: Gothic Quarter (Purple group - Alex & Sam)
3. **Row 3**: Barceloneta Beach (Green group - Maya alone)
4. **Row 4**: Park Güell (Red group - Jordan alone)
5. **Row 5**: Boqueria Market (Orange group - Maya & Jordan merged)
   - Red and Green lines end, Orange line begins
6. **Row 6**: Casa Batlló (Purple group - Alex & Sam continue)
7. **Row 7**: Las Ramblas (Blue group - everyone merged back together)
   - Purple and Orange lines end, Blue line resumes

### Key Principles
1. **Every row represents a meaningful activity/place** - no abstract descriptions
2. **Colors = Groups** - when groups change, colors change
3. **One activity per row** - maintains temporal consistency
4. **Splits/merges are implicit** - shown by the visualization, not described

### Benefits
- **Visual Clarity**: Clear representation of group dynamics
- **Temporal Flow**: Vertical progression shows time sequence
- **Group Identity**: Colors show who's traveling together
- **Flexibility**: Supports complex split/merge patterns
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
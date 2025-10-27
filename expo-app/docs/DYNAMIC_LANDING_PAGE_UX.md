# Dynamic ProseMirror Landing Page - UX Design Document

## Overview

The landing page features a **live demonstration** of TourVision's document editor. Instead of static marketing copy, visitors see an AI writing out TourVision's features in real-time, creating an immersive and memorable first impression.

## User Journey

### Phase 1: Initial Load (First Impression)

**What the user sees:**
- Clean white page with TourVision header and auth buttons
- Empty document area
- Animated cursor blinking at the start position

**What happens:**
- Page loads instantly (no waiting)
- User immediately understands this is an interactive experience
- Animation starts automatically after 500ms

### Phase 2: AI Writing Animation (15-20 seconds)

**Visual Experience:**

1. **Character-by-Character Typing**
   - Text appears one character at a time, like someone typing
   - Speed: ~30 characters per second with natural variation
   - Cursor follows the text, blinking every 500ms

2. **Smart Pausing**
   - Brief pause (200ms) after punctuation (. ! ?)
   - Longer pause (400ms) after paragraph breaks
   - Extra pause (300ms) when inserting location markers

3. **Content Structure**
   ```
   [H1] Create Stunning Travel Presentations

   [P] Transform your journeys into immersive stories. Plan,
       collaborate, and share beautiful travel presentations
       with the world.

   [H2] ✨ How It Works

   [P] 1. Explore & Plan - Add destinations like [Paris],
       [Tokyo], or [New York] with our AI-powered suggestions.

   [P] 2. Create Your Story - Add rich media, notes, and
       craft a compelling narrative for your journey.

   [P] 3. Present & Share - Transform your trip into an
       immersive video presentation or embed it anywhere.

   [H2] 🚀 Powerful Features

   [P] • Immersive Presentations - Transform trips into
       cinematic video experiences

   [P] • AI-Powered Planning - Get smart suggestions and
       auto-generated itineraries

   [P] • Real-time Collaboration - Plan together with
       friends and family

   [P] • Public Sharing - Share presentations or embed
       them on your website

   [P] 👉 Try editing this document yourself! Click anywhere
       to add your own destinations, format text, or create
       your first travel story.
   ```

4. **Location Highlights**
   - Location names (Paris, Tokyo, New York) appear with colored backgrounds
   - Each location gets a unique color from the palette
   - Colors are semi-transparent (20% opacity) for readability
   - Demonstrates the geo-mark feature visually

**User Controls During Animation:**

- **⏸️ Pause/Resume Button** - Stop/continue the animation
- **⏭️ Skip Animation Button** - Jump to completion immediately
- **Progress Indicator** - Shows "Writing... X%" in bottom-right corner

### Phase 3: Animation Complete (Interactive State)

**Visual Transition:**

1. **Cursor Disappears** - Blinking cursor fades out
2. **Blue Banner Appears** - Top banner with message:
   ```
   👉 Try editing this document yourself! Click anywhere to add
   your own destinations, format text, or create your first
   travel story.
   ```
3. **Document Becomes Editable** - User can now interact with content
4. **Control Buttons Disappear** - Pause/Skip/Progress removed

**Interactive Features:**

1. **Click to Edit**
   - Any text can be selected and modified
   - Typing adds new content immediately
   - Delete/backspace removes characters

2. **Location Markers are Clickable**
   - Clicking a location (Paris, Tokyo, NYC) could:
     - Show tooltip with details
     - Open modal with location info
     - Focus map view (if map shown)
   - Visual hover state on locations

3. **Rich Text Formatting** (if toolbar shown)
   - Bold, italic, headings
   - Lists and paragraphs
   - Add new location markers

4. **Real-time Updates**
   - Changes save instantly (local state)
   - Demonstrates collaboration capability
   - Shows the "live" nature of the editor

### Phase 4: Call-to-Action (Conversion)

**After User Interaction:**

Once user has tried editing, emphasize conversion:

1. **Floating CTA** (appears after 30 seconds of interaction)
   ```
   💡 Ready to create your own travel presentations?
   [Start Creating for Free] [Login]
   ```

2. **Footer CTA** (always visible below document)
   ```
   Ready to create your first presentation?
   [Start Creating for Free]
   ```

## Design Principles

### 1. Show, Don't Tell
- Instead of describing features, demonstrate them
- User sees the editor in action before signing up
- Reduces uncertainty about product capabilities

### 2. Progressive Disclosure
- Start with simple content (heading, subtitle)
- Build complexity (lists, formatting, locations)
- End with call-to-action for deeper engagement

### 3. Sense of Magic
- AI writing effect creates "wow" moment
- Smooth animations feel polished and modern
- Location highlights add visual interest

### 4. User Agency
- Pause/skip controls respect user's time
- Interactive editing empowers exploration
- No forced watching - user is in control

### 5. Performance First
- Animation starts immediately (no loading)
- Smooth 60fps character rendering
- Lightweight implementation (no heavy libraries)

## Technical Implementation

### Animation System

**TypingAnimator Class:**
- Manages animation state (playing, paused, complete)
- Calculates delays between characters
- Emits document updates on each step
- Handles special commands (geo-marks, formatting)

**Progressive Document Building:**
- Builds partial ProseMirror document up to current position
- Maintains proper node structure (paragraphs, headings)
- Handles nested content (geo-marks with text inside)
- Updates on every character addition

**Rendering:**
- Simple React Native Text/View components
- No WebView or iframe needed for display
- CSS-like styling with React Native StyleSheet
- Efficient re-renders (only changed content)

### State Machine

```
[Initial] → [Animating] → [Complete] → [Interactive]
    ↓           ↓              ↓
 [Start]    [Pause/Resume]  [Edit Mode]
```

## Success Metrics

### Engagement Metrics
- **Animation Completion Rate** - % who watch to end vs skip
- **Interaction Rate** - % who try editing after animation
- **Time on Page** - Avg seconds spent on landing page
- **Scroll Depth** - How far users scroll after animation

### Conversion Metrics
- **Sign-up Rate** - % who click "Start Creating"
- **Login Rate** - % returning users who login
- **Bounce Rate** - % who leave without interaction

### Quality Metrics
- **Animation Smoothness** - Frame rate during typing
- **Load Time** - Time to first character rendered
- **Error Rate** - JS errors during animation/interaction

## Accessibility Considerations

### Motion Sensitivity
- Respect `prefers-reduced-motion` media query
- Skip animation entirely for sensitive users
- Show completed document immediately

### Screen Readers
- Announce animation state ("Writing in progress...")
- Read completed content naturally
- Ensure edit mode is accessible

### Keyboard Navigation
- Space/Enter to pause/resume animation
- Escape to skip to completion
- Tab through interactive elements

### Color Contrast
- Location highlights maintain WCAG AA contrast
- Text remains readable on colored backgrounds
- Dark mode support (future)

## Mobile Considerations

**Current State:**
- Landing page is web-only (Platform.OS === 'web')
- Mobile/tablet visitors see fallback static hero

**Future Enhancement:**
- Adapt animation for smaller screens
- Simpler content structure for mobile
- Touch-optimized editing controls
- Responsive layout (single column)

## A/B Testing Opportunities

### Test Variations

1. **Animation Speed**
   - Faster (50 chars/sec) vs Slower (20 chars/sec)
   - Measure completion rate vs engagement

2. **Content Length**
   - Short version (30 sec) vs Long version (60 sec)
   - Test attention span vs comprehension

3. **Interactive Prompt**
   - Banner vs Tooltip vs Modal
   - Test discoverability of edit mode

4. **Skip Button Placement**
   - Top-right vs Bottom-right vs Hidden
   - Measure skip rate vs frustration

## Future Enhancements

### 1. Map Integration
- Show interactive map alongside document
- Animate map camera to locations as they're typed
- Flying marker follows along with text

### 2. Personalization
- Detect user location, insert nearby destinations
- Show different content for different user segments
- A/B test content variations

### 3. Audio
- Subtle typing sound effects (optional)
- Background ambient music
- Voice-over reading the content

### 4. Multi-language
- Detect browser language
- Animate content in user's native language
- Maintain same pacing/structure

### 5. Advanced Interactions
- Drag locations onto map
- Real-time collaboration preview (multiple cursors)
- Export to PDF/PPT demo button

## Comparison to Traditional Landing Pages

| Traditional | Dynamic ProseMirror |
|-------------|---------------------|
| Static text | Live animation |
| Feature list | Live demonstration |
| Screenshots | Interactive editor |
| "Try demo" button | Already trying it |
| Trust through words | Trust through experience |
| Passive reading | Active engagement |

## Inspiration Sources

- **Stripe's API Docs** - Live code examples
- **Vercel's Deploy Animation** - Build logs streaming
- **GitHub Copilot Landing** - AI writing code live
- **Linear's Product Demo** - Interactive UI preview
- **Notion's Template Gallery** - Editable examples

## Conclusion

The Dynamic ProseMirror Landing Page transforms the first-touch experience from passive information consumption to active product demonstration. By showing rather than telling, we create memorable engagement that builds trust and drives conversion.

The AI writing animation serves as both entertainment and education, demonstrating core product capabilities (real-time editing, location marking, rich formatting) before requiring any commitment from the user.

This approach positions TourVision as innovative, confident in its product, and user-centric—willing to let visitors "try before they buy" in a meaningful way.

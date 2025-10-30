/**
 * Preference Detector
 * Analyzes user messages and conversation history to extract travel preferences
 */

export interface DetectedPreferences {
  // Core trip details
  destination?: string;
  duration?: number; // in days
  startDate?: string;
  roughDates?: string; // e.g., "next month", "summer"
  
  // Travel style
  budget?: 'budget' | 'mid-range' | 'luxury';
  pace?: 'relaxed' | 'moderate' | 'packed';
  
  // Group composition
  groupType?: 'solo' | 'couple' | 'family' | 'friends' | 'group';
  groupSize?: number;
  hasChildren?: boolean;
  childrenAges?: number[];
  
  // Interests and preferences
  interests?: string[];
  dietaryRestrictions?: string[];
  accessibility?: boolean;
  mustSee?: string[];
  avoidList?: string[];
  
  // Accommodation
  accommodationType?: string;
  
  // Transportation
  transportMode?: string[];
  hasCarRental?: boolean;
  
  // Context confidence
  confidence: {
    [key: string]: number; // 0-1 confidence score for each detected preference
  };
}

export interface ContextClue {
  keyword: string;
  preference: keyof DetectedPreferences;
  value: any;
  confidence: number;
}

// Keywords and patterns for detecting preferences
const PREFERENCE_PATTERNS: ContextClue[] = [
  // Budget indicators
  { keyword: 'budget', preference: 'budget', value: 'budget', confidence: 0.9 },
  { keyword: 'cheap', preference: 'budget', value: 'budget', confidence: 0.8 },
  { keyword: 'affordable', preference: 'budget', value: 'budget', confidence: 0.8 },
  { keyword: 'backpack', preference: 'budget', value: 'budget', confidence: 0.7 },
  { keyword: 'hostel', preference: 'budget', value: 'budget', confidence: 0.9 },
  { keyword: 'luxury', preference: 'budget', value: 'luxury', confidence: 0.9 },
  { keyword: 'premium', preference: 'budget', value: 'luxury', confidence: 0.8 },
  { keyword: 'five star', preference: 'budget', value: 'luxury', confidence: 0.9 },
  { keyword: '5 star', preference: 'budget', value: 'luxury', confidence: 0.9 },
  { keyword: 'boutique', preference: 'budget', value: 'luxury', confidence: 0.7 },
  
  // Pace indicators
  { keyword: 'relaxed', preference: 'pace', value: 'relaxed', confidence: 0.9 },
  { keyword: 'slow', preference: 'pace', value: 'relaxed', confidence: 0.8 },
  { keyword: 'leisurely', preference: 'pace', value: 'relaxed', confidence: 0.8 },
  { keyword: 'packed', preference: 'pace', value: 'packed', confidence: 0.9 },
  { keyword: 'busy', preference: 'pace', value: 'packed', confidence: 0.7 },
  { keyword: 'see everything', preference: 'pace', value: 'packed', confidence: 0.8 },
  { keyword: 'as much as possible', preference: 'pace', value: 'packed', confidence: 0.8 },
  
  // Group composition
  { keyword: 'solo', preference: 'groupType', value: 'solo', confidence: 0.9 },
  { keyword: 'alone', preference: 'groupType', value: 'solo', confidence: 0.9 },
  { keyword: 'myself', preference: 'groupType', value: 'solo', confidence: 0.7 },
  { keyword: 'partner', preference: 'groupType', value: 'couple', confidence: 0.9 },
  { keyword: 'wife', preference: 'groupType', value: 'couple', confidence: 0.9 },
  { keyword: 'husband', preference: 'groupType', value: 'couple', confidence: 0.9 },
  { keyword: 'girlfriend', preference: 'groupType', value: 'couple', confidence: 0.9 },
  { keyword: 'boyfriend', preference: 'groupType', value: 'couple', confidence: 0.9 },
  { keyword: 'couple', preference: 'groupType', value: 'couple', confidence: 1.0 },
  { keyword: 'family', preference: 'groupType', value: 'family', confidence: 0.9 },
  { keyword: 'kids', preference: 'hasChildren', value: true, confidence: 0.9 },
  { keyword: 'children', preference: 'hasChildren', value: true, confidence: 0.9 },
  { keyword: 'friends', preference: 'groupType', value: 'friends', confidence: 0.9 },
  
  // Dietary restrictions
  { keyword: 'vegetarian', preference: 'dietaryRestrictions', value: ['vegetarian'], confidence: 0.9 },
  { keyword: 'vegan', preference: 'dietaryRestrictions', value: ['vegan'], confidence: 0.9 },
  { keyword: 'gluten-free', preference: 'dietaryRestrictions', value: ['gluten-free'], confidence: 0.9 },
  { keyword: 'halal', preference: 'dietaryRestrictions', value: ['halal'], confidence: 0.9 },
  { keyword: 'kosher', preference: 'dietaryRestrictions', value: ['kosher'], confidence: 0.9 },
  { keyword: 'allergies', preference: 'dietaryRestrictions', value: ['allergies'], confidence: 0.7 },
  
  // Interests
  { keyword: 'food', preference: 'interests', value: ['food'], confidence: 0.8 },
  { keyword: 'foodie', preference: 'interests', value: ['food'], confidence: 0.9 },
  { keyword: 'restaurants', preference: 'interests', value: ['food'], confidence: 0.8 },
  { keyword: 'history', preference: 'interests', value: ['history'], confidence: 0.8 },
  { keyword: 'historical', preference: 'interests', value: ['history'], confidence: 0.8 },
  { keyword: 'museum', preference: 'interests', value: ['culture', 'art'], confidence: 0.8 },
  { keyword: 'art', preference: 'interests', value: ['art'], confidence: 0.9 },
  { keyword: 'nature', preference: 'interests', value: ['nature'], confidence: 0.8 },
  { keyword: 'outdoor', preference: 'interests', value: ['nature'], confidence: 0.8 },
  { keyword: 'hiking', preference: 'interests', value: ['nature', 'adventure'], confidence: 0.9 },
  { keyword: 'shopping', preference: 'interests', value: ['shopping'], confidence: 0.9 },
  { keyword: 'nightlife', preference: 'interests', value: ['nightlife'], confidence: 0.9 },
  { keyword: 'bars', preference: 'interests', value: ['nightlife'], confidence: 0.8 },
  { keyword: 'clubs', preference: 'interests', value: ['nightlife'], confidence: 0.8 },
  
  // Accessibility
  { keyword: 'wheelchair', preference: 'accessibility', value: true, confidence: 0.9 },
  { keyword: 'accessible', preference: 'accessibility', value: true, confidence: 0.8 },
  { keyword: 'mobility', preference: 'accessibility', value: true, confidence: 0.7 },
  { keyword: 'disabled', preference: 'accessibility', value: true, confidence: 0.8 },
];

/**
 * Extract preferences from a single message
 */
export function extractPreferencesFromMessage(message: string): DetectedPreferences {
  const lowerMessage = message.toLowerCase();
  const detected: DetectedPreferences = { confidence: {} };
  
  // Extract destination (simple heuristic - look for capitalized place names)
  const destinationMatch = message.match(/(?:to|in|visit|visiting|explore|exploring)\s+([A-Z][a-zA-Z\s]+)/);
  if (destinationMatch) {
    detected.destination = destinationMatch[1].trim();
    detected.confidence.destination = 0.8;
  }
  
  // Extract duration
  const durationMatch = message.match(/(\d+)\s*(?:day|days|night|nights|week|weeks)/i);
  if (durationMatch) {
    let days = Number.parseInt(durationMatch[1]);
    if (message.includes('week')) {
      days = days * 7;
    }
    detected.duration = days;
    detected.confidence.duration = 0.9;
  }
  
  // Extract dates
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const nextMonthMatch = message.match(/next\s+(month|week|weekend)/i);
  const monthMatch = message.match(new RegExp(`(${monthNames.join('|')})`, 'i'));
  
  if (nextMonthMatch) {
    detected.roughDates = nextMonthMatch[0];
    detected.confidence.roughDates = 0.8;
  } else if (monthMatch) {
    detected.roughDates = monthMatch[0];
    detected.confidence.roughDates = 0.7;
  }
  
  // Extract group size
  const groupSizeMatch = message.match(/(\d+)\s*(?:people|persons|adults)/i);
  if (groupSizeMatch) {
    detected.groupSize = Number.parseInt(groupSizeMatch[1]);
    detected.confidence.groupSize = 0.8;
  }
  
  // Apply pattern matching for other preferences
  for (const pattern of PREFERENCE_PATTERNS) {
    if (lowerMessage.includes(pattern.keyword)) {
      const pref = pattern.preference;
      
      // Handle array values (like interests and dietary restrictions)
      if (Array.isArray(pattern.value)) {
        if (!detected[pref]) {
          detected[pref] = [];
        }
        if (Array.isArray(detected[pref])) {
          detected[pref] = [...new Set([...detected[pref], ...pattern.value])];
        }
      } else {
        // For non-array values, use the highest confidence match
        if (!detected.confidence[pref] || detected.confidence[pref] < pattern.confidence) {
          detected[pref] = pattern.value;
        }
      }
      
      // Update confidence
      detected.confidence[pref] = Math.max(
        detected.confidence[pref] || 0,
        pattern.confidence
      );
    }
  }
  
  return detected;
}

/**
 * Extract preferences from conversation history
 */
export function extractPreferencesFromConversation(messages: Array<{ role: string; content: string }>): DetectedPreferences {
  const allDetected: DetectedPreferences = { confidence: {} };
  
  // Process each message
  for (const message of messages) {
    if (message.role === 'user') {
      const messagePrefs = extractPreferencesFromMessage(message.content);
      
      // Merge preferences, keeping highest confidence values
      for (const [key, value] of Object.entries(messagePrefs)) {
        if (key === 'confidence') continue;
        
        if (Array.isArray(value) && Array.isArray(allDetected[key])) {
          // Merge arrays
          allDetected[key] = [...new Set([...allDetected[key], ...value])];
        } else if (!allDetected[key] || 
                   (messagePrefs.confidence[key] > (allDetected.confidence[key] || 0))) {
          // Use value with higher confidence
          allDetected[key] = value;
        }
      }
      
      // Update confidence scores
      for (const [key, conf] of Object.entries(messagePrefs.confidence)) {
        allDetected.confidence[key] = Math.max(
          allDetected.confidence[key] || 0,
          conf
        );
      }
    }
  }
  
  return allDetected;
}

/**
 * Determine what information is still needed
 */
export function getMissingInformation(detected: DetectedPreferences): string[] {
  const missing: string[] = [];
  
  // Essential information
  if (!detected.destination) missing.push('destination');
  if (!detected.duration && !detected.startDate && !detected.roughDates) missing.push('dates');
  if (!detected.duration) missing.push('duration');
  
  // Important but not essential
  if (!detected.budget) missing.push('budget');
  if (!detected.groupType && !detected.groupSize) missing.push('group');
  if (!detected.interests || detected.interests.length === 0) missing.push('interests');
  if (!detected.pace) missing.push('pace');
  
  return missing;
}

/**
 * Generate contextual questions based on what's missing
 */
export function generateContextualQuestions(
  detected: DetectedPreferences,
  missing: string[]
): Array<{ question: string; key: string; priority: number }> {
  const questions: Array<{ question: string; key: string; priority: number }> = [];
  
  // High priority questions
  if (missing.includes('destination')) {
    questions.push({
      question: 'Where would you like to go?',
      key: 'destination',
      priority: 1
    });
  }
  
  if (missing.includes('dates')) {
    if (detected.destination) {
      questions.push({
        question: `When are you planning to visit ${detected.destination}?`,
        key: 'dates',
        priority: 1
      });
    } else {
      questions.push({
        question: 'When are you planning to travel?',
        key: 'dates',
        priority: 1
      });
    }
  }
  
  if (missing.includes('duration') && !detected.duration) {
    questions.push({
      question: 'How many days will you be traveling?',
      key: 'duration',
      priority: 1
    });
  }
  
  // Medium priority questions
  if (missing.includes('group')) {
    questions.push({
      question: 'Will you be traveling solo or with others?',
      key: 'group',
      priority: 2
    });
  }
  
  if (missing.includes('budget')) {
    questions.push({
      question: 'What\'s your travel style - budget, mid-range, or luxury?',
      key: 'budget',
      priority: 2
    });
  }
  
  // Low priority questions (can be inferred or have defaults)
  if (missing.includes('interests') && detected.destination) {
    questions.push({
      question: `What are you most interested in experiencing in ${detected.destination}?`,
      key: 'interests',
      priority: 3
    });
  }
  
  if (missing.includes('pace')) {
    questions.push({
      question: 'Do you prefer a relaxed pace or would you like to see as much as possible?',
      key: 'pace',
      priority: 3
    });
  }
  
  // Context-specific questions
  if (detected.hasChildren) {
    questions.push({
      question: 'What are the ages of the children traveling with you?',
      key: 'childrenAges',
      priority: 2
    });
  }
  
  if (detected.dietaryRestrictions?.includes('allergies')) {
    questions.push({
      question: 'Could you specify your food allergies?',
      key: 'allergies',
      priority: 2
    });
  }
  
  return questions.sort((a, b) => a.priority - b.priority);
}
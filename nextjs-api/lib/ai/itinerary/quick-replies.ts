/**
 * Quick Reply Generator for Itinerary Clarification
 * Generates contextual quick reply options based on what information is needed
 */

export interface QuickReply {
  label: string;
  value: string;
  icon?: string;
}

export interface QuickReplySet {
  question: string;
  options: QuickReply[];
}

/**
 * Generate quick replies for date selection
 */
export function getDateQuickReplies(): QuickReply[] {
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleString('default', { month: 'long' });
  
  return [
    { label: 'This week', value: 'this week', icon: '📅' },
    { label: 'Next week', value: 'next week', icon: '📅' },
    { label: currentMonth, value: currentMonth.toLowerCase(), icon: '🗓️' },
    { label: nextMonth, value: nextMonth.toLowerCase(), icon: '🗓️' },
    { label: 'In 2-3 months', value: 'in 2-3 months', icon: '📆' },
    { label: 'Summer 2025', value: 'summer 2025', icon: '☀️' },
  ];
}

/**
 * Generate quick replies for duration selection
 */
export function getDurationQuickReplies(): QuickReply[] {
  return [
    { label: 'Weekend (2-3 days)', value: '3 days', icon: '🎒' },
    { label: '5 days', value: '5 days', icon: '🧳' },
    { label: '1 week', value: '7 days', icon: '🧳' },
    { label: '10 days', value: '10 days', icon: '🧳' },
    { label: '2 weeks', value: '14 days', icon: '✈️' },
  ];
}

/**
 * Generate quick replies for group type
 */
export function getGroupQuickReplies(): QuickReply[] {
  return [
    { label: 'Solo', value: 'traveling solo', icon: '🚶' },
    { label: 'With partner', value: 'with my partner', icon: '💑' },
    { label: 'With family', value: 'with family', icon: '👨‍👩‍👧‍👦' },
    { label: 'With friends', value: 'with friends', icon: '👥' },
    { label: 'Business trip', value: 'business travel', icon: '💼' },
  ];
}

/**
 * Generate quick replies for travel style/budget
 */
export function getBudgetQuickReplies(): QuickReply[] {
  return [
    { label: 'Budget-friendly', value: 'budget travel', icon: '💵' },
    { label: 'Mid-range comfort', value: 'mid-range', icon: '🏨' },
    { label: 'Luxury experience', value: 'luxury', icon: '✨' },
    { label: 'Mix of both', value: 'flexible budget', icon: '⚖️' },
  ];
}

/**
 * Generate quick replies for interests based on destination
 */
export function getInterestQuickReplies(destination?: string): QuickReply[] {
  // Base interests applicable to most destinations
  const baseInterests: QuickReply[] = [
    { label: 'Local food & dining', value: 'food and restaurants', icon: '🍽️' },
    { label: 'History & culture', value: 'history and culture', icon: '🏛️' },
    { label: 'Art & museums', value: 'art and museums', icon: '🎨' },
    { label: 'Nature & outdoors', value: 'nature and outdoor activities', icon: '🌲' },
    { label: 'Shopping', value: 'shopping', icon: '🛍️' },
    { label: 'Nightlife', value: 'nightlife and bars', icon: '🌃' },
  ];
  
  // Add destination-specific interests
  if (destination?.toLowerCase().includes('copenhagen')) {
    baseInterests.push(
      { label: 'Danish design', value: 'Danish design and architecture', icon: '🏗️' },
      { label: 'Hygge experiences', value: 'hygge and cozy cafes', icon: '☕' },
      { label: 'Cycling tours', value: 'cycling around the city', icon: '🚴' }
    );
  }
  
  if (destination?.toLowerCase().includes('paris')) {
    baseInterests.push(
      { label: 'Wine & cheese', value: 'wine tasting and cheese', icon: '🍷' },
      { label: 'Fashion', value: 'fashion and haute couture', icon: '👗' },
      { label: 'Romantic spots', value: 'romantic experiences', icon: '💕' }
    );
  }
  
  return baseInterests.slice(0, 6); // Limit to 6 options
}

/**
 * Generate quick replies for pace preference
 */
export function getPaceQuickReplies(): QuickReply[] {
  return [
    { label: 'Relaxed', value: 'relaxed pace', icon: '🐢' },
    { label: 'Moderate', value: 'moderate pace', icon: '🚶' },
    { label: 'See everything', value: 'packed schedule', icon: '🏃' },
  ];
}

/**
 * Generate contextual quick replies based on what information is missing
 */
export function generateQuickReplies(missingInfo: string, context?: any): QuickReply[] {
  switch (missingInfo) {
    case 'dates':
      return getDateQuickReplies();
    case 'duration':
      return getDurationQuickReplies();
    case 'group':
      return getGroupQuickReplies();
    case 'budget':
      return getBudgetQuickReplies();
    case 'interests':
      return getInterestQuickReplies(context?.destination);
    case 'pace':
      return getPaceQuickReplies();
    default:
      return [];
  }
}

/**
 * Format quick replies as suggestion items for the AI
 */
export function formatQuickRepliesForAI(replies: QuickReply[]): string {
  return replies.map(r => `"${r.label}"`).join(', ');
}
// Suggestion types for the editor
import type { Suggestion } from '@/lib/db/schema';

// UISuggestion extends the database Suggestion type with UI-specific properties
export type UISuggestion = Suggestion & {
  selectionStart?: number;
  selectionEnd?: number;
};
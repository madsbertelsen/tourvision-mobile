/**
 * Voice input type definitions
 */

export type SupportedLanguage = 'en-US' | 'da-DK' | 'de-DE' | 'fr-FR' | 'es-ES';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  flag: string; // Emoji flag
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'da-DK', label: 'Dansk', flag: '🇩🇰' },
  { code: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr-FR', label: 'Français', flag: '🇫🇷' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸' },
];

export interface VoiceTranscript {
  interim: string;
  final: string;
  timestamp: number;
}

/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage =
  | 'en' | 'fr' | 'es' | 'zh-CN' | 'zh-TW' | 'hi'
  | 'pt-BR' | 'pt-PT' | 'ru' | 'ja' | 'de' | 'ko' | 'tr'
  | 'it' | 'vi' | 'th' | 'nl' | 'pl' | 'no' | 'id' | 'uk';

export interface LocaleMetadata {
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
  dateFormat: string;
}

export const AVAILABLE_LANGUAGES: LocaleMetadata[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', dateFormat: 'MM/DD/YYYY' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', dateFormat: 'DD/MM/YYYY' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', dateFormat: 'DD/MM/YYYY' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', dateFormat: 'DD.MM.YYYY' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', dateFormat: 'YYYY/MM/DD' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文', dateFormat: 'YYYY/MM/DD' },
  { code: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文', dateFormat: 'YYYY/MM/DD' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dateFormat: 'DD/MM/YYYY' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', nativeLabel: 'Português (Brasil)', dateFormat: 'DD/MM/YYYY' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)', nativeLabel: 'Português (Portugal)', dateFormat: 'DD/MM/YYYY' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', dateFormat: 'DD.MM.YYYY' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어', dateFormat: 'YYYY.MM.DD' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', dateFormat: 'DD/MM/YYYY' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', dateFormat: 'DD/MM/YYYY' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt', dateFormat: 'DD/MM/YYYY' },
  { code: 'th', label: 'Thai', nativeLabel: 'ไทย', dateFormat: 'DD/MM/YYYY' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', dateFormat: 'DD-MM-YYYY' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', dateFormat: 'DD.MM.YYYY' },
  { code: 'no', label: 'Norwegian', nativeLabel: 'Norsk', dateFormat: 'DD.MM.YYYY' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia', dateFormat: 'DD/MM/YYYY' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', dateFormat: 'DD.MM.YYYY' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

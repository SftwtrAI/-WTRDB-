export interface LanguageOption {
  value: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "ru", label: "Russian" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "no", label: "Norwegian" },
  { value: "da", label: "Danish" },
  { value: "fi", label: "Finnish" },
  { value: "el", label: "Greek" },
  { value: "cs", label: "Czech" },
  { value: "sk", label: "Slovak" },
  { value: "hu", label: "Hungarian" },
  { value: "ro", label: "Romanian" },
  { value: "bg", label: "Bulgarian" },
  { value: "hr", label: "Croatian" },
  { value: "uk", label: "Ukrainian" },
  { value: "tr", label: "Turkish" },
  { value: "id", label: "Indonesian" },
  { value: "ms", label: "Malay" },
  { value: "vi", label: "Vietnamese" },
  { value: "fil", label: "Filipino" },
  { value: "ta", label: "Tamil" },
  { value: "th", label: "Thai" },
  { value: "he", label: "Hebrew" },
  { value: "bn", label: "Bengali" },
  { value: "te", label: "Telugu" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "pa", label: "Punjabi" },
  { value: "ur", label: "Urdu" },
  { value: "fa", label: "Persian" },
  { value: "sw", label: "Swahili" },
  { value: "af", label: "Afrikaans" },
  { value: "ca", label: "Catalan" },
  { value: "lt", label: "Lithuanian" },
  { value: "lv", label: "Latvian" },
  { value: "sl", label: "Slovenian" },
  { value: "et", label: "Estonian" },
];

export function getLanguageLabel(value: string): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.value === value);
  return lang?.label || value;
}

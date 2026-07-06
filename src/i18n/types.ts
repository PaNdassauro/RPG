export type Locale = "en" | "pt-BR";

export const SUPPORTED_LOCALES: Locale[] = ["en", "pt-BR"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "pt-BR": "Português (BR)",
};

/** Tag used when telling the LLM what language to reply in. */
export const LOCALE_DM_TAG: Record<Locale, string> = {
  en: "English",
  "pt-BR": "Brazilian Portuguese (português brasileiro)",
};

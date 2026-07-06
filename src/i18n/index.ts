/**
 * Tiny i18n module: a Zustand-backed locale store + a `t()` function that
 * resolves dotted keys against the active locale's dictionary.
 *
 * - String keys are resolved at runtime; we trade compile-time safety for
 *   ergonomic call sites. Bad keys fall back to the key string itself so
 *   missing translations are visible without crashing.
 * - Persists to Dexie (key: "locale" in the settings table).
 */
import { create } from "zustand";
import { db } from "@/db/schema";
import en from "./locales/en";
import ptBR from "./locales/ptBR";
import { LOCALE_DM_TAG, type Locale } from "./types";

type Dict = Record<string, unknown>;

const DICTIONARIES: Record<Locale, Dict> = {
  en: en as Dict,
  "pt-BR": ptBR as Dict,
};

interface LocaleState {
  locale: Locale;
  loaded: boolean;
  setLocale: (locale: Locale) => Promise<void>;
  load: () => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: detectInitialLocale(),
  loaded: false,

  async load() {
    const row = await db.settings.get("locale");
    const stored = row?.value;
    if (stored === "en" || stored === "pt-BR") {
      set({ locale: stored, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  async setLocale(locale) {
    set({ locale });
    await db.settings.put({ key: "locale", value: locale, updatedAt: Date.now() });
  },
}));

function detectInitialLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

export async function ensureLocaleLoaded(): Promise<void> {
  const { loaded, load } = useLocaleStore.getState();
  if (!loaded) await load();
}

function resolve(dict: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, dict);
}

function applyParams(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

/**
 * String-only translation. Call from non-React code (DM stub, prompt
 * assembly, etc.) where a hook isn't available. Reads the active locale at
 * call time.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = useLocaleStore.getState().locale;
  const value = resolve(DICTIONARIES[locale] ?? DICTIONARIES.en, key);
  if (typeof value === "string") return applyParams(value, params);
  // Fall back to English when a key is missing in the active locale.
  if (locale !== "en") {
    const fallback = resolve(DICTIONARIES.en, key);
    if (typeof fallback === "string") return applyParams(fallback, params);
  }
  return key;
}

/**
 * Resolve a key whose value is a list (themes, narration variants, etc).
 * Returns the active locale's array, falling back to English.
 */
export function tList(key: string): string[] {
  const locale = useLocaleStore.getState().locale;
  const value = resolve(DICTIONARIES[locale] ?? DICTIONARIES.en, key);
  if (Array.isArray(value)) return value as string[];
  if (locale !== "en") {
    const fallback = resolve(DICTIONARIES.en, key);
    if (Array.isArray(fallback)) return fallback as string[];
  }
  return [];
}

/**
 * React hook variant — returns a `t` bound to the current locale and
 * triggers re-render when the locale changes.
 */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: string, params?: Record<string, string | number>): string => {
    const value = resolve(DICTIONARIES[locale] ?? DICTIONARIES.en, key);
    if (typeof value === "string") return applyParams(value, params);
    if (locale !== "en") {
      const fallback = resolve(DICTIONARIES.en, key);
      if (typeof fallback === "string") return applyParams(fallback, params);
    }
    return key;
  };
}

export function useTList() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: string): string[] => {
    const value = resolve(DICTIONARIES[locale] ?? DICTIONARIES.en, key);
    if (Array.isArray(value)) return value as string[];
    if (locale !== "en") {
      const fallback = resolve(DICTIONARIES.en, key);
      if (Array.isArray(fallback)) return fallback as string[];
    }
    return [];
  };
}

/** Tag used in DM prompts ("English" / "Brazilian Portuguese"). */
export function dmLanguageTag(): string {
  return LOCALE_DM_TAG[useLocaleStore.getState().locale];
}

export type { Locale };
export { LOCALE_LABELS, SUPPORTED_LOCALES } from "./types";

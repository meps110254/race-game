import {
  Country,
  LangType,
  COUNTRIES_LIST,
  TRANSLATIONS,
  LANGUAGE_LABELS,
  LANGUAGE_FULL_LABELS,
  LANGUAGE_FLAGS
} from "./translationData";

export type { Country, LangType };
export { COUNTRIES_LIST, TRANSLATIONS, LANGUAGE_LABELS, LANGUAGE_FULL_LABELS, LANGUAGE_FLAGS };

let currentLanguage: LangType = 'en';

export function setI18nLanguage(lang: LangType) {
  currentLanguage = lang;
}

export function getI18nLanguage(): LangType {
  return currentLanguage;
}

export function t(key: string): string {
  return TRANSLATIONS[currentLanguage]?.[key] || TRANSLATIONS['en']?.[key] || key;
}

export function getTrackName(id: string, defaultName: string): string {
  if (id === "neon-grid") return t("trackNeonName");
  if (id === "desert-rally") return t("trackDesertName");
  if (id === "space-highway") return t("trackSpaceName");
  return defaultName;
}

export function getTrackDesc(id: string, defaultDesc: string): string {
  if (id === "neon-grid") return t("trackNeonDesc");
  if (id === "desert-rally") return t("trackDesertDesc");
  if (id === "space-highway") return t("trackSpaceDesc");
  return defaultDesc;
}

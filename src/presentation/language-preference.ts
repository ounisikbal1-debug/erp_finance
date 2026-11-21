import type { InterfaceLanguage } from './localization';

export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'safe-erp.interface-language';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isInterfaceLanguage(value: string | null): value is InterfaceLanguage {
  return value === 'FR' || value === 'EN' || value === 'AR';
}

function getBrowserStorage(): PreferenceStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readInitialInterfaceLanguage(storage = getBrowserStorage()): InterfaceLanguage {
  try {
    const value = storage?.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY) ?? null;
    return isInterfaceLanguage(value) ? value : 'FR';
  } catch {
    return 'FR';
  }
}

export function saveInterfaceLanguagePreference(
  language: InterfaceLanguage,
  storage = getBrowserStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, language);
    return true;
  } catch {
    return false;
  }
}

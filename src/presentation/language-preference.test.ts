import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  readInitialInterfaceLanguage,
  saveInterfaceLanguagePreference,
} from './language-preference';
import {
  applyInterfaceLanguageToDocument,
  getHtmlLanguage,
  isRightToLeft,
  translateInterfaceText,
} from './localization';

describe('initial language selection', () => {
  it('defaults to French and restores a saved French, English, or Arabic choice', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    assert.equal(readInitialInterfaceLanguage(storage), 'FR');
    const root = { lang: '', dir: '' };
    const document = { documentElement: root };
    for (const language of ['FR', 'EN', 'AR'] as const) {
      assert.equal(saveInterfaceLanguagePreference(language, storage), true);
      assert.equal(values.get(LANGUAGE_PREFERENCE_STORAGE_KEY), language);
      const restored = readInitialInterfaceLanguage(storage);
      assert.equal(restored, language);
      assert.equal(getHtmlLanguage(restored), language === 'AR' ? 'ar-TN' : language === 'EN' ? 'en' : 'fr-TN');
      assert.equal(isRightToLeft(restored), language === 'AR');
      applyInterfaceLanguageToDocument(document, restored);
      assert.equal(root.lang, getHtmlLanguage(language));
      assert.equal(root.dir, language === 'AR' ? 'rtl' : 'ltr');
      assert.equal(
        translateInterfaceText(restored, 'language'),
        language === 'FR' ? 'Langue' : language === 'EN' ? 'Language' : 'اللغة',
      );
    }
  });

  it('uses a safe fallback when persisted data is invalid or storage is unavailable', () => {
    assert.equal(readInitialInterfaceLanguage({
      getItem: () => 'DE',
      setItem: () => undefined,
    }), 'FR');
    assert.equal(readInitialInterfaceLanguage({
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => undefined,
    }), 'FR');
    assert.equal(saveInterfaceLanguagePreference('AR', undefined), false);
  });
});

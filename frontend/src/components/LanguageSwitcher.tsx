'use client';

import { useLanguage } from '@/i18n/LanguageProvider';

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <button
      onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
      className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
    >
      {t('language.switch')}
    </button>
  );
}

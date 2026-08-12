'use client';

import { useLanguage } from '@/i18n/LanguageProvider';

export default function AccountStatusBanner() {
  const { t } = useLanguage();

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
      {t('account.deactivated')}
    </div>
  );
}

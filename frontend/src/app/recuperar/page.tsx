'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';

export default function RecuperarPage() {
  const { t } = useLanguage();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { error: authError } = await sendPasswordReset(email);
    setSubmitting(false);
    if (authError) setError(authError);
    else setInfo(t('auth.resetEmailSent'));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-xl font-semibold text-slate-900">{t('auth.resetPasswordTitle')}</h2>

      <div className="space-y-1">
        <label className="text-sm text-slate-500">{t('auth.email')}</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-emerald-600">{info}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {t('auth.sendResetLink')}
      </button>

      <Link href="/" className="block text-center text-sm text-slate-500 hover:text-slate-700">
        {t('auth.backToLogin')}
      </Link>
    </form>
  );
}

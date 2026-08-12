'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';

export default function LoginForm() {
  const { t } = useLanguage();
  const { signInWithPassword, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (mode === 'signup' && !aceptaPrivacidad) {
      setError(t('auth.privacyRequired'));
      return;
    }

    setSubmitting(true);

    const action = mode === 'signin' ? signInWithPassword : signUp;
    const { error: authError } = await action(email, password);

    if (authError) {
      setError(authError);
    } else if (mode === 'signup') {
      setInfo(t('auth.checkEmail'));
    }
    setSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-xl font-semibold text-slate-900">{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</h2>

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

      <div className="space-y-1">
        <label className="text-sm text-slate-500">{t('auth.password')}</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
        />
      </div>

      {mode === 'signin' && (
        <div className="text-right">
          <Link href="/recuperar" className="text-sm text-emerald-600 hover:text-emerald-700">
            {t('auth.forgotPassword')}
          </Link>
        </div>
      )}

      {mode === 'signup' && (
        <div className="space-y-1">
          <label className="text-sm text-slate-500">{t('auth.confirmPassword')}</label>
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
          />
        </div>
      )}

      {mode === 'signup' && (
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={aceptaPrivacidad}
            onChange={(e) => setAceptaPrivacidad(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
          />
          <span>
            {t('auth.privacyAcceptPrefix')}{' '}
            <Link href="/privacidad" target="_blank" className="font-medium text-emerald-600 hover:text-emerald-700">
              {t('auth.privacyLink')}
            </Link>
          </span>
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-emerald-600">{info}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="w-full text-sm text-slate-500 hover:text-slate-700"
      >
        {mode === 'signin' ? t('auth.needAccount') : t('auth.haveAccount')}
      </button>
    </form>
  );
}

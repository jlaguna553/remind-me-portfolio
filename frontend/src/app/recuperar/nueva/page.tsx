'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { supabase } from '@/lib/supabaseClient';

export default function NuevaContrasenaPage() {
  const { t } = useLanguage();
  const { updatePassword } = useAuth();
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // El enlace del correo de recuperación hace que el cliente de Supabase
  // establezca una sesión temporal al cargar la página (vía el fragmento de
  // la URL) — se comprueba que exista antes de mostrar el formulario, en
  // vez de asumir que cualquiera que llegue aquí trae un enlace válido.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setValidLink(!!data.session);
      setCheckingSession(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    const { error: authError } = await updatePassword(password);
    setSubmitting(false);

    if (authError) {
      setError(authError);
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/'), 2000);
  }

  if (checkingSession) return null;

  if (!validLink) {
    return (
      <div className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">{t('auth.resetLinkInvalid')}</p>
        <Link href="/recuperar" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
          {t('auth.forgotPassword')}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-emerald-600">{t('auth.passwordUpdated')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-xl font-semibold text-slate-900">{t('auth.newPassword')}</h2>

      <div className="space-y-1">
        <label className="text-sm text-slate-500">{t('auth.newPassword')}</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-slate-500">{t('auth.confirmNewPassword')}</label>
        <input
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {t('common.saveChanges')}
      </button>
    </form>
  );
}

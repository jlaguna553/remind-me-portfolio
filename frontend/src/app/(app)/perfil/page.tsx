'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import { useLanguage } from '@/i18n/LanguageProvider';
import { supabase } from '@/lib/supabaseClient';
import { getBrowserTimeZone } from '@/lib/timezone';
import WhatsAppStatus from '@/components/WhatsAppStatus';
import PausarPicker from '@/components/agenda/PausarPicker';

// Intl.supportedValuesOf no existe en todos los entornos (Node/navegadores
// viejos) — si falta, se cae a un puñado de zonas comunes en vez de dejar el
// selector vacío.
const FALLBACK_TIMEZONES = [
  'America/Mexico_City',
  'America/Tijuana',
  'America/Cancun',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/Madrid',
  'UTC',
];

function listTimeZones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch {
    // sigue al fallback de abajo
  }
  return FALLBACK_TIMEZONES;
}

export default function PerfilPage() {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();
  const { recordatorios, pauseAllRecordatorios, resumeAllRecordatorios } = useRecordatorios();
  const [error, setError] = useState<string | null>(null);
  const [savingZona, setSavingZona] = useState(false);
  const [showPausarPicker, setShowPausarPicker] = useState(false);
  const timeZones = useMemo(listTimeZones, []);

  if (!user) return null;

  const pendientes = recordatorios.filter((r) => r.estado === 'pendiente').length;
  const pausados = recordatorios.filter((r) => r.estado === 'pausado').length;

  async function handleZonaChange(zona: string) {
    setSavingZona(true);
    const { error: err } = await supabase.rpc('update_own_timezone', { new_timezone: zona });
    if (!err) await refreshProfile();
    setSavingZona(false);
  }

  async function handlePauseAll(pausadoHasta: string | null) {
    setError(null);
    setShowPausarPicker(false);
    const { error: err } = await pauseAllRecordatorios(pausadoHasta);
    if (err) setError(err);
  }

  async function handleResumeAll() {
    setError(null);
    const { error: err } = await resumeAllRecordatorios();
    if (err) setError(err);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">{t('nav.perfil')}</h2>
        <p className="text-sm text-slate-700">{user.email}</p>
        {user.created_at && (
          <p className="mt-1 text-xs text-slate-400">
            {t('dashboard.memberSince')}{' '}
            {new Date(user.created_at).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              profile?.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {profile?.activo ? t('admin.active') : t('admin.inactive')}
          </span>
          {profile?.is_admin && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">admin</span>
          )}
        </div>
      </section>

      <WhatsAppStatus />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">{t('perfil.zonaHoraria')}</h2>
        <p className="text-sm text-slate-500">{t('perfil.zonaHorariaHint')}</p>
        <select
          value={profile?.zona_horaria ?? getBrowserTimeZone()}
          disabled={savingZona}
          onChange={(e) => handleZonaChange(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50"
        >
          {timeZones.map((zona) => (
            <option key={zona} value={zona}>
              {zona}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">{t('recordatorios.title')}</h2>
        <p className="text-sm text-slate-500">{t('perfil.pauseAllHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setShowPausarPicker((prev) => !prev)}
            disabled={pendientes === 0}
            className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
          >
            {t('perfil.pauseAll')} ({pendientes})
          </button>
          <button
            onClick={handleResumeAll}
            disabled={pausados === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {t('perfil.resumeAll')} ({pausados})
          </button>
        </div>
        {showPausarPicker && <PausarPicker onConfirm={handlePauseAll} onCancel={() => setShowPausarPicker(false)} />}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <Link href="/privacidad" target="_blank" className="block text-center text-sm text-slate-500 hover:text-slate-700">
        {t('auth.privacyLink')}
      </Link>
    </div>
  );
}

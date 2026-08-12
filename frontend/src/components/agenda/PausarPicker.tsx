'use client';

import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useProfile } from '@/hooks/useProfile';
import { getBrowserTimeZone, zonedTimeToUtcIso } from '@/lib/timezone';
import { toDateStr } from '@/components/Calendar';

type Duracion = '1d' | '3d' | '7d' | '30d' | 'fecha' | 'indefinido';

const DIAS_POR_DURACION: Record<'1d' | '3d' | '7d' | '30d', number> = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
  '30d': 30,
};

interface Props {
  onConfirm: (pausadoHasta: string | null) => void;
  onCancel: () => void;
}

/**
 * Selector de duración de pausa, compartido entre "Pausar" en una tarjeta
 * individual (ReminderCard) y "Pausar todos" (Mi perfil). `null` = pausa
 * indefinida (el comportamiento de siempre, solo se reanuda a mano);
 * cualquier otra opción calcula un `pausado_hasta` que el backend usa para
 * reanudar solo (resumeExpiredPauses() en reminders.js).
 */
export default function PausarPicker({ onConfirm, onCancel }: Props) {
  const { t } = useLanguage();
  const { profile } = useProfile();
  const zonaHoraria = profile?.zona_horaria || getBrowserTimeZone();
  const [duracion, setDuracion] = useState<Duracion>('1d');
  const [fechaEspecifica, setFechaEspecifica] = useState(() => toDateStr(new Date()));

  function handleConfirm() {
    if (duracion === 'indefinido') {
      onConfirm(null);
      return;
    }
    if (duracion === 'fecha') {
      onConfirm(zonedTimeToUtcIso(fechaEspecifica, '23:59', zonaHoraria));
      return;
    }
    const dias = DIAS_POR_DURACION[duracion];
    onConfirm(new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString());
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
      <select
        value={duracion}
        onChange={(e) => setDuracion(e.target.value as Duracion)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
      >
        <option value="1d">{t('recordatorios.pausarDuracion.1d')}</option>
        <option value="3d">{t('recordatorios.pausarDuracion.3d')}</option>
        <option value="7d">{t('recordatorios.pausarDuracion.7d')}</option>
        <option value="30d">{t('recordatorios.pausarDuracion.30d')}</option>
        <option value="fecha">{t('recordatorios.pausarDuracion.fecha')}</option>
        <option value="indefinido">{t('recordatorios.pausarDuracion.indefinido')}</option>
      </select>
      {duracion === 'fecha' && (
        <input
          type="date"
          value={fechaEspecifica}
          onChange={(e) => setFechaEspecifica(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
        />
      )}
      <div className="flex gap-3">
        <button type="button" onClick={handleConfirm} className="font-medium text-emerald-700 hover:text-emerald-800">
          {t('recordatorios.pausarConfirmar')}
        </button>
        <button type="button" onClick={onCancel} className="font-medium text-slate-500 hover:text-slate-700">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

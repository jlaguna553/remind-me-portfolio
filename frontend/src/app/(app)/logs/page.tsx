'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import ReminderCard from '@/components/agenda/ReminderCard';

type Filtro = 'todos' | 'enviado' | 'fallido';

function LogsPageContent() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const { recordatorios, loading } = useRecordatorios();
  const searchParams = useSearchParams();
  const estadoParam = searchParams.get('estado');
  const [filtro, setFiltro] = useState<Filtro>(estadoParam === 'enviado' || estadoParam === 'fallido' ? estadoParam : 'todos');

  const logs = useMemo(
    () =>
      recordatorios
        .filter((r) => r.estado === 'enviado' || r.estado === 'fallido')
        .filter((r) => filtro === 'todos' || r.estado === filtro)
        .sort((a, b) => {
          const ta = new Date(a.ultimo_envio ?? a.fecha_envio).getTime();
          const tb = new Date(b.ultimo_envio ?? b.fecha_envio).getTime();
          return tb - ta;
        }),
    [recordatorios, filtro]
  );

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{t('nav.logs')}</h2>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
        {(['todos', 'enviado', 'fallido'] as Filtro[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`flex-1 rounded-md px-2 py-1 ${
              filtro === f ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-white'
            }`}
          >
            {t(`logs.filter.${f}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-400">{t('logs.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              locale={locale}
              t={t}
              showDate
              onDuplicate={(rec) => router.push(`/calendario/nuevo?duplicar=${rec.id}`)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={null}>
      <LogsPageContent />
    </Suspense>
  );
}

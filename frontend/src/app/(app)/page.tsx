'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useClientes } from '@/hooks/useClientes';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import { toDateStr } from '@/components/Calendar';
import PieChart from '@/components/PieChart';

const ESTADO_COLORS = {
  pendiente: '#f59e0b',
  en_proceso: '#0ea5e9',
  enviado: '#10b981',
  fallido: '#ef4444',
  pausado: '#94a3b8',
};

export default function DashboardPage() {
  const { t } = useLanguage();
  const { clientes } = useClientes();
  const { recordatorios } = useRecordatorios();

  const stats = useMemo(() => {
    const todayStr = toDateStr(new Date());
    const activos = recordatorios.filter((r) => r.estado === 'pendiente' || r.estado === 'en_proceso');
    const hoy = activos.filter((r) => toDateStr(new Date(r.fecha_envio)) === todayStr);
    const enviados = recordatorios.filter((r) => r.estado === 'enviado');
    const fallidos = recordatorios.filter((r) => r.estado === 'fallido');

    return {
      contactos: clientes.filter((c) => !c.es_grupo).length,
      grupos: clientes.filter((c) => c.es_grupo).length,
      programados: activos.length,
      hoy: hoy.length,
      enviados: enviados.length,
      fallidos: fallidos.length,
    };
  }, [clientes, recordatorios]);

  const porEstado = useMemo(
    () => [
      { label: t('recordatorios.estado.pendiente'), value: recordatorios.filter((r) => r.estado === 'pendiente').length, color: ESTADO_COLORS.pendiente },
      { label: t('recordatorios.estado.en_proceso'), value: recordatorios.filter((r) => r.estado === 'en_proceso').length, color: ESTADO_COLORS.en_proceso },
      { label: t('recordatorios.estado.enviado'), value: recordatorios.filter((r) => r.estado === 'enviado').length, color: ESTADO_COLORS.enviado },
      { label: t('recordatorios.estado.fallido'), value: recordatorios.filter((r) => r.estado === 'fallido').length, color: ESTADO_COLORS.fallido },
      { label: t('recordatorios.estado.pausado'), value: recordatorios.filter((r) => r.estado === 'pausado').length, color: ESTADO_COLORS.pausado },
    ],
    [recordatorios, t]
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('dashboard.porEstado')}</h2>
        <PieChart data={porEstado} emptyLabel={t('dashboard.sinRecordatorios')} />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <StatCard label={t('dashboard.contactos')} value={stats.contactos} href="/contactos?tab=contactos" />
        <StatCard label={t('dashboard.grupos')} value={stats.grupos} href="/contactos?tab=grupos" />
        <StatCard label={t('dashboard.programados')} value={stats.programados} href="/mensajes" />
        <StatCard label={t('dashboard.hoy')} value={stats.hoy} href="/calendario" />
        <StatCard label={t('dashboard.enviados')} value={stats.enviados} href="/logs?estado=enviado" />
        <StatCard
          label={t('dashboard.fallidos')}
          value={stats.fallidos}
          href="/logs?estado=fallido"
          accent={stats.fallidos > 0}
        />
      </section>

      <Link
        href="/calendario/nuevo"
        className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-500"
      >
        <span className="text-xl leading-none">+</span>
        {t('dashboard.newRecordatorio')}
      </Link>
    </div>
  );
}

function StatCard({ label, value, href, accent }: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
    >
      <p className={`text-2xl font-bold ${accent ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </Link>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useClientes } from '@/hooks/useClientes';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import ReminderCard from '@/components/agenda/ReminderCard';

type TipoFiltro = 'todos' | 'contacto' | 'grupo';

const SIN_CATEGORIA = '__sin_categoria__';

export default function MensajesPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const { clientes } = useClientes();
  const { recordatorios, loading, cancelRecordatorio, pauseRecordatorio, resumeRecordatorio, sendRecordatorioAhora } =
    useRecordatorios();
  const [clienteId, setClienteId] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');

  const clienteById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  const categoriasExistentes = useMemo(
    () => [...new Set(clientes.map((c) => c.categoria).filter((c): c is string => !!c))].sort(),
    [clientes]
  );

  const clientesFiltrados = useMemo(() => {
    if (tipoFiltro === 'todos') return clientes;
    return clientes.filter((c) => (tipoFiltro === 'grupo' ? c.es_grupo : !c.es_grupo));
  }, [clientes, tipoFiltro]);

  function changeTipoFiltro(next: TipoFiltro) {
    setTipoFiltro(next);
    setClienteId('');
  }

  const mensajes = useMemo(
    () =>
      recordatorios
        .filter((r) => r.estado === 'pendiente' || r.estado === 'en_proceso' || r.estado === 'pausado')
        .filter((r) => !clienteId || r.cliente_id === clienteId)
        .filter((r) => {
          if (tipoFiltro === 'todos') return true;
          const cliente = clienteById.get(r.cliente_id);
          return tipoFiltro === 'grupo' ? !!cliente?.es_grupo : !cliente?.es_grupo;
        })
        .filter((r) => {
          if (!categoriaFiltro) return true;
          const cliente = clienteById.get(r.cliente_id);
          if (categoriaFiltro === SIN_CATEGORIA) return !cliente?.categoria;
          return cliente?.categoria === categoriaFiltro;
        })
        .sort((a, b) => new Date(a.fecha_envio).getTime() - new Date(b.fecha_envio).getTime()),
    [recordatorios, clienteId, tipoFiltro, categoriaFiltro, clienteById]
  );

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t('nav.mensajes')}</h2>
        <button
          type="button"
          onClick={() => router.push('/calendario/nuevo')}
          aria-label={t('recordatorios.schedule')}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-lg leading-none text-white hover:bg-emerald-500"
        >
          +
        </button>
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
        {(['todos', 'contacto', 'grupo'] as TipoFiltro[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => changeTipoFiltro(opt)}
            className={`flex-1 rounded-md px-2 py-1 ${
              tipoFiltro === opt ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-white'
            }`}
          >
            {t(`mensajes.tipo.${opt}`)}
          </button>
        ))}
      </div>

      <select
        value={clienteId}
        onChange={(e) => setClienteId(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      >
        <option value="">{t('mensajes.allClients')}</option>
        {clientesFiltrados.map((cliente) => (
          <option key={cliente.id} value={cliente.id}>
            {cliente.es_grupo ? `👥 ${cliente.nombre}` : `${cliente.nombre} (${cliente.telefono})`}
          </option>
        ))}
      </select>

      {categoriasExistentes.length > 0 && (
        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          <option value="">{t('clientes.categoriaAll')}</option>
          <option value={SIN_CATEGORIA}>{t('clientes.categoriaNone')}</option>
          {categoriasExistentes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      ) : mensajes.length === 0 ? (
        <p className="text-sm text-slate-400">{t('mensajes.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {mensajes.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              locale={locale}
              t={t}
              showDate
              onEdit={() => router.push(`/calendario/editar/${r.id}`)}
              onCancel={cancelRecordatorio}
              onPause={pauseRecordatorio}
              onResume={resumeRecordatorio}
              onSendNow={sendRecordatorioAhora}
              onDuplicate={(rec) => router.push(`/calendario/nuevo?duplicar=${rec.id}`)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

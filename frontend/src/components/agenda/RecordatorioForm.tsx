'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useProfile } from '@/hooks/useProfile';
import Calendar, { toDateStr } from '@/components/Calendar';
import EmojiPicker from '@/components/EmojiPicker';
import WhatsAppPreview from '@/components/WhatsAppPreview';
import ImagenesPicker from '@/components/ImagenesPicker';
import { getBrowserTimeZone, utcIsoToZonedParts, zonedTimeToUtcIso } from '@/lib/timezone';
import type { Cliente, Frecuencia, Plantilla, Recordatorio } from '@/types/db';

type Modo = 'unica' | 'multiples' | 'recurrente';
type DestinoTipo = 'contacto' | 'grupo';

interface Props {
  clientes: Cliente[];
  plantillas?: Plantilla[];
  uploadAttachments?: (files: File[]) => Promise<{ urls: string[]; error: string | null }>;
  onSaveAsPlantilla?: (nombre: string, mensaje: string, imagenesUrls: string[]) => Promise<{ error: string | null }>;
  /** Si se pasa, el formulario edita este recordatorio en vez de crear uno nuevo. */
  editingReminder?: Recordatorio | null;
  /** Si se pasa (y no se está editando), precarga los datos de este recordatorio para crear uno nuevo a partir de él, sin tocar el original. */
  duplicateFrom?: Recordatorio | null;
  initialClienteId?: string | null;
  initialFecha?: string | null;
  onAdd?: (
    clienteId: string,
    mensaje: string,
    fechaEnvioIso: string,
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  onAddMultiple?: (
    clienteId: string,
    mensaje: string,
    fechasEnvioIso: string[],
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  onAddRecurrente?: (
    clienteId: string,
    mensaje: string,
    fechaInicioIso: string,
    frecuencia: Frecuencia,
    intervaloDias: number | null,
    fechaFinIso: string | null,
    diasPermitidos: number[] | null,
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  onUpdate?: (
    id: string,
    mensaje: string,
    fechaEnvioIso: string,
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  /** Se llama tras guardar con éxito o al cancelar — típicamente vuelve a /calendario. */
  onDone: () => void;
}

const DEFAULT_MENSAJE = 'Hola {{nombre}}, este es tu recordatorio.';
const FRECUENCIAS: Frecuencia[] = ['diaria', 'semanal', 'mensual', 'personalizada'];

// Un tab/ventana que pasa mucho tiempo en segundo plano puede ser
// descartado de memoria por el navegador (ver README, sección 4.6) y
// recargarse desde cero al volver a él — algo que esta app no puede
// evitar, es una decisión del navegador. Lo que sí se puede hacer es no
// perder lo ya escrito cuando eso pasa: el mensaje de un recordatorio
// nuevo (no al editar uno existente, ahí ya hay datos reales que no
// conviene pisar) se guarda en sessionStorage en cada cambio y se
// restaura si la pantalla se vuelve a montar en la misma sesión de la
// pestaña. Se limpia solo al guardar con éxito.
const DRAFT_MENSAJE_KEY = 'remind-me:borrador-recordatorio-mensaje';

/**
 * Formulario de creación/edición de un recordatorio, usado en su propia
 * pantalla (/calendario/nuevo, /calendario/editar/[id]) — deliberadamente
 * separado del calendario de consulta para no mostrar dos calendarios a la
 * vez con propósitos distintos (uno para navegar la agenda, otro para
 * elegir fecha del formulario), que era confuso.
 */
export default function RecordatorioForm({
  clientes,
  plantillas = [],
  uploadAttachments,
  onSaveAsPlantilla,
  editingReminder,
  duplicateFrom,
  initialClienteId,
  initialFecha,
  onAdd,
  onAddMultiple,
  onAddRecurrente,
  onUpdate,
  onDone,
}: Props) {
  const { t, locale } = useLanguage();
  const isEditing = !!editingReminder;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { profile } = useProfile();
  const zonaHoraria = profile?.zona_horaria || getBrowserTimeZone();
  const zonaSincronizada = useRef(false);

  const [destinoTipo, setDestinoTipo] = useState<DestinoTipo>(() => {
    if (editingReminder) return editingReminder.clientes?.es_grupo ? 'grupo' : 'contacto';
    if (duplicateFrom) return duplicateFrom.clientes?.es_grupo ? 'grupo' : 'contacto';
    const inicial = clientes.find((c) => c.id === initialClienteId);
    return inicial?.es_grupo ? 'grupo' : 'contacto';
  });
  const [clienteId, setClienteId] = useState(
    () => editingReminder?.cliente_id ?? duplicateFrom?.cliente_id ?? initialClienteId ?? ''
  );
  const [plantillaId, setPlantillaId] = useState('');
  const [mensaje, setMensaje] = useState(() => {
    if (editingReminder) return editingReminder.mensaje_plantilla;
    if (duplicateFrom) return duplicateFrom.mensaje_plantilla;
    const draft = typeof window !== 'undefined' ? window.sessionStorage.getItem(DRAFT_MENSAJE_KEY) : null;
    return draft || DEFAULT_MENSAJE;
  });
  // Duplicar un recordatorio recurrente arranca igual de recurrente — el
  // usuario puede cambiar de modo a mano si en realidad solo quería el
  // mensaje/destinatario sueltos.
  const [modo, setModo] = useState<Modo>(() => (duplicateFrom?.es_recurrente ? 'recurrente' : 'unica'));
  const [fechas, setFechas] = useState<string[]>(() => {
    if (editingReminder) return [utcIsoToZonedParts(editingReminder.fecha_envio, getBrowserTimeZone()).dateStr];
    if (duplicateFrom) return [utcIsoToZonedParts(duplicateFrom.fecha_envio, getBrowserTimeZone()).dateStr];
    if (initialFecha) return [initialFecha];
    return [toDateStr(new Date())];
  });
  // Una o varias horas para la(s) fecha(s) elegida(s) arriba — aplica a las
  // tres modalidades (única, fechas específicas, recurrente): con varias
  // horas, "fecha única" se comporta como "un día, varias horas" y "fechas
  // específicas" como el cruce fechas×horas, sin necesitar un modo aparte.
  const [horas, setHoras] = useState<string[]>(() => {
    const fuente = editingReminder ?? duplicateFrom;
    return [fuente ? utcIsoToZonedParts(fuente.fecha_envio, getBrowserTimeZone()).timeStr : '09:00'];
  });
  const [nuevaHora, setNuevaHora] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(() => duplicateFrom?.frecuencia ?? 'diaria');
  const [intervaloDias, setIntervaloDias] = useState(() => duplicateFrom?.intervalo_dias ?? 1);
  const [fechaFin, setFechaFin] = useState(() =>
    duplicateFrom?.fecha_fin ? utcIsoToZonedParts(duplicateFrom.fecha_fin, getBrowserTimeZone()).dateStr : ''
  );
  // Días de la semana en que puede caer una repetición (0=domingo..6=sábado).
  // Los 7 marcados equivale a "sin restricción" — se manda `null` al guardar
  // en vez del arreglo completo, para no tratar "todos permitidos" distinto
  // de como se comportaban los recurrentes antes de que existiera esto.
  const [diasPermitidos, setDiasPermitidos] = useState<number[]>(
    () => duplicateFrom?.dias_permitidos ?? [0, 1, 2, 3, 4, 5, 6]
  );

  const [existingUrls, setExistingUrls] = useState<string[]>(
    () => editingReminder?.imagenes_urls ?? duplicateFrom?.imagenes_urls ?? []
  );
  const [archivos, setArchivos] = useState<File[]>([]);
  const [archivoPreviews, setArchivoPreviews] = useState<string[]>([]);
  const [guardarComoPlantilla, setGuardarComoPlantilla] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    window.sessionStorage.setItem(DRAFT_MENSAJE_KEY, mensaje);
  }, [mensaje, isEditing]);

  // El estado inicial de fechas/hora al editar (o duplicar) se calculó con
  // la zona horaria del navegador (useProfile() todavía no había resuelto en
  // el primer render) — en cuanto llega la zona horaria real del perfil, se
  // recalculan una sola vez. Si coinciden (el caso común) esto no cambia
  // nada visible.
  useEffect(() => {
    const fuente = editingReminder ?? duplicateFrom;
    if (!fuente || !profile?.zona_horaria || zonaSincronizada.current) return;
    zonaSincronizada.current = true;
    const { dateStr, timeStr } = utcIsoToZonedParts(fuente.fecha_envio, profile.zona_horaria);
    setFechas([dateStr]);
    setHoras([timeStr]);
    if (duplicateFrom?.fecha_fin) {
      setFechaFin(utcIsoToZonedParts(duplicateFrom.fecha_fin, profile.zona_horaria).dateStr);
    }
  }, [editingReminder, duplicateFrom, profile]);

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setMensaje((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? mensaje.length;
    const end = el.selectionEnd ?? mensaje.length;
    const next = mensaje.slice(0, start) + emoji + mensaje.slice(end);
    setMensaje(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + emoji.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function addFiles(files: File[]) {
    setArchivos((prev) => [...prev, ...files]);
    setArchivoPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  }

  // El índice recibido es sobre la lista combinada [...existingUrls, ...archivoPreviews]
  // que se le pasa a ImagenesPicker para mostrar, así que hay que resolver a
  // cuál de las dos listas reales le corresponde antes de quitarlo.
  function removeImage(index: number) {
    if (index < existingUrls.length) {
      setExistingUrls((prev) => prev.filter((_, i) => i !== index));
    } else {
      const i = index - existingUrls.length;
      setArchivos((prev) => prev.filter((_, j) => j !== i));
      setArchivoPreviews((prev) => prev.filter((_, j) => j !== i));
    }
  }

  function applyPlantilla(id: string) {
    setPlantillaId(id);
    setArchivos([]);
    setArchivoPreviews([]);

    const plantilla = plantillas.find((p) => p.id === id);
    if (!plantilla) {
      // "Sin plantilla (mensaje libre)": limpia lo que haya dejado la
      // plantilla elegida antes, en vez de dejar su mensaje/adjunto pegados.
      setMensaje(DEFAULT_MENSAJE);
      setExistingUrls([]);
      return;
    }

    setMensaje(plantilla.mensaje);
    setExistingUrls(plantilla.imagenes_urls);
  }

  const clientesFiltrados = clientes.filter((c) => (destinoTipo === 'grupo' ? c.es_grupo : !c.es_grupo));

  function changeDestinoTipo(next: DestinoTipo) {
    setDestinoTipo(next);
    setClienteId('');
  }

  function toggleFecha(dateStr: string) {
    if (modo === 'multiples') {
      setFechas((prev) => (prev.includes(dateStr) ? prev.filter((f) => f !== dateStr) : [...prev, dateStr]));
    } else {
      setFechas([dateStr]);
    }
  }

  function addHora(h: string) {
    if (!h || horas.includes(h)) return;
    setHoras((prev) => [...prev, h].sort());
  }

  function removeHora(h: string) {
    setHoras((prev) => prev.filter((x) => x !== h));
  }

  function toggleDia(dia: number) {
    setDiasPermitidos((prev) => {
      if (prev.includes(dia)) {
        // Nunca deja la lista en vacío — un recurrente sin ningún día
        // permitido no podría avanzar nunca a una siguiente fecha.
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== dia);
      }
      return [...prev, dia].sort();
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clienteId) {
      setError(destinoTipo === 'grupo' ? t('recordatorios.selectGrupo') : t('recordatorios.selectContacto'));
      return;
    }
    if (fechas.length === 0) {
      setError(t('recordatorios.selectDate'));
      return;
    }
    if (horas.length === 0) {
      setError(t('recordatorios.selectHoras'));
      return;
    }

    setSubmitting(true);

    let imagenesUrls = existingUrls;
    if (archivos.length > 0 && uploadAttachments) {
      const { urls, error: uploadError } = await uploadAttachments(archivos);
      if (uploadError) {
        setSubmitting(false);
        setError(uploadError || t('plantillas.uploadError'));
        return;
      }
      imagenesUrls = [...existingUrls, ...urls];
    }

    const mensajeFinal = mensaje.trim();
    let result: { error: string | null } | undefined;

    if (isEditing && editingReminder && onUpdate) {
      result = await onUpdate(
        editingReminder.id,
        mensajeFinal,
        zonedTimeToUtcIso(fechas[0], horas[0], zonaHoraria),
        imagenesUrls
      );
    } else if (modo === 'recurrente' && onAddRecurrente) {
      // Una serie recurrente independiente por cada hora elegida (todas con
      // la misma fecha de inicio/frecuencia/fecha de fin) — secuencial, no en
      // paralelo, para que evitarChoqueDeHorario() del backend vea las series
      // ya creadas al revisar la siguiente y no se pisen entre sí.
      const diasParaEnviar = diasPermitidos.length === 7 ? null : diasPermitidos;
      for (const h of horas) {
        result = await onAddRecurrente(
          clienteId,
          mensajeFinal,
          zonedTimeToUtcIso(fechas[0], h, zonaHoraria),
          frecuencia,
          frecuencia === 'personalizada' ? intervaloDias : null,
          fechaFin ? zonedTimeToUtcIso(fechaFin, '23:59', zonaHoraria) : null,
          diasParaEnviar,
          imagenesUrls
        );
        if (result.error) break;
      }
    } else {
      // "Fecha única" y "fechas específicas" comparten esta rama: el cruce
      // fechas×horas cubre ambas (con una sola fecha, "única" simplemente da
      // un cruce de tamaño horas.length). Con exactamente una combinación se
      // usa onAdd (una sola fila) en vez de onAddMultiple, igual que antes.
      const combinaciones = fechas.flatMap((f) => horas.map((h) => zonedTimeToUtcIso(f, h, zonaHoraria)));
      if (combinaciones.length === 1 && onAdd) {
        result = await onAdd(clienteId, mensajeFinal, combinaciones[0], imagenesUrls);
      } else if (onAddMultiple) {
        result = await onAddMultiple(clienteId, mensajeFinal, combinaciones, imagenesUrls);
      }
    }

    if (!result) {
      setSubmitting(false);
      return;
    }
    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    if (guardarComoPlantilla && onSaveAsPlantilla && nombrePlantilla.trim()) {
      await onSaveAsPlantilla(nombrePlantilla.trim(), mensajeFinal, imagenesUrls);
    }

    if (!isEditing) window.sessionStorage.removeItem(DRAFT_MENSAJE_KEY);

    setSubmitting(false);
    onDone();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {isEditing ? t('recordatorios.saveChanges') : t('recordatorios.schedule')}
        </h2>
        <button
          type="button"
          onClick={onDone}
          aria-label={t('common.cancel')}
          className="text-xl leading-none text-slate-400 hover:text-slate-600"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {!isEditing && duplicateFrom && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
            {t('recordatorios.duplicatingHint')}
          </p>
        )}
        {!isEditing && (
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            {(['unica', 'multiples', 'recurrente'] as Modo[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setModo(m);
                  setFechas(m === 'unica' ? [initialFecha ?? toDateStr(new Date())] : []);
                }}
                className={`flex-1 rounded-md px-2 py-1 ${
                  modo === m ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-white'
                }`}
              >
                {t(`recordatorios.mode.${m}`)}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('recordatorios.destino')}</label>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            {(['contacto', 'grupo'] as DestinoTipo[]).map((d) => (
              <button
                key={d}
                type="button"
                disabled={isEditing}
                onClick={() => changeDestinoTipo(d)}
                className={`flex-1 rounded-md px-2 py-1 disabled:opacity-50 ${
                  destinoTipo === d ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-white'
                }`}
              >
                {t(`recordatorios.destino.${d}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">
            {destinoTipo === 'grupo' ? t('recordatorios.grupo') : t('recordatorios.contacto')}
          </label>
          <select
            required
            disabled={isEditing}
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">
              {destinoTipo === 'grupo'
                ? t('recordatorios.selectGrupoPlaceholder')
                : t('recordatorios.selectContactoPlaceholder')}
            </option>
            {clientesFiltrados.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.es_grupo ? `👥 ${cliente.nombre}` : `${cliente.nombre} (${cliente.telefono})`}
              </option>
            ))}
          </select>
        </div>

        {!isEditing && plantillas.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500">{t('recordatorios.usarPlantilla')}</label>
            <select
              value={plantillaId}
              onChange={(e) => applyPlantilla(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">{t('recordatorios.selectPlantillaPlaceholder')}</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('recordatorios.mensaje')}</label>
          <textarea
            ref={textareaRef}
            required
            rows={2}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">{t('recordatorios.mensajeHint')}</p>
            <EmojiPicker onSelect={insertEmoji} ariaLabel={t('plantillas.insertEmoji')} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('preview.title')}</label>
          <WhatsAppPreview
            mensaje={mensaje}
            imagenesUrls={[...existingUrls, ...archivoPreviews]}
            nombreEjemplo={clientesFiltrados.find((c) => c.id === clienteId)?.nombre ?? t('plantillas.previewSampleName')}
            placeholder={t('preview.placeholder')}
          />
        </div>

        {uploadAttachments && (
          <div className="space-y-1">
            <label className="text-xs text-slate-500">{t('recordatorios.adjunto')}</label>
            <ImagenesPicker
              previews={[...existingUrls, ...archivoPreviews]}
              onAddFiles={addFiles}
              onRemove={removeImage}
              hint={t('plantillas.imagenHint')}
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs text-slate-500">
            {modo === 'recurrente' ? t('recordatorios.fechaInicio') : t('recordatorios.fecha')}
          </label>
          <Calendar selected={fechas} onToggle={toggleFecha} locale={locale} />
          {modo === 'multiples' && (
            <p className="text-xs text-slate-400">
              {fechas.length} {t('recordatorios.datesSelectedSuffix')}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('recordatorios.hora')}</label>
          {isEditing ? (
            <input
              required
              type="time"
              value={horas[0] ?? '09:00'}
              onChange={(e) => setHoras([e.target.value])}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          ) : (
            <>
              {horas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {horas.map((h) => (
                    <span
                      key={h}
                      className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"
                    >
                      {h}
                      <button
                        type="button"
                        onClick={() => removeHora(h)}
                        aria-label={t('common.delete')}
                        className="leading-none text-emerald-600 hover:text-emerald-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="time"
                  value={nuevaHora}
                  onChange={(e) => setNuevaHora(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    addHora(nuevaHora);
                    setNuevaHora('');
                  }}
                  disabled={!nuevaHora}
                  className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
                >
                  {t('recordatorios.addHora')}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                {horas.length} {t('recordatorios.horasSelectedSuffix')}
              </p>
            </>
          )}
          <p className="text-xs text-slate-400">
            {t('recordatorios.horaZonaHintPrefix')} {zonaHoraria}
          </p>
          {!isEditing && modo === 'recurrente' && horas.length > 1 && (
            <p className="text-xs text-amber-600">
              {horas.length} {t('recordatorios.totalSeriesSuffix')}
            </p>
          )}
          {!isEditing && modo !== 'recurrente' && fechas.length * horas.length > 1 && (
            <p className="text-xs text-amber-600">
              {fechas.length * horas.length} {t('recordatorios.totalRecordatoriosSuffix')}
            </p>
          )}
        </div>

        {modo === 'recurrente' && !isEditing && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-500">{t('recordatorios.frecuencia')}</label>
              <select
                value={frecuencia}
                onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {FRECUENCIAS.map((f) => (
                  <option key={f} value={f}>
                    {t(`recordatorios.frecuencia.${f}`)}
                  </option>
                ))}
              </select>
            </div>

            {frecuencia === 'personalizada' && (
              <div className="space-y-1">
                <label className="text-xs text-slate-500">{t('recordatorios.intervaloDias')}</label>
                <input
                  required
                  type="number"
                  min={1}
                  value={intervaloDias}
                  onChange={(e) => setIntervaloDias(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-slate-500">{t('recordatorios.fechaFin')}</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <p className="text-xs text-slate-400">{t('recordatorios.fechaFinHint')}</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-500">{t('recordatorios.diasPermitidos')}</label>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((dia) => (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDia(dia)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium ${
                      diasPermitidos.includes(dia)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-400 border border-slate-200'
                    }`}
                  >
                    {t(`recordatorios.diaAbrev.${dia}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">{t('recordatorios.diasPermitidosHint')}</p>
            </div>
          </div>
        )}

        {!isEditing && onSaveAsPlantilla && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={guardarComoPlantilla}
                onChange={(e) => setGuardarComoPlantilla(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t('recordatorios.guardarComoPlantilla')}
            </label>
            {guardarComoPlantilla && (
              <input
                required
                value={nombrePlantilla}
                onChange={(e) => setNombrePlantilla(e.target.value)}
                placeholder={t('recordatorios.nombrePlantillaPlaceholder')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || clientesFiltrados.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {isEditing ? t('recordatorios.saveChanges') : t('recordatorios.schedule')}
          </button>
          <button type="button" onClick={onDone} className="text-sm text-slate-500 hover:text-slate-700">
            {t('common.cancel')}
          </button>
        </div>
        {clientesFiltrados.length === 0 && <p className="text-xs text-slate-400">{t('recordatorios.needCliente')}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}

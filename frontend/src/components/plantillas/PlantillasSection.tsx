'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '@/i18n/LanguageProvider';
import EmojiPicker from '@/components/EmojiPicker';
import WhatsAppPreview from '@/components/WhatsAppPreview';
import ImagenesPicker from '@/components/ImagenesPicker';
import type { Plantilla } from '@/types/db';

// Ver la nota larga en RecordatorioForm.tsx: si el navegador descarta esta
// pestaña en segundo plano y la recarga, se pierde lo que no esté guardado
// — esto conserva nombre/mensaje de una plantilla NUEVA (no al editar una
// existente) mientras se escribe, para no tener que retipearlos.
const DRAFT_KEY = 'remind-me:borrador-plantilla';

function loadDraft(): { nombre: string; mensaje: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface Props {
  plantillas: Plantilla[];
  loading: boolean;
  uploadAttachments: (files: File[]) => Promise<{ urls: string[]; error: string | null }>;
  onAdd: (nombre: string, mensaje: string, imagenesUrls: string[]) => Promise<{ error: string | null }>;
  onUpdate: (id: string, nombre: string, mensaje: string, imagenesUrls: string[]) => Promise<{ error: string | null }>;
  onRemove: (id: string) => Promise<{ error: string | null }>;
}

export default function PlantillasSection({ plantillas, loading, uploadAttachments, onAdd, onUpdate, onRemove }: Props) {
  const { t } = useLanguage();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState(() => loadDraft()?.nombre ?? '');
  const [mensaje, setMensaje] = useState(() => loadDraft()?.mensaje ?? '');
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [archivoPreviews, setArchivoPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingId) return;
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ nombre, mensaje }));
  }, [nombre, mensaje, editingId]);

  function resetForm() {
    setEditingId(null);
    setNombre('');
    setMensaje('');
    setExistingUrls([]);
    setArchivos([]);
    setArchivoPreviews([]);
    setError(null);
  }

  function startEdit(plantilla: Plantilla) {
    setEditingId(plantilla.id);
    setNombre(plantilla.nombre);
    setMensaje(plantilla.mensaje);
    setExistingUrls(plantilla.imagenes_urls);
    setArchivos([]);
    setArchivoPreviews([]);
    setError(null);
    document.getElementById('plantilla-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const nombreTrim = nombre.trim();
    const mensajeTrim = mensaje.trim();
    if (!nombreTrim || !mensajeTrim) {
      setError(t('plantillas.nombreMensajeRequired'));
      return;
    }

    setSubmitting(true);

    let imagenesUrls = existingUrls;
    if (archivos.length > 0) {
      const { urls, error: uploadError } = await uploadAttachments(archivos);
      if (uploadError) {
        setSubmitting(false);
        setError(uploadError || t('plantillas.uploadError'));
        return;
      }
      imagenesUrls = [...existingUrls, ...urls];
    }

    const wasNew = !editingId;
    const result = editingId
      ? await onUpdate(editingId, nombreTrim, mensajeTrim, imagenesUrls)
      : await onAdd(nombreTrim, mensajeTrim, imagenesUrls);

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      if (wasNew) window.sessionStorage.removeItem(DRAFT_KEY);
      resetForm();
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{t('plantillas.title')}</h2>

      <form id="plantilla-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('plantillas.nombre')}</label>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={t('plantillas.nombrePlaceholder')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('recordatorios.mensaje')}</label>
          <textarea
            ref={textareaRef}
            required
            rows={3}
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
            nombreEjemplo={t('plantillas.previewSampleName')}
            placeholder={t('preview.placeholder')}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('recordatorios.adjunto')}</label>
          <ImagenesPicker
            previews={[...existingUrls, ...archivoPreviews]}
            onAddFiles={addFiles}
            onRemove={removeImage}
            hint={t('plantillas.imagenHint')}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {editingId ? t('common.saveChanges') : t('plantillas.add')}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-700">
              {t('common.cancel')}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      ) : plantillas.length === 0 ? (
        <p className="text-sm text-slate-400">{t('plantillas.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {plantillas.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                {p.imagenes_urls.length > 0 && (
                  <img
                    src={p.imagenes_urls[0]}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{p.nombre}</p>
                  <p className="truncate text-slate-500">{p.mensaje}</p>
                </div>
              </div>
              <span className="flex shrink-0 gap-3">
                <button onClick={() => startEdit(p)} className="font-medium text-sky-600 hover:text-sky-700">
                  {t('common.edit')}
                </button>
                <button onClick={() => onRemove(p.id)} className="font-medium text-red-600 hover:text-red-700">
                  {t('common.delete')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

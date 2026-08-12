'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useWhatsAppContacts } from '@/hooks/useWhatsAppContacts';
import { useWhatsAppGroups } from '@/hooks/useWhatsAppGroups';
import { COUNTRY_CODES_BY_LENGTH } from '@/lib/countryCodes';
import CountryCodeSelect from '@/components/contactos/CountryCodeSelect';
import CategoriaAutocomplete from '@/components/contactos/CategoriaAutocomplete';
import type { Cliente } from '@/types/db';

interface Props {
  clientes: Cliente[];
  loading: boolean;
  initialTab?: ImportMode;
  onAdd: (nombre: string, telefono: string, categoria: string | null) => Promise<{ error: string | null }>;
  onAddBulk: (
    rows: { nombre: string; telefono: string; categoria: string | null; es_grupo?: boolean }[]
  ) => Promise<{ error: string | null }>;
  onUpdate: (
    id: string,
    nombre: string,
    telefono: string,
    categoria: string | null
  ) => Promise<{ error: string | null }>;
  onRemove: (id: string) => Promise<{ error: string | null }>;
  onSchedule: (clienteId: string) => void;
}

type ImportMode = 'contactos' | 'grupos';

interface ImportItem {
  id: string;
  label: string;
  sublabel?: string;
}

const SIN_CATEGORIA = '__sin_categoria__';

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

function splitPhone(telefono: string): { countryCode: string; localNumber: string } {
  const match = COUNTRY_CODES_BY_LENGTH.find((c) => telefono.startsWith(c.code));
  if (match) return { countryCode: match.code, localNumber: telefono.slice(match.code.length) };
  return { countryCode: '+52', localNumber: normalizePhone(telefono) };
}

export default function ContactosSection({
  clientes,
  loading,
  initialTab,
  onAdd,
  onAddBulk,
  onUpdate,
  onRemove,
  onSchedule,
}: Props) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<ImportMode>(initialTab ?? 'contactos');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [countryCode, setCountryCode] = useState('+52');
  const [localNumber, setLocalNumber] = useState('');
  const [categoria, setCategoria] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>(initialTab ?? 'contactos');
  const [importSearch, setImportSearch] = useState('');
  const [importCategoria, setImportCategoria] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importSubmitError, setImportSubmitError] = useState<string | null>(null);

  const {
    contacts,
    loading: contactsLoading,
    syncing,
    error: contactsError,
    fetchContacts,
    resyncContacts,
  } = useWhatsAppContacts();

  const { groups, loading: groupsLoading, error: groupsError, fetchGroups } = useWhatsAppGroups();

  const contactosGuardados = useMemo(() => clientes.filter((c) => !c.es_grupo), [clientes]);
  const gruposGuardados = useMemo(() => clientes.filter((c) => c.es_grupo), [clientes]);
  const clientesDeLaPestana = viewMode === 'grupos' ? gruposGuardados : contactosGuardados;

  const categoriasExistentes = useMemo(
    () => [...new Set(clientesDeLaPestana.map((c) => c.categoria).filter((c): c is string => !!c))].sort(),
    [clientesDeLaPestana]
  );

  const existingPhones = useMemo(
    () => new Set(contactosGuardados.map((c) => normalizePhone(c.telefono))),
    [contactosGuardados]
  );
  const existingGroupJids = useMemo(() => new Set(gruposGuardados.map((c) => c.telefono)), [gruposGuardados]);

  const clientesFiltrados = useMemo(() => {
    if (!categoriaFiltro) return clientesDeLaPestana;
    if (categoriaFiltro === SIN_CATEGORIA) return clientesDeLaPestana.filter((c) => !c.categoria);
    return clientesDeLaPestana.filter((c) => c.categoria === categoriaFiltro);
  }, [clientesDeLaPestana, categoriaFiltro]);

  const importLoading = importMode === 'contactos' ? contactsLoading || syncing : groupsLoading;
  const importError = importMode === 'contactos' ? contactsError : groupsError;

  const importItems: ImportItem[] = useMemo(() => {
    const q = importSearch.toLowerCase();
    if (importMode === 'contactos') {
      return contacts
        .filter((c) => !existingPhones.has(normalizePhone(c.phone)))
        .filter((c) => !q || (c.name ?? '').toLowerCase().includes(q) || c.phone.includes(q))
        .map((c) => ({ id: c.phone, label: c.name || c.phone, sublabel: c.name ? c.phone : undefined }));
    }
    return groups
      .filter((g) => !existingGroupJids.has(g.jid))
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .map((g) => ({ id: g.jid, label: g.name, sublabel: t('clientes.importParticipants').replace('{n}', String(g.participantsCount)) }));
  }, [importMode, contacts, groups, existingPhones, existingGroupJids, importSearch, t]);

  function resetForm() {
    setEditingId(null);
    setNombre('');
    setCountryCode('+52');
    setLocalNumber('');
    setCategoria('');
    setError(null);
  }

  function startEdit(cliente: Cliente) {
    setEditingId(cliente.id);
    setNombre(cliente.nombre);
    const { countryCode: cc, localNumber: ln } = splitPhone(cliente.telefono);
    setCountryCode(cc);
    setLocalNumber(ln);
    setCategoria(cliente.categoria ?? '');
    setError(null);
    document.getElementById('contacto-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const nombreTrim = nombre.trim();
    const digits = localNumber.replace(/\D/g, '');

    if (!nombreTrim) {
      setError(t('clientes.nombreRequired'));
      return;
    }
    if (digits.length < 7) {
      setError(t('clientes.telefonoHint'));
      return;
    }

    setSubmitting(true);
    const telefonoFinal = `${countryCode}${digits}`;
    const categoriaFinal = categoria.trim() || null;
    const { error: err } = editingId
      ? await onUpdate(editingId, nombreTrim, telefonoFinal, categoriaFinal)
      : await onAdd(nombreTrim, telefonoFinal, categoriaFinal);
    setSubmitting(false);

    if (err) setError(err);
    else resetForm();
  }

  function switchViewMode(mode: ImportMode) {
    setViewMode(mode);
    setCategoriaFiltro('');
  }

  // A diferencia de los grupos (consulta directa, siempre trae la lista
  // real), los contactos viven en un Map en memoria del backend que se
  // resetea en cada reinicio/redeploy del proceso. Por eso una consulta
  // "barata" (fetchContacts) puede volver vacía sin que eso signifique que
  // el usuario no tiene contactos — así que si vuelve vacía, se escala
  // automáticamente a resyncContacts() (fuerza una resincronización
  // completa con WhatsApp) en vez de dejar al usuario con una lista vacía
  // y obligarlo a encontrar el botón de "Sincronizar" por su cuenta.
  async function ensureContactsLoaded() {
    const list = await fetchContacts();
    if (list.length === 0) await resyncContacts();
  }

  function toggleImportOpen() {
    const next = !importOpen;
    setImportOpen(next);
    if (next) {
      setImportMode(viewMode);
      if (viewMode === 'grupos') fetchGroups();
      else ensureContactsLoaded();
    }
  }

  function switchImportMode(mode: ImportMode) {
    setImportMode(mode);
    setSelectedIds(new Set());
    setImportSubmitError(null);
    if (mode === 'grupos') fetchGroups();
    else ensureContactsLoaded();
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const allSelected = importItems.length > 0 && importItems.every((i) => prev.has(i.id));
      if (allSelected) return new Set();
      return new Set(importItems.map((i) => i.id));
    });
  }

  async function handleImportSubmit() {
    setImportSubmitError(null);
    const categoriaFinal = importCategoria.trim() || null;
    const rows = importItems
      .filter((i) => selectedIds.has(i.id))
      .map((i) => ({
        nombre: i.label,
        telefono: i.id,
        categoria: categoriaFinal,
        es_grupo: importMode === 'grupos',
      }));
    if (rows.length === 0) return;

    setImportSubmitting(true);
    const { error: err } = await onAddBulk(rows);
    setImportSubmitting(false);

    if (err) {
      setImportSubmitError(err);
    } else {
      setSelectedIds(new Set());
      setImportOpen(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t('clientes.title')}</h2>
        <button
          type="button"
          onClick={toggleImportOpen}
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          {importOpen ? t('common.cancel') : t('clientes.importWhatsapp')}
        </button>
      </div>

      {importOpen && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {(['contactos', 'grupos'] as ImportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchImportMode(m)}
                className={`flex-1 rounded-md px-2 py-1 ${
                  importMode === m ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t(`clientes.importMode.${m}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{t('clientes.importTitle')}</h3>
            {importMode === 'contactos' && (
              <button
                type="button"
                onClick={resyncContacts}
                disabled={syncing || contactsLoading}
                className="shrink-0 text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
              >
                {syncing ? t('clientes.importSyncing') : t('clientes.importSync')}
              </button>
            )}
          </div>

          {importLoading ? (
            <p className="text-sm text-slate-400">{t('common.loading')}</p>
          ) : importError ? (
            <p className="text-sm text-red-600">{importError}</p>
          ) : (
            <>
              <input
                value={importSearch}
                onChange={(e) => setImportSearch(e.target.value)}
                placeholder={importMode === 'grupos' ? t('clientes.importSearchGrupos') : t('clientes.importSearch')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />

              <CategoriaAutocomplete
                value={importCategoria}
                onChange={setImportCategoria}
                categorias={categoriasExistentes}
                placeholder={t('clientes.importCategoriaPlaceholder')}
              />

              {importItems.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {importMode === 'grupos' ? t('clientes.importEmptyGrupos') : t('clientes.importEmpty')}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    {t('clientes.importToggleAll')}
                  </button>

                  <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                    {importItems.map((item) => (
                      <li key={item.id}>
                        <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelected(item.id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="font-medium text-slate-900">
                            {importMode === 'grupos' && '👥 '}
                            {item.label}
                          </span>
                          {item.sublabel && <span className="text-slate-400">{item.sublabel}</span>}
                        </label>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={handleImportSubmit}
                    disabled={importSubmitting || selectedIds.size === 0}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {t('clientes.importSubmit')} ({selectedIds.size})
                  </button>
                  {importSubmitError && <p className="text-sm text-red-600">{importSubmitError}</p>}
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
        {(['contactos', 'grupos'] as ImportMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchViewMode(m)}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium ${
              viewMode === m ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-white'
            }`}
          >
            {t(`clientes.importMode.${m}`)} ({m === 'grupos' ? gruposGuardados.length : contactosGuardados.length})
          </button>
        ))}
      </div>

      {viewMode === 'contactos' ? (
        <form
          id="contacto-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <label className="text-xs text-slate-500">{t('clientes.nombre')}</label>
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-slate-500">{t('clientes.telefono')}</label>
            <div className="flex gap-2">
              <CountryCodeSelect value={countryCode} onChange={setCountryCode} ariaLabel={t('clientes.countryCode')} />
              <input
                required
                type="tel"
                inputMode="numeric"
                minLength={7}
                maxLength={12}
                value={localNumber}
                onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="5512345678"
                className="w-full min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-slate-500">{t('clientes.categoria')}</label>
            <CategoriaAutocomplete
              value={categoria}
              onChange={setCategoria}
              categorias={categoriasExistentes}
              placeholder={t('clientes.categoriaPlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {editingId ? t('common.saveChanges') : t('clientes.add')}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-700">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="text-xs text-slate-400">{t('clientes.gruposHint')}</p>
      )}
      {viewMode === 'contactos' && error && <p className="text-sm text-red-600">{error}</p>}

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
      ) : clientesFiltrados.length === 0 ? (
        <p className="text-sm text-slate-400">
          {viewMode === 'grupos' ? t('clientes.emptyGrupos') : t('clientes.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {clientesFiltrados.map((cliente) => (
            <li key={cliente.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {cliente.es_grupo && '👥 '}
                  {cliente.nombre}
                </p>
                {!cliente.es_grupo && <p className="text-slate-500">{cliente.telefono}</p>}
                {cliente.categoria && (
                  <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                    {cliente.categoria}
                  </span>
                )}
              </div>
              <span className="flex gap-3">
                <button
                  onClick={() => onSchedule(cliente.id)}
                  className="font-medium text-emerald-600 hover:text-emerald-700"
                >
                  {t('clientes.schedule')}
                </button>
                {!cliente.es_grupo && (
                  <button onClick={() => startEdit(cliente)} className="font-medium text-sky-600 hover:text-sky-700">
                    {t('common.edit')}
                  </button>
                )}
                <button onClick={() => onRemove(cliente.id)} className="font-medium text-red-600 hover:text-red-700">
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

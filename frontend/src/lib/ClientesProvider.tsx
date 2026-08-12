'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthProvider';
import type { Cliente } from '@/types/db';

interface ClientesContextValue {
  clientes: Cliente[];
  loading: boolean;
  addCliente: (nombre: string, telefono: string, categoria?: string | null) => Promise<{ error: string | null }>;
  addClientesBulk: (
    rows: { nombre: string; telefono: string; categoria: string | null; es_grupo?: boolean }[]
  ) => Promise<{ error: string | null }>;
  updateCliente: (
    id: string,
    nombre: string,
    telefono: string,
    categoria: string | null
  ) => Promise<{ error: string | null }>;
  removeCliente: (id: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const ClientesContext = createContext<ClientesContextValue | null>(null);

/**
 * Monta la cartera de contactos una sola vez, en el layout compartido de
 * `(app)` — igual que WhatsAppStatusProvider. Antes cada página que usaba
 * useClientes() (Dashboard, Contactos, el formulario de recordatorios...)
 * tenía su propio useEffect de carga, así que Next.js la volvía a pedir
 * desde cero cada vez que se navegaba a esa página, aunque los datos no
 * hubieran cambiado — se sentía como que "todo se refresca" al cambiar de
 * pestaña. Viviendo aquí, los datos y su estado de carga sobreviven a la
 * navegación entre rutas; solo se vuelven a pedir cuando algo los cambia de
 * verdad (una de las funciones de abajo) o al iniciar sesión.
 */
export function ClientesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, categoria, es_grupo, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setClientes(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addCliente(nombre: string, telefono: string, categoria: string | null = null) {
    if (!user) return { error: 'No hay sesión activa' };
    const { error } = await supabase.from('clientes').insert({ nombre, telefono, categoria, user_id: user.id });
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  // Alta masiva (usada al importar contactos o grupos de WhatsApp). Supabase
  // inserta todas las filas en una sola llamada; si alguna falla (ej.
  // duplicado), la llamada completa devuelve error y no se inserta ninguna
  // — se le pide al usuario que revise antes de reintentar en vez de hacer
  // un manejo parcial fila por fila.
  async function addClientesBulk(
    rows: { nombre: string; telefono: string; categoria: string | null; es_grupo?: boolean }[]
  ) {
    if (!user) return { error: 'No hay sesión activa' };
    if (rows.length === 0) return { error: null };
    const { error } = await supabase.from('clientes').insert(rows.map((r) => ({ ...r, user_id: user.id })));
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function updateCliente(id: string, nombre: string, telefono: string, categoria: string | null) {
    const { error } = await supabase.from('clientes').update({ nombre, telefono, categoria }).eq('id', id);
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function removeCliente(id: string) {
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  return (
    <ClientesContext.Provider
      value={{ clientes, loading, addCliente, addClientesBulk, updateCliente, removeCliente, refresh }}
    >
      {children}
    </ClientesContext.Provider>
  );
}

export function useClientesContext() {
  const ctx = useContext(ClientesContext);
  if (!ctx) throw new Error('useClientesContext debe usarse dentro de ClientesProvider');
  return ctx;
}

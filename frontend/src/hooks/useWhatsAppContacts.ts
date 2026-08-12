'use client';

import { useState } from 'react';
import { authHeader } from '@/lib/authHeader';
import type { WhatsAppContact } from '@/types/db';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useWhatsAppContacts() {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Devuelve la lista obtenida (además de guardarla en el estado) para que
  // quien llama pueda decidir en el momento si hace falta escalar a
  // resyncContacts() — leer el estado justo después de setContacts() no
  // serviría porque React no lo actualiza de forma síncrona.
  async function fetchContacts() {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/whatsapp/session/contacts', { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudieron cargar los contactos');
        setContacts([]);
        return [];
      }
      const list = data.contacts ?? [];
      setContacts(list);
      return list;
    } catch {
      setError('No se pudieron cargar los contactos');
      return [];
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  // Le pide a WhatsApp que vuelva a mandar la libreta de contactos completa
  // (útil si la sesión ya estaba conectada de antes y los contactos nunca
  // llegaron solos) y, tras un breve respiro para que el backend los reciba
  // de forma asíncrona, vuelve a consultarlos.
  async function resyncContacts() {
    setSyncing(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/whatsapp/session/contacts/resync', { method: 'POST', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'No se pudo sincronizar');
        return;
      }
      await wait(3000);
      await fetchContacts();
    } catch {
      setError('No se pudo sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  return { contacts, loading, syncing, error, loaded, fetchContacts, resyncContacts };
}

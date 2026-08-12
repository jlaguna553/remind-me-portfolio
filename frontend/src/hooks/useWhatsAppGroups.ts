'use client';

import { useState } from 'react';
import { authHeader } from '@/lib/authHeader';
import type { WhatsAppGroup } from '@/types/db';

export function useWhatsAppGroups() {
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // A diferencia de los contactos (que llegan solos por eventos del socket),
  // la lista de grupos es una consulta directa a WhatsApp: siempre trae el
  // estado actual, no necesita un botón de "sincronizar" aparte.
  async function fetchGroups() {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/whatsapp/session/groups', { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudieron cargar los grupos');
        setGroups([]);
      } else {
        setGroups(data.groups ?? []);
      }
    } catch {
      setError('No se pudieron cargar los grupos');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  return { groups, loading, error, loaded, fetchGroups };
}

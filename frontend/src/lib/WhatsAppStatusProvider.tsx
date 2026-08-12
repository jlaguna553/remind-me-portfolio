'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authHeader } from '@/lib/authHeader';

type Status = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface StatusResponse {
  status: Status;
  queueLength: number;
  phoneNumber: string | null;
  pairingCode: string | null;
}

interface WhatsAppStatusContextValue {
  status: StatusResponse | null;
  qr: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  requestPairingCode: (phoneNumber: string) => Promise<void>;
  logout: () => Promise<void>;
}

const WhatsAppStatusContext = createContext<WhatsAppStatusContextValue | null>(null);

const POLL_INTERVAL_MS = 5000;

/**
 * Monta el polling del estado de WhatsApp una sola vez, en el layout
 * compartido de `(app)` — no dentro de la página donde se muestra (antes
 * era /, ahora /perfil). Next.js desmonta y vuelve a montar los componentes
 * de cada página al navegar entre rutas; si el polling vivía dentro de la
 * página, cada vez que el usuario salía y volvía a entrar a esa pantalla el
 * estado se perdía y arrancaba de cero (mostrando "Cargando estado..." otra
 * vez) aunque nada hubiera cambiado de verdad. Viviendo en el layout, el
 * estado sigue vivo en memoria mientras se navega por el resto de la app, y
 * la pantalla que lo muestra solo lee el valor ya disponible.
 */
export function WhatsAppStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const headers = await authHeader();
      const res = await fetch('/api/whatsapp/session/status', { headers });
      const data: StatusResponse = await res.json();
      setStatus(data);

      if (data.status === 'qr') {
        const qrRes = await fetch('/api/whatsapp/session/qr', { headers });
        if (qrRes.ok) {
          const { qr: nextQr } = await qrRes.json();
          setQr(nextQr);
        }
      } else {
        setQr(null);
      }
    } catch (err) {
      console.error('Error consultando estado de WhatsApp', err);
    }
  }, []);

  // El polling se detiene mientras la pestaña está en segundo plano (y se
  // relanza con un poll inmediato al volver, no hasta el próximo tick) en
  // vez de correr siempre cada 5s sin importar si alguien la está viendo.
  // Un timer de red corriendo sin parar en una pestaña en background es
  // justo el tipo de actividad que Chrome usa para decidir qué pestañas
  // descartar de memoria ("Memory Saver") cuando el sistema necesita RAM —
  // esta app no puede impedir que el navegador descarte la pestaña (eso lo
  // decide el navegador/SO, no el sitio), pero sí puede dejar de darle una
  // razón de más para hacerlo.
  useEffect(() => {
    poll();
    let interval: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (interval) return;
      interval = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }
    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else {
        poll();
        start();
      }
    }

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [poll]);

  async function connect() {
    setError(null);
    setConnecting(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/whatsapp/session/connect', { method: 'POST', headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? null);
      }
      await poll();
    } finally {
      setConnecting(false);
    }
  }

  async function requestPairingCode(phoneNumber: string) {
    setError(null);
    setConnecting(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/whatsapp/session/pairing-code', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? null);
        return;
      }
      await poll();
    } finally {
      setConnecting(false);
    }
  }

  async function logout() {
    setError(null);
    const headers = await authHeader();
    await fetch('/api/whatsapp/session/logout', { method: 'POST', headers });
    await poll();
  }

  return (
    <WhatsAppStatusContext.Provider
      value={{ status, qr, connecting, error, connect, requestPairingCode, logout }}
    >
      {children}
    </WhatsAppStatusContext.Provider>
  );
}

export function useWhatsAppStatus() {
  const ctx = useContext(WhatsAppStatusContext);
  if (!ctx) throw new Error('useWhatsAppStatus debe usarse dentro de WhatsAppStatusProvider');
  return ctx;
}

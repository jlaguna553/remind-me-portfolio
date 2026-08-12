'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/lib/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useProfile } from '@/hooks/useProfile';
import { useWhatsAppStatus } from '@/lib/WhatsAppStatusProvider';
import { supabase } from '@/lib/supabaseClient';
import { getBrowserTimeZone } from '@/lib/timezone';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import WhatsAppStatus from '@/components/WhatsAppStatus';

/**
 * Ningún módulo sirve de nada sin un número de WhatsApp vinculado — todos
 * envían recordatorios desde ahí. En vez de dejar entrar a Contactos,
 * Calendario, etc. con la sesión desconectada (y que el usuario descubra
 * hasta el final que nada se va a enviar), se bloquea el resto de la app
 * hasta que `status === 'connected'`, mismo patrón que el bloqueo de
 * cuenta inactiva en `(app)/layout.tsx` — pantalla completa, sin menú, con
 * la opción de cerrar sesión si prefiere entrar con otra cuenta.
 */
export default function RequireWhatsAppConnection({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const { status } = useWhatsAppStatus();
  const { profile, refresh: refreshProfile } = useProfile();
  const zonaDetectada = useRef(false);

  // WhatsApp no expone la zona horaria del teléfono vinculado (no es un dato
  // del protocolo) — se autodetecta UNA sola vez, la primera vez que la
  // sesión queda conectada y el perfil todavía no tiene una guardada, a
  // partir de la zona del navegador que está viendo la app en ese momento.
  // Después queda editable a mano en /perfil por si no coincide (ej. se
  // administró la cuenta desde otro dispositivo/zona la primera vez).
  useEffect(() => {
    if (status?.status !== 'connected' || !profile || profile.zona_horaria || zonaDetectada.current) return;
    zonaDetectada.current = true;
    supabase
      .rpc('update_own_timezone', { new_timezone: getBrowserTimeZone() })
      .then(({ error }) => {
        if (error) console.error('No se pudo guardar la zona horaria detectada:', error.message);
        else refreshProfile();
      });
  }, [status?.status, profile, refreshProfile]);

  if (!status) {
    return <p className="p-6 text-slate-500">{t('whatsapp.status.loading')}</p>;
  }

  if (status.status !== 'connected') {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <div className="flex justify-end gap-3">
          <LanguageSwitcher />
          <button onClick={signOut} className="text-sm text-slate-500 hover:text-slate-700">
            {t('auth.signOut')}
          </button>
        </div>
        <p className="text-sm text-slate-600">{t('whatsapp.requiredHint')}</p>
        <WhatsAppStatus />
      </main>
    );
  }

  return <>{children}</>;
}

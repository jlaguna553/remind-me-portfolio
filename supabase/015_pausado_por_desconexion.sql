-- =========================================================
-- Reminders App - Migración: distinguir pausa automática de pausa manual
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 014_pausado_hasta.sql
-- =========================================================

-- Hasta ahora no había forma de distinguir "se pausó porque se desvinculó
-- el número" (automático, sessionManager.js) de "el usuario lo pausó a
-- mano" — ambos casos dejaban la fila en estado = 'pausado' sin ninguna
-- otra marca. El problema real: resumeUserReminders() se dispara en
-- CUALQUIER reconexión de WhatsApp (no solo tras un logout — también pasa
-- en una reconexión normal, ej. si WhatsApp cierra la conexión sola cada
-- tanto, o el proceso del backend se reinicia), y antes reanudaba TODO lo
-- que estuviera en 'pausado' sin distinguir — incluyendo una pausa
-- indefinida que el usuario eligió a propósito.
alter table public.recordatorios add column if not exists pausado_por_desconexion boolean not null default false;

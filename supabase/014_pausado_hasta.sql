-- =========================================================
-- Reminders App - Migración: duración de la pausa de un recordatorio
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 013_dias_permitidos_recurrente.sql
-- =========================================================

-- Hasta cuándo debe seguir pausado un recordatorio con estado = 'pausado'.
-- NULL significa "indefinido" (el comportamiento de siempre: solo se
-- reanuda a mano) — así cualquier recordatorio pausado antes de esta
-- migración sigue funcionando exactamente igual.
alter table public.recordatorios add column if not exists pausado_hasta timestamptz;

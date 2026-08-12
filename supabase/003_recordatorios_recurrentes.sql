-- =========================================================
-- Reminders App - Migración: recordatorios recurrentes
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de
-- schema.sql y 002_admin_profiles.sql
-- =========================================================

do $$ begin
  create type public.frecuencia_recordatorio as enum ('diaria', 'semanal', 'mensual', 'personalizada');
exception
  when duplicate_object then null;
end $$;

alter table public.recordatorios
  add column if not exists es_recurrente boolean not null default false,
  add column if not exists frecuencia public.frecuencia_recordatorio,
  add column if not exists intervalo_dias int,
  add column if not exists fecha_fin timestamptz,
  add column if not exists ultimo_envio timestamptz;

-- Un recordatorio recurrente siempre debe tener frecuencia; uno normal, no.
alter table public.recordatorios
  drop constraint if exists recordatorios_frecuencia_check;
alter table public.recordatorios
  add constraint recordatorios_frecuencia_check
  check (
    (es_recurrente = false and frecuencia is null)
    or (es_recurrente = true and frecuencia is not null)
  );

-- La frecuencia 'personalizada' requiere un intervalo positivo en días.
alter table public.recordatorios
  drop constraint if exists recordatorios_intervalo_check;
alter table public.recordatorios
  add constraint recordatorios_intervalo_check
  check (frecuencia is distinct from 'personalizada' or intervalo_dias > 0);

-- No se tocan las policies de RLS: son a nivel de fila (auth.uid() = user_id)
-- y ya cubren estas columnas nuevas automáticamente.

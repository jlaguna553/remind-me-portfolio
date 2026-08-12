-- =========================================================
-- Reminders App - Migración: Realtime para recordatorios.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- anteriores.
--
-- Habilita Postgres Changes (Supabase Realtime) sobre `recordatorios`
-- para que el frontend se entere al instante cuando el cron cambia el
-- estado de un recordatorio (pendiente -> enviado/fallido, o el
-- pausado/reanudado automático al desvincular/reconectar WhatsApp) sin
-- tener que refrescar la página. Los clientes solo reciben los cambios de
-- las filas que ya podían leer por RLS (auth.uid() = user_id) — Realtime
-- respeta esas policies, no las evita.
-- =========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recordatorios'
  ) then
    alter publication supabase_realtime add table public.recordatorios;
  end if;
end $$;

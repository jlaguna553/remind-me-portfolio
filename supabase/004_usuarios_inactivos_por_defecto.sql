-- =========================================================
-- Reminders App - Migración: nuevos usuarios inician inactivos
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de
-- schema.sql, 002_admin_profiles.sql y 003_recordatorios_recurrentes.sql
-- =========================================================

-- A partir de ahora, cualquier cuenta nueva se crea con activo = false:
-- un admin debe activarla manualmente desde /admin antes de que el
-- usuario pueda usar su agenda (clientes/recordatorios). No afecta filas
-- ya existentes, así que tu cuenta admin actual sigue activa.
alter table public.profiles alter column activo set default false;

-- ---------------------------------------------------------
-- is_active(): función security definer, simétrica a is_admin()
-- (ver 002_admin_profiles.sql). Permite exigir "activo = true"
-- dentro de policies de RLS sin depender de que el frontend
-- oculte la UI correctamente: la restricción vive en la base de
-- datos, no solo en la interfaz.
-- ---------------------------------------------------------
create or replace function public.is_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.activo from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_active() to authenticated;

-- Un usuario inactivo puede seguir viendo sus propios datos (para que la
-- UI le muestre el aviso de "cuenta pendiente"), pero no puede crear
-- clientes ni recordatorios nuevos hasta que un admin lo active.
drop policy if exists "clientes_insert_own" on public.clientes;
create policy "clientes_insert_own" on public.clientes
  for insert with check (auth.uid() = user_id and public.is_active());

drop policy if exists "recordatorios_insert_own" on public.recordatorios;
create policy "recordatorios_insert_own" on public.recordatorios
  for insert with check (auth.uid() = user_id and public.is_active());

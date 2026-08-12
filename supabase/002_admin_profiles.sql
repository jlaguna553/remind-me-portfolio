-- =========================================================
-- Reminders App - Migración: perfiles de usuario + módulo admin
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de schema.sql
-- =========================================================

-- ---------------------------------------------------------
-- Tabla: profiles
-- Espejo mínimo de auth.users en el esquema público: RLS no
-- puede leer auth.users directamente desde el cliente, y aquí
-- guardamos campos propios (activo, is_admin) que no existen
-- en auth.users.
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  activo      boolean not null default true,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Backfill de usuarios que ya existían antes de esta migración.
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------
-- Trigger: crea automáticamente un profile al registrarse
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- is_admin(): función security definer. Evita la recursión de
-- RLS que ocurriría si la policy de "profiles" consultara la
-- propia tabla "profiles" bajo RLS para saber si eres admin.
-- ---------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------
-- RLS de profiles: cada quien ve su propio perfil; los admins
-- ven todos. Solo los admins pueden actualizar (activar/desactivar
-- cuentas, otorgar rol de admin).
-- ---------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "profiles_update_admin_only" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- RPCs de administración. Son security definer (corren con
-- privilegios elevados) pero verifican is_admin() como primera
-- línea antes de tocar nada, así que solo un admin puede usarlas
-- aunque cualquier usuario autenticado tenga permiso de llamarlas.
-- ---------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id                  uuid,
  email               text,
  activo              boolean,
  is_admin            boolean,
  created_at          timestamptz,
  total_clientes      bigint,
  total_recordatorios bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    p.id, p.email, p.activo, p.is_admin, p.created_at,
    coalesce(c.total, 0) as total_clientes,
    coalesce(r.total, 0) as total_recordatorios
  from public.profiles p
  left join (select user_id, count(*) as total from public.clientes group by user_id) c
    on c.user_id = p.id
  left join (select user_id, count(*) as total from public.recordatorios group by user_id) r
    on r.user_id = p.id
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_user_active(target_user_id uuid, new_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  update public.profiles set activo = new_active where id = target_user_id;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------
-- Bootstrap: marca como admin al primer usuario registrado en
-- este proyecto (detectado al momento de escribir esta migración).
-- Para dar de alta más administradores, vuelve a correr este
-- UPDATE con otro correo, o hazlo desde el panel /admin una vez
-- que exista al menos un admin.
-- ---------------------------------------------------------
update public.profiles set is_admin = true where email = 'admin@example.com';

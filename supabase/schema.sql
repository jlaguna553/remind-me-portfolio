-- =========================================================
-- Reminders App - Supabase schema
-- Ejecutar en el SQL Editor de Supabase (o vía CLI/migrations)
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- Tabla: clientes
-- ---------------------------------------------------------
create table if not exists public.clientes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nombre      text not null,
  telefono    text not null, -- formato E.164, ej: +5215512345678
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists clientes_user_id_idx on public.clientes(user_id);

-- ---------------------------------------------------------
-- Tabla: recordatorios
-- 'en_proceso' evita que un mismo recordatorio se re-encole
-- si el cron corre de nuevo mientras la cola anti-ban todavía
-- no termina de enviarlo (los envíos tardan 30-60s cada uno).
-- ---------------------------------------------------------
do $$ begin
  create type public.estado_recordatorio as enum ('pendiente', 'en_proceso', 'enviado', 'fallido');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.recordatorios (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  cliente_id        uuid not null references public.clientes(id) on delete cascade,
  mensaje_plantilla text not null, -- soporta placeholders, ej: "Hola {{nombre}}, ..."
  fecha_envio       timestamptz not null,
  estado            public.estado_recordatorio not null default 'pendiente',
  intentos          int not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists recordatorios_user_id_idx on public.recordatorios(user_id);
create index if not exists recordatorios_pendientes_idx
  on public.recordatorios(fecha_envio)
  where estado = 'pendiente';

-- ---------------------------------------------------------
-- Trigger genérico para updated_at
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.clientes;
create trigger set_updated_at before update on public.clientes
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.recordatorios;
create trigger set_updated_at before update on public.recordatorios
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Row Level Security: cada usuario solo ve/edita lo suyo
-- ---------------------------------------------------------
alter table public.clientes enable row level security;
alter table public.recordatorios enable row level security;

create policy "clientes_select_own" on public.clientes
  for select using (auth.uid() = user_id);
create policy "clientes_insert_own" on public.clientes
  for insert with check (auth.uid() = user_id);
create policy "clientes_update_own" on public.clientes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clientes_delete_own" on public.clientes
  for delete using (auth.uid() = user_id);

create policy "recordatorios_select_own" on public.recordatorios
  for select using (auth.uid() = user_id);
create policy "recordatorios_insert_own" on public.recordatorios
  for insert with check (auth.uid() = user_id);
create policy "recordatorios_update_own" on public.recordatorios
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recordatorios_delete_own" on public.recordatorios
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- Tabla: wa_sessions
-- Persiste las credenciales/keys de Baileys (sesión de
-- WhatsApp Web) para que el backend no pierda la sesión al
-- dormir/reiniciar en Render/Fly. Solo el backend (usando la
-- service_role key, que ignora RLS) puede leer/escribir aquí.
-- RLS está activo SIN policies -> anon/authenticated no
-- pueden ver esta tabla bajo ninguna circunstancia.
-- ---------------------------------------------------------
create table if not exists public.wa_sessions (
  session_id  text not null,
  key_id      text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (session_id, key_id)
);

alter table public.wa_sessions enable row level security;
-- Intencionalmente sin policies: solo accesible vía service_role key.

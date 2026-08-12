-- =========================================================
-- Reminders App - Migración: plantillas de mensajes + adjuntos
-- (imágenes y stickers) para recordatorios.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- anteriores.
-- =========================================================

-- ---------------------------------------------------------
-- Tabla: plantillas
-- Mensajes reutilizables con soporte de {{nombre}}, opcionalmente con
-- una imagen o un sticker adjuntos.
-- ---------------------------------------------------------
create table if not exists public.plantillas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nombre      text not null,
  mensaje     text not null,
  imagen_url  text,
  sticker_url text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists plantillas_user_id_idx on public.plantillas(user_id);

drop trigger if exists set_updated_at on public.plantillas;
create trigger set_updated_at before update on public.plantillas
  for each row execute function public.set_updated_at();

alter table public.plantillas enable row level security;

create policy "plantillas_select_own" on public.plantillas
  for select using (auth.uid() = user_id);
create policy "plantillas_insert_own" on public.plantillas
  for insert with check (auth.uid() = user_id and public.is_active());
create policy "plantillas_update_own" on public.plantillas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plantillas_delete_own" on public.plantillas
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- recordatorios: un recordatorio puede llevar su propia imagen/sticker,
-- independiente de si vino o no de una plantilla guardada (se copian los
-- valores al crear, igual que ya pasa con mensaje_plantilla).
-- ---------------------------------------------------------
alter table public.recordatorios add column if not exists imagen_url text;
alter table public.recordatorios add column if not exists sticker_url text;

-- ---------------------------------------------------------
-- Storage: bucket público para las imágenes/stickers que se mandan por
-- WhatsApp. Público a propósito: el contenido de todos modos se reenvía
-- a un tercero por WhatsApp en cuanto se agenda el recordatorio, así que
-- no es información sensible, y evita tener que generar URLs firmadas
-- solo para poder previsualizarlas en la UI o que el backend las baje.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cada usuario solo puede subir/borrar dentro de su propia carpeta
-- ({user_id}/archivo.ext) — la lectura pública ya la resuelve el bucket
-- público directamente, sin pasar por estas policies.
create policy "attachments_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active()
  );

create policy "attachments_delete_own" on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =========================================================
-- Reminders App - Migración: varias imágenes por mensaje.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- anteriores.
--
-- Reemplaza la columna `imagen_url` (una sola imagen) por
-- `imagenes_urls` (arreglo) en `recordatorios` y `plantillas`, para poder
-- adjuntar varias imágenes a un mismo mensaje. Se migran los valores
-- existentes antes de borrar la columna vieja, para no perder los datos
-- de quienes ya habían adjuntado una imagen.
-- =========================================================
alter table public.recordatorios add column if not exists imagenes_urls text[] not null default '{}';
update public.recordatorios set imagenes_urls = array[imagen_url] where imagen_url is not null;
alter table public.recordatorios drop column if exists imagen_url;

alter table public.plantillas add column if not exists imagenes_urls text[] not null default '{}';
update public.plantillas set imagenes_urls = array[imagen_url] where imagen_url is not null;
alter table public.plantillas drop column if exists imagen_url;

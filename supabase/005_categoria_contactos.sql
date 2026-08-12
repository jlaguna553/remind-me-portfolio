-- =========================================================
-- Reminders App - Migración: categoría en contactos (clientes)
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- anteriores.
-- =========================================================

-- Texto libre en vez de un enum: cada usuario etiqueta a sus contactos como
-- quiera (ej. "Cliente frecuente", "Proveedor", "Prospecto"), sin necesidad
-- de una migración cada vez que alguien quiera una categoría nueva.
alter table public.clientes add column if not exists categoria text;

create index if not exists clientes_categoria_idx on public.clientes(categoria);

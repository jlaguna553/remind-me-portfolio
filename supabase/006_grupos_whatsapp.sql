-- =========================================================
-- Reminders App - Migración: contactos que son grupos de WhatsApp
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- anteriores.
-- =========================================================

-- Un "contacto" que en realidad es un grupo de WhatsApp: reutiliza la misma
-- tabla y el mismo flujo de agendado (recordatorios.cliente_id no cambia),
-- en vez de crear un modelo de datos paralelo solo para grupos. Cuando
-- es_grupo = true, la columna `telefono` guarda el JID del grupo
-- (termina en "@g.us") en vez de un número de teléfono en formato E.164.
alter table public.clientes add column if not exists es_grupo boolean not null default false;

create index if not exists clientes_es_grupo_idx on public.clientes(es_grupo);

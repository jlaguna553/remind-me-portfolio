-- =========================================================
-- Reminders App - Migración: se quita el soporte de stickers.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- anteriores.
--
-- Se decidió no ofrecer stickers en plantillas/recordatorios (solo
-- imágenes): un sticker real de WhatsApp requiere un webp cuadrado con
-- metadata específica, y una imagen cualquiera enviada como "sticker" vía
-- Baileys no se ve igual que uno del catálogo de stickers — más confusión
-- que valor. Las columnas se borran en vez de dejarlas sin usar porque
-- nunca se llegaron a popular en producción (feature recién agregada).
-- =========================================================
alter table public.recordatorios drop column if exists sticker_url;
alter table public.plantillas drop column if exists sticker_url;

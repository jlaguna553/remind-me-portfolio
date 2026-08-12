-- =========================================================
-- Reminders App - Migración: días de la semana permitidos en recurrentes
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 012_zona_horaria.sql
-- =========================================================

-- Para un recordatorio recurrente, restringe en qué días de la semana puede
-- caer cada repetición (ej. "todos los días excepto fines de semana").
-- NULL (el default, y el valor de todo recordatorio existente) significa
-- "sin restricción" — se comporta exactamente igual que antes de esta
-- migración. Números de 0 (domingo) a 6 (sábado), como Date.getDay() en
-- JavaScript, para no tener que traducir entre convenciones en el backend.
alter table public.recordatorios add column if not exists dias_permitidos smallint[];

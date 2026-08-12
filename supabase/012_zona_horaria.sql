-- =========================================================
-- Reminders App - Migración: zona horaria del número vinculado
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 011_realtime_recordatorios.sql
-- =========================================================

-- WhatsApp/Baileys no expone la zona horaria del teléfono vinculado (no es
-- un dato del protocolo) — se guarda como ajuste de cuenta: se autodetecta
-- desde el navegador la primera vez que la sesión de WhatsApp queda
-- conectada (ver RequireWhatsAppConnection.tsx) y queda editable a mano
-- después en /perfil, por si el dispositivo que vinculó no coincide con la
-- zona real del número.
alter table public.profiles add column if not exists zona_horaria text;

-- ---------------------------------------------------------
-- RPC: update_own_timezone(new_timezone). Mismo patrón que las RPCs de
-- admin (security definer + chequeo manual) pero para que cada usuario
-- pueda actualizar SOLO su propia zona_horaria — profiles_update_admin_only
-- (002_admin_profiles.sql) sigue bloqueando cualquier UPDATE directo a la
-- tabla desde el cliente, así que esta función es la única puerta.
-- ---------------------------------------------------------
create or replace function public.update_own_timezone(new_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set zona_horaria = new_timezone where id = auth.uid();
end;
$$;

grant execute on function public.update_own_timezone(text) to authenticated;

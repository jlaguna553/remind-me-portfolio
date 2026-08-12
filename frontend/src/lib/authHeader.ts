import { supabase } from '@/lib/supabaseClient';

/** Header Authorization con el access token de la sesión actual, para llamar a las route handlers que lo reenvían al backend. */
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

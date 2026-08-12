import { createClient } from '@supabase/supabase-js';

// Usa la anon key: es segura de exponer al navegador porque el acceso
// real a los datos está gobernado por las policies de RLS en Supabase.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

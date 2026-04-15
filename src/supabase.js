import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
// Nuevo formato de Supabase: "Publishable key" (sb_publishable_...).
// Se deja fallback al nombre viejo VITE_SUPABASE_ANON_KEY por compatibilidad.
const publishable =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (url && publishable)
  ? createClient(url, publishable)
  : null;

export const BUCKET = 'product-photos';

export function supabaseReady() {
  return !!supabase;
}

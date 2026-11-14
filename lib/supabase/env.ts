/** Variáveis do Supabase lidas em runtime no servidor (SUPABASE_URL/SUPABASE_ANON_KEY). Aceita os nomes NEXT_PUBLIC_* por compatibilidade.
 *  Apenas a anon key é usada; a service_role NUNCA entra neste projeto (RLS protege os dados). */
export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

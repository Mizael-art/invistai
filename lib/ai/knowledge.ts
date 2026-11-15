import type { SupabaseClient } from "@supabase/supabase-js";

/** Base de conhecimento da TRADEON AI: divisão de documentos em trechos e leitura pelo servidor (protegida pelo segredo). */
export function chunkText(text: string, max = 1200): string[] {
  const clean = text.replace(/\r/g, "").replace(/\t/g, " ").replace(/[  ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\s*\n|(?=\n#{1,6} )|(?=\n=+\n)/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = []; let cur = "";
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (const p of paras) {
    if (p.length > max) {                                   // parágrafo enorme: quebra por frases
      push(); let buf = "";
      for (const s of p.split(/(?<=[.!?;:])\s+/)) { if ((buf + " " + s).length > max && buf) { out.push(buf.trim()); buf = ""; } buf += (buf ? " " : "") + (s.length > max ? s.slice(0, max) : s); }
      if (buf.trim()) out.push(buf.trim()); continue;
    }
    if ((cur + "\n\n" + p).length > max) push();
    cur += (cur ? "\n\n" : "") + p;
  }
  push();
  return out.map((c) => c.slice(0, 4000));
}
export interface Training { instructions: string; examples: { q: string; a: string }[]; docs: number }
export interface KbHit { title: string; source: string | null; content: string; rank: number }
export async function loadTraining(sb: SupabaseClient, secret: string | undefined): Promise<Training> {
  if (!secret) return { instructions: "", examples: [], docs: 0 };
  const { data, error } = await sb.rpc("ai_training_config", { secret }); if (error || !data) return { instructions: "", examples: [], docs: 0 };
  return data as Training;
}
export async function kbSearch(sb: SupabaseClient, secret: string | undefined, q: string, k = 4): Promise<KbHit[]> {
  if (!secret || !q.trim()) return [];
  const { data, error } = await sb.rpc("ai_kb_search", { secret, q: q.slice(0, 500), k }); if (error || !data) return [];
  return data as KbHit[];
}

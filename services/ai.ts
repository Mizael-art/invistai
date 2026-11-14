import { getSupabase } from "@/lib/supabase/server";
import type { Block } from "@/lib/ai/tools";

/** Leitura de conversas/mensagens com a sessão do usuário (RLS garante que só vê as próprias). */
export interface ConvRow { id: string; title: string; updated_at: string }
export interface MsgRow { id: string; role: "user" | "assistant"; content: string; blocks: Block[]; saved: boolean; created_at: string }
export async function listConversations(limit = 40): Promise<ConvRow[]> {
  const sb = await getSupabase(); if (!sb) return [];
  const { data } = await sb.from("ai_conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(limit);
  return (data ?? []) as ConvRow[];
}
export async function getConversation(id: string): Promise<{ conv: ConvRow; messages: MsgRow[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await getSupabase(); if (!sb) return null;
  const { data: conv } = await sb.from("ai_conversations").select("id,title,updated_at").eq("id", id).maybeSingle(); if (!conv) return null;
  const { data } = await sb.from("ai_messages").select("id,role,content,blocks,saved,created_at").eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
  return { conv: conv as ConvRow, messages: (data ?? []) as MsgRow[] };
}
export async function listSaved(limit = 50): Promise<(MsgRow & { conversation_id: string })[]> {
  const sb = await getSupabase(); if (!sb) return [];
  const { data } = await sb.from("ai_messages").select("id,role,content,blocks,saved,created_at,conversation_id").eq("saved", true).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as (MsgRow & { conversation_id: string })[];
}

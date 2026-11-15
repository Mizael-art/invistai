/**
 * Etapa 15 — aplica TODAS as migrações em um Postgres real (PGlite, Postgres 17 em WASM) e testa RLS, grants, restrições e triggers.
 * O esquema `auth` e os papéis `anon`/`authenticated` imitam o mínimo do Supabase (tests/db/supabase-shim.sql).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIG = path.join(process.cwd(), "supabase/migrations");
let db: PGlite;
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const fails = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), "tests/db/supabase-shim.sql"), "utf8"));
  for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(path.join(MIG, f), "utf8"));
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1,'a@t.com','h1',$3), ($2,'b@t.com','h2',$4)`,
    [A, B, JSON.stringify({ name: "Ana", phone: "+5511912345678" }), JSON.stringify({ name: "Bruno", phone: "123" })]);
}, 60_000);

describe("migrações em Postgres real", () => {
  it("todas aplicam em ordem e as tabelas têm RLS ligada", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1`);
    expect(r.rows.map((x) => x.relname)).toEqual(["admin_audit_logs", "ai_conversations", "ai_messages", "ai_requests", "ai_usage", "app_admins", "favorites", "notifications", "payment_webhook_events", "profiles", "subscription_events", "subscription_payments", "subscription_plans", "subscriptions", "user_preferences", "vip_call_events", "vip_calls"]);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });
  it("cadastro cria perfil (nome; telefone só em E.164) e notificação de boas-vindas", async () => {
    const p = await db.query<{ id: string; name: string; phone: string | null }>("select id, name, phone from public.profiles order by name");
    expect(p.rows).toEqual([{ id: A, name: "Ana", phone: "+5511912345678" }, { id: B, name: "Bruno", phone: null }]);
    const n = await db.query("select user_id, kind, category, target, read_at from public.notifications where kind='welcome' order by user_id");
    expect(n.rows).toEqual([{ user_id: A, kind: "welcome", category: "account", target: "/perfil", read_at: null }, { user_id: B, kind: "welcome", category: "account", target: "/perfil", read_at: null }]);
  });
  it("confirmação de e-mail e troca de senha geram notificações (e não repetem)", async () => {
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [A]);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [A]);
    await db.query("update auth.users set encrypted_password = 'h1b' where id = $1", [A]);
    await db.query("update auth.users set raw_user_meta_data = '{}' where id = $1", [A]);
    const k = await db.query<{ kind: string }>("select kind from public.notifications where user_id = $1 order by created_at, kind", [A]);
    expect(k.rows.map((x) => x.kind).sort()).toEqual(["email_confirmed", "password_changed", "welcome"]);
  });
});

describe("RLS: cada usuário só acessa os próprios dados", () => {
  it("perfis: lê/edita só o próprio", async () => {
    await as(A, async () => {
      expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: A }]);
      const u = await db.query("update public.profiles set name = 'X' where id = $1", [B]); expect(u.affectedRows).toBe(0);
      await db.query("update public.profiles set name = 'Ana Maria' where id = $1", [A]);
    });
    expect((await db.query("select name from public.profiles where id=$1", [B])).rows).toEqual([{ name: "Bruno" }]);
  });
  it("favoritos: insere só para si, sem duplicata, apaga só os próprios", async () => {
    await as(A, async () => {
      await db.query("insert into public.favorites (user_id, item_type, item_id) values ($1,'asset','bitcoin')", [A]);
      expect(await fails(db.query("insert into public.favorites (user_id, item_type, item_id) values ($1,'asset','bitcoin')", [A]))).toBe(true);
      expect(await fails(db.query("insert into public.favorites (user_id, item_type, item_id) values ($1,'asset','eth')", [B]))).toBe(true);
    });
    await as(B, async () => {
      await db.query("insert into public.favorites (user_id, item_type, item_id) values ($1,'asset','bitcoin')", [B]);
      expect((await db.query("select user_id from public.favorites")).rows).toEqual([{ user_id: B }]);
      expect((await db.query("delete from public.favorites where user_id = $1", [A])).affectedRows).toBe(0);
    });
    expect((await db.query("select count(*)::int c from public.favorites")).rows[0]).toEqual({ c: 2 });
  });
  it("preferências: categorias de notificação restritas e isoladas", async () => {
    await as(A, async () => {
      await db.query("insert into public.user_preferences (user_id, notification_categories) values ($1, array['market','account']) on conflict (user_id) do update set notification_categories = excluded.notification_categories", [A]);
      expect(await fails(db.query("update public.user_preferences set notification_categories = array['sinais'] where user_id = $1", [A]))).toBe(true);
    });
    await as(B, async () => { expect((await db.query("select * from public.user_preferences where user_id=$1", [A])).rows).toEqual([]); });
  });
  it("notificações: lê só as próprias, só altera read_at, não cria nem apaga", async () => {
    await as(B, async () => {
      const r = await db.query<{ user_id: string }>("select user_id from public.notifications"); expect(r.rows.every((x) => x.user_id === B) && r.rows.length === 1).toBe(true);
      expect((await db.query("update public.notifications set read_at = now() where user_id = $1", [A])).affectedRows).toBe(0);
      await db.query("update public.notifications set read_at = now() where user_id = $1", [B]);
      expect(await fails(db.query("update public.notifications set title = 'hack' where user_id = $1", [B]))).toBe(true);
      expect(await fails(db.query("update public.notifications set user_id = $1 where user_id = $2", [A, B]))).toBe(true);
      expect(await fails(db.query("insert into public.notifications (user_id, kind, category) values ($1,'x','market')", [B]))).toBe(true);
      expect(await fails(db.query("delete from public.notifications where user_id = $1", [B]))).toBe(true);
      expect(await fails(db.query("truncate public.notifications"))).toBe(true);
      expect(await fails(db.query("truncate public.favorites"))).toBe(true);
    });
    expect((await db.query("select count(*)::int c from public.notifications where user_id=$1 and read_at is null", [A])).rows[0]).toEqual({ c: 3 });
  });
  it("visitante (anon) não tem acesso às tabelas privadas", async () => {
    await as(null, async () => {
      for (const t of ["profiles", "favorites", "user_preferences", "notifications"]) expect(await fails(db.query(`select * from public.${t}`)), t).toBe(true);
    });
  });
  it("destino de notificação só aceita caminho interno; categoria é restrita", async () => {
    expect(await fails(db.query("insert into public.notifications (user_id, kind, category, target) values ($1,'x','account','https://evil.com')", [A]))).toBe(true);
    expect(await fails(db.query("insert into public.notifications (user_id, kind, category, target) values ($1,'x','account','//evil.com')", [A]))).toBe(true);
    expect(await fails(db.query("insert into public.notifications (user_id, kind, category) values ($1,'x','signals')", [A]))).toBe(true);
  });
  it("excluir o usuário remove os dados dele em cascata", async () => {
    await db.query("delete from auth.users where id = $1", [B]);
    for (const t of ["profiles", "favorites", "user_preferences", "notifications"]) {
      const col = t === "profiles" ? "id" : "user_id";
      expect((await db.query(`select count(*)::int c from public.${t} where ${col} = $1`, [B])).rows[0], t).toEqual({ c: 0 });
    }
  });
});

describe("Etapa 1 — planos, assinaturas e cota da IA (Postgres real)", () => {
  const C = "33333333-3333-4333-8333-333333333333", D = "44444444-4444-4444-8444-444444444444";
  const consume = (uid: string) => as(uid, async () => (await db.query<{ allowed: boolean; plan: string; used: number; remaining: number | null }>("select * from public.ai_try_consume()")).rows[0]);
  beforeAll(async () => {
    await db.query("insert into auth.users (id, email) values ($1,'c@t.com'), ($2,'d@t.com')", [C, D]);
  });
  it("catálogo com FREE R$0 (3 mensagens), PRO R$30 e MAX R$50 (IA ilimitada)", async () => {
    const r = await db.query("select id, price_cents, ai_message_limit from public.subscription_plans order by sort");
    expect(r.rows).toEqual([{ id: "free", price_cents: 0, ai_message_limit: 3 }, { id: "pro", price_cents: 3000, ai_message_limit: null }, { id: "max", price_cents: 5000, ai_message_limit: null }]);
  });
  it("toda conta nova nasce com assinatura FREE", async () => {
    const r = await db.query<{ plan_id: string; status: string }>("select plan_id, status from public.subscriptions where user_id = $1", [C]);
    expect(r.rows).toEqual([{ plan_id: "free", status: "none" }]);
  });
  it("FREE: exatamente 3 mensagens; a 4ª é bloqueada no banco (inclusive em nova 'sessão')", async () => {
    const r = [await consume(C), await consume(C), await consume(C), await consume(C), await consume(C)];
    expect(r.map((x) => x.allowed)).toEqual([true, true, true, false, false]);
    expect(r[2]).toMatchObject({ plan: "free", used: 3, remaining: 0 });
    expect((await db.query("select messages_used from public.ai_usage where user_id = $1", [C])).rows[0]).toEqual({ messages_used: 3 });
  });
  it("o cliente não consegue zerar/alterar o contador, nem se dar um plano", async () => {
    await as(C, async () => {
      expect(await fails(db.query("update public.ai_usage set messages_used = 0 where user_id = $1", [C]))).toBe(true);
      expect(await fails(db.query("delete from public.ai_usage where user_id = $1", [C]))).toBe(true);
      expect(await fails(db.query("update public.subscriptions set plan_id = 'max', status = 'active' where user_id = $1", [C]))).toBe(true);
      expect(await fails(db.query("insert into public.subscription_payments (user_id, provider, provider_invoice_id, amount_cents, currency, status) values ($1,'stripe','in_x',5000,'brl','paid')", [C]))).toBe(true);
      expect(await fails(db.query("select public.current_plan($1)", [C]))).toBe(true);
    });
  });
  it("cada usuário só vê a própria assinatura, pagamentos e uso", async () => {
    await consume(D);
    await as(D, async () => {
      expect((await db.query("select user_id from public.subscriptions")).rows).toEqual([{ user_id: D }]);
      expect((await db.query("select user_id from public.ai_usage")).rows).toEqual([{ user_id: D }]);
      expect(await fails(db.query("select * from public.payment_webhook_events"))).toBe(true);
      expect(await fails(db.query("select * from public.admin_audit_logs"))).toBe(true);
    });
    await as(null, async () => { expect(await fails(db.query("select * from public.ai_try_consume()"))).toBe(true); });
  });
  it("PRO pago e no período: IA ilimitada; ao vencer volta ao FREE e o bloqueio retorna", async () => {
    await db.query("update public.subscriptions set plan_id='pro', status='active', provider='stripe', current_period_end = now() + interval '30 days' where user_id = $1", [C]);
    const r = await consume(C); expect(r).toMatchObject({ allowed: true, plan: "pro", remaining: null });
    await db.query("update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = $1", [C]);
    expect((await consume(C)).allowed).toBe(false);
  });
  it("status sem pagamento (incomplete/canceled/unpaid) não libera recurso; past_due mantém até o fim do período pago", async () => {
    for (const [st, plan] of [["incomplete", "free"], ["canceled", "free"], ["unpaid", "free"], ["past_due", "max"], ["trialing", "max"]] as const) {
      await db.query("update public.subscriptions set plan_id='max', status=$2, current_period_end = now() + interval '5 days' where user_id = $1", [D, st]);
      expect((await db.query<{ p: string }>("select public.current_plan($1) p", [D])).rows[0].p, st).toBe(plan);
    }
  });
  it("administrador: só o servidor concede; usuário comum não se promove", async () => {
    await as(D, async () => { expect(await fails(db.query("insert into public.app_admins (user_id) values ($1)", [D]))).toBe(true); });
    expect((await db.query<{ a: boolean }>("select public.is_admin($1) a", [D])).rows[0].a).toBe(false);
    await db.query("insert into public.app_admins (user_id) values ($1)", [D]);
    expect((await db.query<{ a: boolean }>("select public.is_admin($1) a", [D])).rows[0].a).toBe(true);
  });
});

describe("Etapa 1 — escrita de cobrança protegida por segredo de servidor", () => {
  const S = "s".repeat(40), U = "55555555-5555-4555-8555-555555555555";
  const sync = (secret: string, plan = "pro", status = "active", end = "now() + interval '30 days'") =>
    db.query(`select public.billing_sync_subscription($1, $2, $3, $4, 'stripe', 'cus_1', 'sub_1', now(), now(), ${end}, false, null, 'teste')`, [secret, U, plan, status]);
  beforeAll(async () => {
    await db.query("insert into auth.users (id, email) values ($1, 'u@t.com')", [U]);
    await db.query("insert into billing_private.settings (key, value) values ('secret_sha256', encode(sha256(convert_to($1,'UTF8')),'hex'))", [S]);
  });
  it("sem o segredo (ou com segredo errado/curto) nada é alterado — nem pelo usuário, nem por visitante", async () => {
    for (const bad of ["", "x", "s".repeat(39), "t".repeat(40)]) expect(await fails(sync(bad)), bad).toBe(true);
    await as(U, async () => { expect(await fails(sync("t".repeat(40)))).toBe(true); });
    await as(null, async () => { expect(await fails(sync("t".repeat(40)))).toBe(true); expect(await fails(db.query("select * from billing_private.settings"))).toBe(true); });
    expect((await db.query<{ p: string }>("select public.current_plan($1) p", [U])).rows[0].p).toBe("free");
  });
  it("com o segredo: assinatura sincronizada libera o plano e registra o histórico de mudança", async () => {
    await as(null, async () => { await sync(S, "max"); });
    expect((await db.query<{ p: string }>("select public.current_plan($1) p", [U])).rows[0].p).toBe("max");
    await sync(S, "pro");
    const ev = await db.query("select from_plan, to_plan, to_status from public.subscription_events where user_id = $1 order by created_at", [U]);
    expect(ev.rows).toEqual([{ from_plan: "free", to_plan: "max", to_status: "active" }, { from_plan: "max", to_plan: "pro", to_status: "active" }]);
    expect((await db.query("select public.billing_user_by_customer($1, 'cus_1') u", [S])).rows[0]).toEqual({ u: U });
  });
  it("evento do provedor processado uma única vez (idempotência) e liberável para nova tentativa", async () => {
    const claim = async () => (await db.query<{ c: boolean }>("select public.billing_claim_event($1, 'evt_1', 'stripe', 'invoice.paid') c", [S])).rows[0].c;
    expect([await claim(), await claim()]).toEqual([true, false]);
    await db.query("select public.billing_release_event($1, 'evt_1')", [S]); expect(await claim()).toBe(true);
  });
  it("pagamentos: pago → reembolsado; reembolso não é sobrescrito por reenvio do evento de pagamento", async () => {
    const pay = () => db.query("select public.billing_record_payment($1, $2, 'stripe', 'in_1', 'pro', 3000, 'BRL', 'paid', 'https://pay.stripe.com/i/1', now(), now() + interval '1 month', now())", [S, U]);
    await pay(); await db.query("select public.billing_mark_refund($1, 'in_1', true)", [S]); await pay();
    expect((await db.query("select status, amount_cents, currency, invoice_url from public.subscription_payments where provider_invoice_id = 'in_1'")).rows[0]).toEqual({ status: "refunded", amount_cents: 3000, currency: "brl", invoice_url: "https://pay.stripe.com/i/1" });
    await as(U, async () => { expect((await db.query("select provider_invoice_id from public.subscription_payments")).rows).toEqual([{ provider_invoice_id: "in_1" }]); });
  });
  it("cancelamento: status canceled devolve ao FREE", async () => {
    await sync(S, "pro", "canceled");
    expect((await db.query<{ p: string }>("select public.current_plan($1) p", [U])).rows[0].p).toBe("free");
  });
});

describe("Etapa 2 — conversas da TRADEON AI (Postgres real)", () => {
  const S = "s".repeat(40), C = "66666666-6666-4666-8666-666666666666", D = "77777777-7777-4777-8777-777777777777";
  beforeAll(async () => { await db.query("insert into auth.users (id, email) values ($1, 'c@t.com'), ($2, 'd@t.com')", [C, D]); });
  it("usuário cria conversa e mensagens próprias; outro usuário não lê nem escreve nelas", async () => {
    const conv = await as(C, async () => (await db.query<{ id: string }>("insert into public.ai_conversations (title) values ('BTC hoje') returning id")).rows[0].id);
    await as(C, async () => { await db.query("insert into public.ai_messages (conversation_id, role, content) values ($1, 'user', 'Analise BTC'), ($1, 'assistant', 'ok')", [conv]); });
    await as(D, async () => {
      expect((await db.query("select * from public.ai_conversations")).rows).toEqual([]);
      expect((await db.query("select * from public.ai_messages")).rows).toEqual([]);
      expect(await fails(db.query("insert into public.ai_messages (conversation_id, role, content) values ($1, 'user', 'invasão')", [conv]))).toBe(true);
      expect(await fails(db.query("insert into public.ai_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'x')", [conv, C]))).toBe(true);
      await db.query("delete from public.ai_conversations where id = $1", [conv]);
    });
    await as(C, async () => {
      expect((await db.query("select role from public.ai_messages order by created_at, role desc")).rows.length).toBe(2);
      expect(await fails(db.query("update public.ai_messages set content = 'adulterado'"))).toBe(true);
      await db.query("update public.ai_messages set saved = true where role = 'assistant'");
      expect((await db.query<{ n: number }>("select count(*)::int n from public.ai_messages where saved")).rows[0].n).toBe(1);
      expect(await fails(db.query("insert into public.ai_messages (conversation_id, role, content) values ($1, 'system', 'x')", [conv]))).toBe(true);
      await db.query("delete from public.ai_conversations where id = $1", [conv]);
      expect((await db.query("select * from public.ai_messages")).rows).toEqual([]);
    });
    await as(null, async () => { expect(await fails(db.query("select * from public.ai_conversations"))).toBe(true); });
  });
  it("devolução de cota e log de uso só com o segredo do servidor", async () => {
    await as(C, async () => { await db.query("select * from public.ai_try_consume()"); await db.query("select * from public.ai_try_consume()"); });
    await as(C, async () => {
      expect(await fails(db.query("select public.ai_release($1)", ["t".repeat(40)]))).toBe(true);
      await db.query("select public.ai_release($1)", [S]);
      expect((await db.query<{ used: number }>("select used from public.ai_quota()")).rows[0].used).toBe(1);
      expect(await fails(db.query("select public.ai_log_request($1, 'openai', 'm', 1, 2, '{snapshot}', 'ok', null, 10)", ["t".repeat(40)]))).toBe(true);
      await db.query("select public.ai_log_request($1, 'openai', 'gpt', 10, 20, '{get_asset_indicators}', 'ok', null, 900)", [S]);
      expect(await fails(db.query("select * from public.ai_requests"))).toBe(true);
    });
    expect((await db.query("select user_id, provider, tools, status from public.ai_requests")).rows).toEqual([{ user_id: C, provider: "openai", tools: ["get_asset_indicators"], status: "ok" }]);
  });
});

describe("Etapa 3 — Calls VIP e funções administrativas (Postgres real)", () => {
  const ADM = "88888888-8888-4888-8888-888888888888", PRO = "99999999-9999-4999-8999-999999999999", FREE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", S = "s".repeat(40);
  const call = { market: "crypto_futures", symbol: "btc/usdt", direction: "long", entry: "95000", stop: "93000", tp1: "96000", tp2: "97000", tp3: "98000", tp4: "100000", leverage: "10", notes: "teste", analyst: "Fulano (CNPI 0000)" };
  const id = async (q: Promise<{ rows: { id: string }[] }>) => (await q).rows[0].id;
  beforeAll(async () => {
    await db.query("insert into auth.users (id, email) values ($1, 'adm@t.com'), ($2, 'pro@t.com'), ($3, 'free@t.com')", [ADM, PRO, FREE]);
    await db.query("insert into public.app_admins (user_id) values ($1)", [ADM]);
    await db.query(`select public.billing_sync_subscription($1, $2, 'pro', 'active', 'stripe', 'cus_p', 'sub_p', now(), now(), now() + interval '30 days', false, null, 'teste')`, [S, PRO]);
  });
  it("só administrador cria/publica; níveis inválidos são rejeitados", async () => {
    await as(PRO, async () => { expect(await fails(db.query("select public.admin_create_call($1::jsonb)", [JSON.stringify(call)]))).toBe(true); });
    await as(PRO, async () => { expect(await fails(db.query("insert into public.vip_calls (market, symbol, direction, entry, stop, tp1) values ('crypto_spot','BTC','long',1,0.5,2)"))).toBe(true); });
    await as(ADM, async () => {
      expect(await fails(db.query("select public.admin_create_call($1::jsonb) id", [JSON.stringify({ ...call, stop: "96500" })]))).toBe(true);           // stop acima da entrada em LONG
      expect(await fails(db.query("select public.admin_create_call($1::jsonb) id", [JSON.stringify({ ...call, tp2: "95500" })]))).toBe(true);           // TP2 abaixo do TP1
      expect(await fails(db.query("select public.admin_create_call($1::jsonb) id", [JSON.stringify({ ...call, market: "crypto_spot" })]))).toBe(true); // alavancagem fora de futuros/forex
      expect(await fails(db.query("select public.admin_create_call($1::jsonb) id", [JSON.stringify({ ...call, direction: "short" })]))).toBe(true);     // SHORT com níveis de LONG
    });
  });
  it("rascunho invisível aos assinantes; publicação notifica PRO/MAX e registra auditoria", async () => {
    const cid = await as(ADM, () => id(db.query<{ id: string }>("select public.admin_create_call($1::jsonb) id", [JSON.stringify(call)])));
    await as(PRO, async () => { expect((await db.query("select * from public.vip_calls")).rows).toEqual([]); });
    await as(ADM, async () => { await db.query("select public.admin_publish_call($1)", [cid]); });
    await as(PRO, async () => {
      const r = await db.query<{ symbol: string; status: string; leverage: string }>("select symbol, status, leverage::text from public.vip_calls");
      expect(r.rows).toEqual([{ symbol: "BTC/USDT", status: "active", leverage: "10" }]);
      expect((await db.query<{ type: string }>("select type from public.vip_call_events")).rows.map((x) => x.type)).toEqual(["published"]);
      const n = await db.query<{ title: string; target: string }>("select title, target from public.notifications where kind = 'vip_call'"); expect(n.rows).toEqual([{ title: "Nova call: LONG BTC/USDT", target: `/calls/${cid}` }]);
    });
    await as(FREE, async () => { expect((await db.query("select * from public.vip_calls")).rows).toEqual([]); expect((await db.query("select * from public.notifications where kind = 'vip_call'")).rows).toEqual([]); });
    const a = await db.query<{ action: string }>("select action from public.admin_audit_logs where target_id = $1 order by created_at", [cid]);
    expect(a.rows.map((x) => x.action)).toEqual(["vip_call.create", "vip_call.publish"]);
    await as(ADM, async () => {
      expect(await fails(db.query("select public.admin_hit_target($1, 2::smallint)", [cid]))).toBe(true);                                  // fora de ordem
      await db.query("select public.admin_hit_target($1, 1::smallint)", [cid]); await db.query("select public.admin_hit_target($1, 2::smallint, 97100)", [cid]);
      await db.query("select public.admin_close_call($1, 'targets', null, 0.1)", [cid]);
    });
    const c = await db.query<{ status: string; exit_price: string; gross_result_pct: string; net_result_pct: string; targets_hit: number }>("select status, exit_price::text, gross_result_pct::text, net_result_pct::text, targets_hit from public.vip_calls where id = $1", [cid]);
    // saída padrão = TP2 (97000): (97000-95000)/95000 = 2,1053% × 10x = 21,0526%; líquido (2,1053 − 0,1) × 10 = 20,0526%
    expect(c.rows[0]).toEqual({ status: "closed", exit_price: "97000", gross_result_pct: "21.0526", net_result_pct: "20.0526", targets_hit: 2 });
    await as(ADM, async () => { expect(await fails(db.query("select public.admin_update_call($1, $2::jsonb)", [cid, JSON.stringify(call)]))).toBe(true); });   // encerrada não é editável
  });
  it("SHORT com stop: resultado negativo; cancelamento; manual exige preço de saída", async () => {
    const s = { ...call, direction: "short", entry: "3000", stop: "3100", tp1: "2900", tp2: "", tp3: "", tp4: "", leverage: "" , market: "crypto_spot", symbol: "ETH/USDT" };
    const cid = await as(ADM, () => id(db.query<{ id: string }>("select public.admin_create_call($1::jsonb, true) id", [JSON.stringify(s)])));
    await as(ADM, async () => { expect(await fails(db.query("select public.admin_close_call($1, 'manual')", [cid]))).toBe(true); await db.query("select public.admin_close_call($1, 'stop')", [cid]); });
    const r = await db.query<{ g: string; n: string | null; stop_hit: boolean }>("select gross_result_pct::text g, net_result_pct::text n, stop_hit from public.vip_calls where id = $1", [cid]);
    expect(r.rows[0]).toEqual({ g: "-3.3333", n: null, stop_hit: true });
    const c2 = await as(ADM, () => id(db.query<{ id: string }>("select public.admin_create_call($1::jsonb, true) id", [JSON.stringify(s)])));
    await as(ADM, async () => { await db.query("select public.admin_cancel_call($1, 'condição invalidada')", [c2]); expect(await fails(db.query("select public.admin_publish_call($1)", [c2]))).toBe(true); });
  });
  it("painel admin: visão geral, usuários e gestão de administradores só para admin", async () => {
    await as(PRO, async () => { for (const q of ["select public.admin_overview()", "select * from public.admin_list_users()", `select public.admin_set_admin('${PRO}', true)`, "select * from public.admin_audit()"]) expect(await fails(db.query(q)), q).toBe(true); });
    await as(ADM, async () => {
      const o = (await db.query<{ o: { mrr_cents: number; users: number; calls: Record<string, number> } }>("select public.admin_overview() o")).rows[0].o;
      expect(o.mrr_cents).toBeGreaterThanOrEqual(3000); expect(o.users).toBeGreaterThanOrEqual(3); expect(o.calls.closed).toBe(2);
      const u = await db.query<{ email: string; plan: string; is_admin: boolean }>("select email, plan, is_admin from public.admin_list_users('pro@')"); expect(u.rows).toEqual([{ email: "pro@t.com", plan: "pro", is_admin: false }]);
      await db.query("select public.admin_set_admin($1, true)", [PRO]); expect(await fails(db.query("select public.admin_set_admin($1, false)", [ADM]))).toBe(true);
    });
    await as(PRO, async () => { expect((await db.query<{ a: boolean }>("select public.am_admin() a")).rows[0].a).toBe(true); });
    await as(FREE, async () => { expect((await db.query<{ a: boolean; p: string }>("select public.am_admin() a, public.my_plan() p")).rows[0]).toEqual({ a: false, p: "free" }); });
  });
});

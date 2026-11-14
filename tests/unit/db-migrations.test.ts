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
    expect(r.rows.map((x) => x.relname)).toEqual(["admin_audit_logs", "ai_usage", "app_admins", "favorites", "notifications", "payment_webhook_events", "profiles", "subscription_events", "subscription_payments", "subscription_plans", "subscriptions", "user_preferences"]);
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

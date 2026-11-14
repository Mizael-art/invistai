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
    expect(r.rows.map((x) => x.relname)).toEqual(["favorites", "notifications", "profiles", "user_preferences"]);
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

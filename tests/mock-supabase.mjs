// MOCK do Supabase Auth (GoTrue) + PostgREST mínimo — usado SOMENTE em testes e2e. Nunca em produção.
import http from "node:http";
import crypto from "node:crypto";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const uuid = (seed) => crypto.createHash("md5").update(seed).digest("hex").replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*$/, "$1-$2-4$3-8$4-$5");
const USERS = {
  "ok@teste.com": { id: "11111111-1111-4111-8111-111111111111", name: "Maria Teste" },
  "slow@teste.com": { id: "22222222-2222-4222-8222-222222222222", name: "Lento Teste", delay: 800 },
  "soft@teste.com": { id: uuid("soft"), name: "Soft Teste", unconfirmed: true },   // login liberado antes de confirmar o e-mail
  "auto@teste.com": { id: uuid("auto"), name: "Auto Teste" },                      // projeto com confirmação desativada
};
const created = new Map();
const pwOverride = new Map(), issued = new Map(), usedRecovery = new Set(), profiles = new Map(), prefsStore = new Map();
const favs = []; let favSeq = 0;
const notifs = []; let notifSeq = 0;
const addNotif = (userId, n) => { notifSeq++; notifs.push({ id: crypto.randomUUID(), user_id: userId, kind: n.kind || "welcome", category: n.category || "account", title: n.title ?? null, message: n.message ?? null, target: n.target ?? null, created_at: new Date(Date.now() + notifSeq).toISOString(), read_at: null, seq: notifSeq }); };
const subOf = (req) => { try { return JSON.parse(Buffer.from((req.headers.authorization || "").replace(/^Bearer /, "").split(".")[1], "base64url").toString()).sub; } catch { return null; } };
const DEFAULT_PROFILE = { name: "Maria Teste", phone: null, lang: null, theme: null };                                                          // contas criadas via /signup (pendentes de confirmação)
const lookup = (email) => USERS[email] || created.get(email) || (/^ok\d+@teste\.com$/.test(email) ? { id: uuid(email), name: "Maria Teste" } : undefined);
let lifetime = 3600, revoked = new Set(), refreshTokens = new Map(), invalidateAll = false;
const stats = { passwordCalls: {}, refreshCalls: 0, logouts: 0, userCalls: 0, signupCalls: {}, signups: [], resends: [], verifies: 0, recovers: [], passwordUpdates: [], logoutScopes: [], profileWrites: [], prefWrites: [], favoriteWrites: [], favoriteDeletes: [] };
const userObj = (email, u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: u.unconfirmed || u.pending ? null : new Date().toISOString(), user_metadata: { name: u.name, ...(u.phone ? { phone: u.phone } : {}) }, app_metadata: {}, identities: [{ id: u.id, provider: "email" }], created_at: new Date().toISOString() });
const idEmail = new Map();
const session = (email) => {
  const u = lookup(email); idEmail.set(u.id, email); const now = Math.floor(Date.now() / 1000), exp = now + lifetime;
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email, aud: "authenticated", role: "authenticated", iat: now, exp, jti: crypto.randomUUID() })}.sig`;
  const refresh = crypto.randomUUID(); refreshTokens.set(refresh, email); (issued.get(email) || issued.set(email, new Set()).get(email)).add(access);
  return { access_token: access, token_type: "bearer", expires_in: lifetime, expires_at: exp, refresh_token: refresh, user: userObj(email, u) };
};
// ----- Etapa 1: assinaturas/cota (espelha as regras das migrações 10/11; a lógica SQL real é testada no PGlite) -----
const BILLING_SECRET = "test-billing-secret-0123456789abcdef-0123";
const subs = new Map(), payments = [], subEvents = [], aiUsage = new Map(), webhookEvents = new Set();
const PLAN_LIMIT = { free: 3, pro: null, max: null };
const curPlan = (uid) => { const s = subs.get(uid); return s && ["pro", "max"].includes(s.plan_id) && ["active", "trialing", "past_due"].includes(s.status) && (!s.current_period_end || new Date(s.current_period_end) > new Date()) ? s.plan_id : "free"; };
const subRow = (uid) => subs.get(uid) || { plan_id: "free", status: "none", provider: null, provider_customer_id: null, provider_subscription_id: null, started_at: null, current_period_start: null, current_period_end: null, cancel_at_period_end: false, canceled_at: null, updated_at: new Date().toISOString() };
const aiTables = { ai_conversations: [], ai_messages: [] }; let aiSeq = 0; const aiRpc = [];
const admins = new Set(); const vipCalls = []; const vipEvents = []; const audit = []; let evSeq = 0;
const train = { instructions: '', instructions_updated_at: null, docs: [], examples: [] };
const brokers = [];
const resetBilling = () => { brokers.length = 0; train.instructions = ''; train.instructions_updated_at = null; train.docs.length = 0; train.examples.length = 0; admins.clear(); vipCalls.length = 0; vipEvents.length = 0; audit.length = 0; aiTables.ai_conversations.length = 0; aiTables.ai_messages.length = 0; aiRpc.length = 0; subs.clear(); payments.length = 0; subEvents.length = 0; aiUsage.clear(); webhookEvents.clear(); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), send = (c, b, h = {}) => { res.writeHead(c, { "content-type": "application/json", ...h }); res.end(b === undefined ? "" : JSON.stringify(b)); };
  if (u.pathname === "/__stats") return send(200, stats);
  if (u.pathname === "/__favs") return send(200, favs);
  if (u.pathname === "/__notifs") return send(200, notifs);
  if (u.pathname === "/__notify") {           // simula o sistema/trigger criando notificações (somente testes)
    const us = lookup((u.searchParams.get("email") || "").toLowerCase()); if (!us) return send(404, {});
    const n = +(u.searchParams.get("n") || 1); for (let i = 0; i < n; i++) addNotif(us.id, { kind: u.searchParams.get("kind") || "welcome", category: u.searchParams.get("category") || "account", target: u.searchParams.has("target") ? u.searchParams.get("target") : "/perfil", title: u.searchParams.get("title"), message: u.searchParams.get("message") });
    return send(200, { ok: true });
  }
  if (u.pathname === "/__lifetime") { lifetime = +(u.searchParams.get("s") || 3600); return send(200, { lifetime }); }
  if (u.pathname === "/__invalidate") { invalidateAll = true; refreshTokens.clear(); return send(200, { ok: true }); }
  if (u.pathname === "/__confirm") { const c = created.get(u.searchParams.get("email")); if (c) c.pending = false; return send(200, { ok: !!c }); }
  if (u.pathname === "/__set_admin") { const us = lookup((u.searchParams.get("email") || "").toLowerCase()); if (!us) return send(404, {}); admins.add(us.id); return send(200, { ok: true }); }
  if (u.pathname === "/__calls") return send(200, { calls: vipCalls, events: vipEvents, audit, notifs: notifs.filter((n) => n.kind === "vip_call") });
  if (u.pathname === "/__brokers") return send(200, brokers);
  if (u.pathname === "/__train") return send(200, train);
  if (u.pathname === "/__ai") return send(200, { ...aiTables, rpc: aiRpc });
  if (u.pathname === "/__ai_usage") { const us = lookup((u.searchParams.get("email") || "").toLowerCase()); if (!us) return send(404, {}); aiUsage.set(us.id, +(u.searchParams.get("used") || 0)); return send(200, { ok: true }); }
  if (u.pathname === "/__billing") return send(200, { subs: Object.fromEntries(subs), payments, subEvents, aiUsage: Object.fromEntries(aiUsage), webhookEvents: [...webhookEvents] });
  if (u.pathname === "/__set_plan") { const us = lookup((u.searchParams.get("email") || "").toLowerCase()); if (!us) return send(404, {}); const plan = u.searchParams.get("plan") || "free"; subs.set(us.id, { ...subRow(us.id), plan_id: plan, status: plan === "free" ? "none" : (u.searchParams.get("status") || "active"), current_period_end: u.searchParams.get("end") || new Date(Date.now() + 30 * 864e5).toISOString() }); return send(200, { ok: true }); }
  if (u.pathname === "/__reset") { resetBilling(); invalidateAll = false; revoked = new Set(); refreshTokens = new Map(); created.clear(); lifetime = 3600; pwOverride.clear(); issued.clear(); usedRecovery.clear(); stats.passwordCalls = {}; stats.signupCalls = {}; stats.signups = []; stats.resends = []; stats.recovers = []; stats.passwordUpdates = []; stats.logoutScopes = []; stats.profileWrites = []; stats.prefWrites = []; profiles.clear(); prefsStore.clear(); favs.length = 0; favSeq = 0; notifs.length = 0; notifSeq = 0; stats.favoriteWrites = []; stats.favoriteDeletes = []; stats.refreshCalls = stats.logouts = stats.userCalls = stats.verifies = 0; return send(200, { ok: true }); }
  if (u.pathname === "/auth/v1/token" && req.method === "POST") {
    const gt = u.searchParams.get("grant_type"), body = await readBody(req);
    if (gt === "password") {
      const email = String(body.email || "").toLowerCase(); stats.passwordCalls[email] = (stats.passwordCalls[email] || 0) + 1;
      if (email === "rate@teste.com") return send(429, { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" });
      if (email === "down@teste.com") return send(500, { code: 500, error_code: "unexpected_failure", msg: "boom" });
      if (email === "unconf@teste.com") return send(400, { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" });
      const user = lookup(email), okPw = user && (pwOverride.has(email) ? body.password === pwOverride.get(email) : user.password ? body.password === user.password : body.password === "Senha@123");
      if (!user || !okPw) return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      if (user.pending) return send(400, { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" });
      if (user.delay) await new Promise((r) => setTimeout(r, user.delay));
      return send(200, session(email));
    }
    if (gt === "refresh_token") {
      stats.refreshCalls++; const email = refreshTokens.get(body.refresh_token);
      if (!email || invalidateAll) return send(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      refreshTokens.delete(body.refresh_token); return send(200, session(email));
    }
    return send(400, { code: 400, error_code: "validation_failed", msg: "unsupported grant" });
  }
  if (u.pathname === "/auth/v1/signup" && req.method === "POST") {
    const body = await readBody(req), email = String(body.email || "").toLowerCase(), meta = body.data || {};
    stats.signupCalls[email] = (stats.signupCalls[email] || 0) + 1;
    stats.signups.push({ email, name: meta.name, phone: meta.phone, passwordLength: String(body.password || "").length });
    if (email === "exists@teste.com") return send(422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    if (email === "dupe@teste.com") return send(200, { id: uuid("dupe"), aud: "authenticated", role: "authenticated", email, identities: [], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() });
    if (email === "weakserver@teste.com") return send(422, { code: 422, error_code: "weak_password", msg: "Password is known to be weak and easy to guess", weak_password: { reasons: ["pwned"] } });
    if (email === "smtpfail@teste.com") return send(500, { code: 500, error_code: "unexpected_failure", msg: "Error sending confirmation email" });
    if (email === "rate@teste.com") return send(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" });
    if (email === "down@teste.com") return send(500, { code: 500, error_code: "unexpected_failure", msg: "boom" });
    if (email === "auto@teste.com" || email === "soft@teste.com") return send(200, session(email));
    if (email === "slowreg@teste.com") await new Promise((r) => setTimeout(r, 800));
    const nu = { id: uuid(email + Date.now()), name: meta.name, phone: meta.phone, password: body.password, pending: true }; created.set(email, nu); addNotif(nu.id, { kind: "welcome", category: "account", target: "/perfil" });
    return send(200, { ...userObj(email, nu), confirmation_sent_at: new Date().toISOString() });
  }
  if (u.pathname === "/auth/v1/resend" && req.method === "POST") {
    const body = await readBody(req), email = String(body.email || "").toLowerCase(); stats.resends.push(email);
    if (email === "rate@teste.com") return send(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" });
    return send(200, { message_id: crypto.randomUUID() });
  }
  if (u.pathname === "/auth/v1/verify" && req.method === "POST") {
    const body = await readBody(req); stats.verifies++;
    if (body.type === "recovery") {
      const m = /^recovery-hash(?:-(\d+))?$/.exec(body.token_hash || ""); if (!m || usedRecovery.has(body.token_hash)) return send(403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
      usedRecovery.add(body.token_hash); return send(200, session(m[1] ? `ok${m[1]}@teste.com` : "ok@teste.com"));
    }
    if (body.token_hash === "valid-hash") return send(200, session("ok@teste.com"));
    return send(403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
  }
  if (u.pathname === "/auth/v1/recover" && req.method === "POST") {
    const body = await readBody(req), email = String(body.email || "").toLowerCase(); stats.recovers.push(email);
    if (email === "rate@teste.com") return send(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" });
    if (email === "smtpfail@teste.com") return send(500, { code: 500, error_code: "unexpected_failure", msg: "Error sending recovery email" });
    if (email === "down@teste.com") return send(500, { code: 500, error_code: "unexpected_failure", msg: "boom" });
    if (email === "slowrec@teste.com") await new Promise((r) => setTimeout(r, 800));
    return send(200, {});                                   // igual para e-mails existentes e inexistentes
  }
  if (u.pathname === "/auth/v1/user") {
    stats.userCalls++;
    const tok = (req.headers.authorization || "").replace(/^Bearer /, ""), parts = tok.split(".");
    try {
      const pl = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (invalidateAll || revoked.has(tok) || pl.exp * 1000 < Date.now()) throw new Error("bad");
      const email = pl.email, us = lookup(email);
      if (req.method === "PUT") {
        const body = await readBody(req), cur = pwOverride.get(email) ?? us.password ?? "Senha@123";
        if (body.password === "Weak@123") return send(422, { code: 422, error_code: "weak_password", msg: "Password is known to be weak and easy to guess", weak_password: { reasons: ["pwned"] } });
        if (body.password === cur) return send(422, { code: 422, error_code: "same_password", msg: "New password should be different from the old password." });
        pwOverride.set(email, body.password); stats.passwordUpdates.push(email);
      }
      return send(200, userObj(email, us));
    } catch { return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }); }
  }
  if (u.pathname === "/auth/v1/logout") {
    stats.logouts++; const tok = (req.headers.authorization || "").replace(/^Bearer /, ""), scope = u.searchParams.get("scope") || "global"; stats.logoutScopes.push(scope); if (scope !== "others") revoked.add(tok);
    if (scope === "others") { try { const em = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).email; for (const t of issued.get(em) || []) if (t !== tok) revoked.add(t); for (const [rt, e2] of [...refreshTokens]) if (e2 === em) refreshTokens.delete(rt); } catch {} }
    if (scope === "global") { try { const em = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).email; for (const t of issued.get(em) || []) revoked.add(t); for (const [rt, e2] of [...refreshTokens]) if (e2 === em) refreshTokens.delete(rt); } catch {} }
    return send(204);
  }
  const eq = (col) => { const v = u.searchParams.get(col); return v && v.startsWith("eq.") ? v.slice(3) : null; };
  const wantsObject = (req.headers.accept || "").includes("vnd.pgrst.object");
  if (u.pathname === "/rest/v1/profiles") {
    if (req.method === "GET") { const id = eq("id"), row = profiles.get(id) || DEFAULT_PROFILE; return send(200, wantsObject ? row : [row]); }
    if (req.method === "POST" || req.method === "PATCH") {
      const body = await readBody(req); for (const b of Array.isArray(body) ? body : [body]) { const id = b.id || eq("id"); profiles.set(id, { ...(profiles.get(id) || DEFAULT_PROFILE), ...b }); stats.profileWrites.push(b); }
      return send(201);
    }
  }
  if (u.pathname === "/rest/v1/favorites") {                       // simula as políticas RLS: só o dono (sub do JWT) lê/insere/apaga
    const sub = subOf(req);
    if (req.method === "GET") {
      let rows = favs.filter((f) => f.user_id === sub); const t = eq("item_type"), ii = eq("item_id");
      if (t) rows = rows.filter((f) => f.item_type === t); if (ii) rows = rows.filter((f) => f.item_id === ii);
      if ((u.searchParams.get("order") || "").startsWith("created_at.desc")) rows = [...rows].sort((a, b) => b.seq - a.seq);
      const lim = +(u.searchParams.get("limit") || 0); if (lim) rows = rows.slice(0, lim);
      return send(200, rows.map(({ seq, ...r }) => r));
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      for (const b of Array.isArray(body) ? body : [body]) {
        if (!sub || b.user_id !== sub) return send(403, { code: "42501", message: 'new row violates row-level security policy for table "favorites"' });
        if (!favs.some((f) => f.user_id === b.user_id && f.item_type === b.item_type && f.item_id === b.item_id)) { favs.push({ ...b, created_at: new Date(Date.now() + favSeq).toISOString(), seq: ++favSeq }); stats.favoriteWrites.push({ type: b.item_type, id: b.item_id, metadata: b.metadata }); }
      }
      return send(201);
    }
    if (req.method === "DELETE") {
      const t = eq("item_type"), ii = eq("item_id");
      for (let i = favs.length - 1; i >= 0; i--) { const f = favs[i]; if (f.user_id === sub && (!t || f.item_type === t) && (!ii || f.item_id === ii)) { favs.splice(i, 1); stats.favoriteDeletes.push({ type: f.item_type, id: f.item_id }); } }
      return send(204);
    }
  }
  if (u.pathname === "/rest/v1/notifications") {                   // RLS simulada: o usuário só vê/atualiza as próprias; não há INSERT/DELETE
    const sub = subOf(req);
    const filt = (rows) => { let r = rows.filter((x) => x.user_id === sub); const c = eq("category"), i = eq("id"), uid = eq("user_id");
      if (uid) r = r.filter((x) => x.user_id === uid); if (c) r = r.filter((x) => x.category === c); if (i) r = r.filter((x) => x.id === i);
      if (u.searchParams.get("read_at") === "is.null") r = r.filter((x) => x.read_at === null);
      const inIds = u.searchParams.get("id"); if (inIds && inIds.startsWith("in.(")) { const ids = inIds.slice(4, -1).split(",").map((v) => v.replace(/"/g, "")); r = r.filter((x) => ids.includes(x.id)); }
      return r; };
    if (req.method === "GET" || req.method === "HEAD") {
      let rows = filt(notifs); if ((u.searchParams.get("order") || "").startsWith("created_at.desc")) rows = [...rows].sort((a, b) => b.seq - a.seq);
      const total = rows.length, off = +(u.searchParams.get("offset") || 0), lim = u.searchParams.has("limit") ? +u.searchParams.get("limit") : total;
      const page = rows.slice(off, off + lim).map(({ seq, user_id, ...r }) => r);
      const h = { "content-range": `${page.length ? off : "*"}${page.length ? "-" + (off + page.length - 1) : ""}/${total}` };
      if (req.method === "HEAD") { res.writeHead(200, { "content-type": "application/json", ...h }); return res.end(); }
      return send(200, page, h);
    }
    if (req.method === "PATCH") {
      const body = await readBody(req); const keys = Object.keys(body);
      if (keys.some((k) => k !== "read_at")) return send(403, { code: "42501", message: "permission denied for table notifications" });   // grant update (read_at)
      for (const x of filt(notifs)) x.read_at = body.read_at; return send(204);
    }
    if (req.method === "POST" || req.method === "DELETE") return send(403, { code: "42501", message: 'new row violates row-level security policy for table "notifications"' });
  }
  if (u.pathname === "/rest/v1/user_preferences") {
    if (req.method === "GET") { const row = prefsStore.get(eq("user_id")); return row ? send(200, wantsObject ? row : [row]) : wantsObject ? send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null }) : send(200, []); }
    if (req.method === "POST" || req.method === "PATCH") { const body = await readBody(req); for (const b of Array.isArray(body) ? body : [body]) { const id = b.user_id || eq("user_id"); prefsStore.set(id, { news_categories: [], notification_categories: [], ...(prefsStore.get(id) || {}), ...b }); stats.prefWrites.push(b); } return send(201); }
  }
  if (u.pathname === "/rest/v1/subscriptions" && req.method === "GET") { const sub = subOf(req), id = eq("user_id"); if (!sub || id !== sub) return wantsObject ? send(406, { code: "PGRST116" }) : send(200, []); const row = subRow(sub); return send(200, wantsObject ? row : [row]); }
  if (["/rest/v1/subscriptions", "/rest/v1/subscription_payments", "/rest/v1/subscription_events", "/rest/v1/ai_usage"].includes(u.pathname) && req.method !== "GET") return send(403, { code: "42501", message: "permission denied" });
  if (u.pathname === "/rest/v1/subscription_payments" && req.method === "GET") { const sub = subOf(req); return send(200, payments.filter((p) => p.user_id === sub).slice().reverse().map(({ user_id, ...r }) => r)); }
  if (u.pathname === "/rest/v1/subscription_events" && req.method === "GET") { const sub = subOf(req); return send(200, subEvents.filter((p) => p.user_id === sub).slice().reverse().map(({ user_id, ...r }) => r)); }
  if (u.pathname === "/rest/v1/rpc/ai_quota" || u.pathname === "/rest/v1/rpc/ai_try_consume") {
    const sub = subOf(req); if (!sub) return send(401, { code: "28000", message: "not_authenticated" });
    const p = curPlan(sub), lim = PLAN_LIMIT[p]; let used = aiUsage.get(sub) || 0;
    if (u.pathname.endsWith("ai_quota")) return send(200, [{ plan: p, used, msg_limit: lim, remaining: lim === null ? null : Math.max(lim - used, 0) }]);
    if (lim !== null && used >= lim) return send(200, [{ allowed: false, plan: p, used, msg_limit: lim, remaining: 0 }]);
    aiUsage.set(sub, ++used); return send(200, [{ allowed: true, plan: p, used, msg_limit: lim, remaining: lim === null ? null : Math.max(lim - used, 0) }]);
  }
  // ----- Etapa 2: conversas/mensagens da IA (RLS simulada: só as próprias; mensagens só alteram `saved`) -----
  const aiT = u.pathname.match(/^\/rest\/v1\/(ai_conversations|ai_messages)$/);
  if (aiT) {
    const tbl = aiTables[aiT[1]], sub = subOf(req); if (!sub) return send(401, { code: "42501", message: "permission denied" });
    const filters = [...u.searchParams.entries()].filter(([k, v]) => !["select", "order", "limit", "offset"].includes(k) && v.startsWith("eq.")).map(([k, v]) => [k, v.slice(3)]);
    const match = (r) => r.user_id === sub && filters.every(([k, v]) => String(r[k]) === v);
    const prefer = req.headers.prefer || ""; const rep = prefer.includes("return=representation");
    const cols = (u.searchParams.get("select") || "*").split(",").map((c) => c.trim());
    const pick = (r) => (cols[0] === "*" ? (({ seq, ...x }) => x)(r) : Object.fromEntries(cols.map((c) => [c, r[c]])));
    const out = (rows, code = 200) => wantsObject ? (rows.length === 1 ? send(code, pick(rows[0])) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` })) : send(code, rows.map(pick));
    if (req.method === "GET") {
      let rows = tbl.filter(match); const o = u.searchParams.get("order") || "";
      if (o) { const [col, dir] = o.split("."); rows = [...rows].sort((a, b) => (a[col] === b[col] ? a.seq - b.seq : a[col] < b[col] ? -1 : 1) * (dir === "desc" ? -1 : 1)); }
      const lim = +(u.searchParams.get("limit") || 0); if (lim) rows = rows.slice(0, lim); return out(rows);
    }
    if (req.method === "POST") {
      const body = await readBody(req); const created = [];
      for (const b of Array.isArray(body) ? body : [body]) {
        const row = { ...b, user_id: b.user_id ?? sub };
        if (row.user_id !== sub) return send(403, { code: "42501", message: "new row violates row-level security policy" });
        if (aiT[1] === "ai_messages") { if (!aiTables.ai_conversations.some((c) => c.id === row.conversation_id && c.user_id === sub)) return send(403, { code: "42501", message: "new row violates row-level security policy" }); if (!["user", "assistant"].includes(row.role)) return send(400, { code: "23514" }); row.blocks ??= []; row.saved ??= false; }
        else row.title ??= "Nova conversa";
        const now = new Date(Date.now() + aiSeq).toISOString(); Object.assign(row, { id: crypto.randomUUID(), created_at: now, updated_at: now, seq: ++aiSeq }); tbl.push(row); created.push(row);
      }
      return rep ? out(created, 201) : send(201);
    }
    if (req.method === "PATCH") {
      const body = await readBody(req); const allowed = aiT[1] === "ai_messages" ? ["saved"] : ["title", "updated_at"];
      if (Object.keys(body).some((k) => !allowed.includes(k))) return send(403, { code: "42501", message: "permission denied" });
      const rows = tbl.filter(match); rows.forEach((r) => Object.assign(r, body)); return rep ? out(rows) : send(204);
    }
    if (req.method === "DELETE") {
      const rows = tbl.filter(match); for (const r of rows) { tbl.splice(tbl.indexOf(r), 1); if (aiT[1] === "ai_conversations") for (let i = aiTables.ai_messages.length - 1; i >= 0; i--) if (aiTables.ai_messages[i].conversation_id === r.id) aiTables.ai_messages.splice(i, 1); }
      return rep ? out(rows) : send(204);
    }
  }
  if (u.pathname === "/rest/v1/rpc/ai_release" || u.pathname === "/rest/v1/rpc/ai_log_request") {
    const b = await readBody(req), sub = subOf(req); if (b.secret !== BILLING_SECRET) return send(403, { code: "42501", message: "billing_forbidden" });
    aiRpc.push({ fn: u.pathname.split("/").pop(), user: sub, ...Object.fromEntries(Object.entries(b).filter(([k]) => k !== "secret")) });
    if (u.pathname.endsWith("ai_release") && sub) aiUsage.set(sub, Math.max((aiUsage.get(sub) || 0) - 1, 0));
    return send(200, null);
  }
  // ----- Corretoras: metadados por RLS (sem colunas cifradas); escrita/credenciais só via RPC com segredo -----
  const BK_COLS = ["id", "exchange", "label", "key_hint", "permissions", "can_trade", "ip_restricted", "bots_allowed", "status", "last_error", "last_checked_at", "created_at"];
  if (u.pathname === "/rest/v1/broker_connections") {
    const sub = subOf(req); if (!sub) return send(401, { code: "42501" });
    const cols = (u.searchParams.get("select") || "*").split(","); if (cols.some((c) => c === "*" || !BK_COLS.includes(c.trim()))) return send(403, { code: "42501", message: "permission denied for column" });
    const idf = (u.searchParams.get("id") || "").replace(/^eq\./, ""); const mine = brokers.filter((b) => b.user_id === sub && (!idf || b.id === idf));
    const pick = (b) => Object.fromEntries(cols.map((c) => [c.trim(), b[c.trim()]]));
    if (req.method === "GET") return wantsObject ? (mine.length === 1 ? send(200, pick(mine[0])) : send(406, { code: "PGRST116", details: `The result contains ${mine.length} rows` })) : send(200, mine.map(pick));
    if (req.method === "DELETE") { for (const b of mine) brokers.splice(brokers.indexOf(b), 1); return send(200, mine.map(pick)); }
    if (req.method === "PATCH") { const body = await readBody(req); if (Object.keys(body).some((k) => !["label", "bots_allowed"].includes(k))) return send(403, { code: "42501" }); mine.forEach((b) => Object.assign(b, body)); return send(200, mine.map(pick)); }
    return send(403, { code: "42501" });
  }
  if (["/rest/v1/rpc/broker_save", "/rest/v1/rpc/broker_credentials", "/rest/v1/rpc/broker_mark"].includes(u.pathname)) {
    const b = await readBody(req), sub = subOf(req); if (b.secret !== BILLING_SECRET) return send(403, { code: "42501", message: "billing_forbidden" }); if (!sub) return send(401, { code: "28000" });
    if (u.pathname.endsWith("broker_save")) {
      if (b.p_permissions?.withdraw) return send(400, { code: "22023", message: "withdraw_enabled" });
      if (brokers.filter((x) => x.user_id === sub).length >= 5) return send(400, { code: "22023", message: "too_many_connections" });
      let row = brokers.find((x) => x.user_id === sub && x.exchange === b.p_exchange && x.key_hint === b.p_key_hint);
      if (!row) { row = { id: crypto.randomUUID(), user_id: sub, created_at: new Date().toISOString(), bots_allowed: false }; brokers.push(row); }
      Object.assign(row, { exchange: b.p_exchange, label: b.p_label || "", key_hint: b.p_key_hint, key_enc: b.p_key_enc, secret_enc: b.p_secret_enc, permissions: b.p_permissions, can_trade: !!b.p_can_trade, ip_restricted: !!b.p_ip_restricted, status: "active", last_error: null, last_checked_at: new Date().toISOString() });
      return send(200, row.id);
    }
    const row = brokers.find((x) => x.id === b.p_id && x.user_id === sub);
    if (u.pathname.endsWith("broker_credentials")) return send(200, row ? [{ exchange: row.exchange, key_enc: row.key_enc, secret_enc: row.secret_enc }] : []);
    if (row) Object.assign(row, { status: b.p_status, permissions: b.p_permissions ?? row.permissions, last_error: b.p_error, last_checked_at: new Date().toISOString(), bots_allowed: b.p_status === "invalid" ? false : row.bots_allowed });
    return send(200, null);
  }
  // ----- Etapa 3: Calls VIP (RLS e funções admin_* simuladas; a lógica SQL real é testada no PGlite) -----
  if (u.pathname === "/rest/v1/rpc/am_admin") { const sub = subOf(req); return send(200, !!sub && admins.has(sub)); }
  if (u.pathname === "/rest/v1/rpc/my_plan") { const sub = subOf(req); return send(200, sub ? curPlan(sub) : "free"); }
  if (u.pathname === "/rest/v1/vip_calls" || u.pathname === "/rest/v1/vip_call_events") {
    const sub = subOf(req); if (!sub) return send(401, { code: "42501", message: "permission denied" }); if (req.method !== "GET") return send(403, { code: "42501", message: "permission denied" });
    const adm = admins.has(sub), paid = ["pro", "max"].includes(curPlan(sub));
    const visible = (c) => adm || (paid && c.status !== "draft");
    let rows = u.pathname.endsWith("vip_calls") ? vipCalls.filter(visible) : vipEvents.filter((e) => { const c = vipCalls.find((x) => x.id === e.call_id); return c && visible(c) && (adm || e.type !== "created"); });
    for (const [k, v] of u.searchParams.entries()) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      else if (v.startsWith("in.(")) { const set = v.slice(4, -1).split(",").map((x) => x.replace(/"/g, "")); rows = rows.filter((r) => set.includes(String(r[k]))); }
      else if (v.startsWith("ilike.")) { const needle = v.slice(6).replace(/[*%]/g, "").toLowerCase(); rows = rows.filter((r) => String(r[k]).toLowerCase().includes(needle)); }
      else if (v.startsWith("gte.")) rows = rows.filter((r) => r[k] && r[k] >= v.slice(4));
    }
    rows = [...rows].sort((a, b) => (u.pathname.endsWith("vip_calls") ? ((b.published_at ?? "9") > (a.published_at ?? "9") ? 1 : -1) || (b.seq - a.seq) : a.seq - b.seq));
    const lim = +(u.searchParams.get("limit") || 0); if (lim) rows = rows.slice(0, lim);
    const out = rows.map(({ seq, call_id, created_by, ...r }) => (u.pathname.endsWith("vip_call_events") ? { ...r } : r));
    if (wantsObject) return out.length === 1 ? send(200, out[0]) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${out.length} rows` });
    return send(200, out);
  }
  // ----- Treino da IA (busca por palavras com radical simples; a busca em português real é testada no PGlite) -----
  const stem = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(oes|aes|s)$/, "").slice(0, 6);
  const kbHits = (q, k) => { const terms = (q.match(/[\p{L}\d]{3,}/gu) || []).map(stem); if (!terms.length) return [];
    return train.docs.filter((d) => d.active).flatMap((d) => d.chunks.map((c) => ({ title: d.title, source: d.source, content: c, rank: terms.filter((t) => (c.match(/[\p{L}\d]{3,}/gu) || []).map(stem).includes(t)).length })))
      .filter((h) => h.rank > 0).sort((a, b) => b.rank - a.rank).slice(0, k); };
  if (u.pathname === "/rest/v1/rpc/ai_training_config" || u.pathname === "/rest/v1/rpc/ai_kb_search") {
    const b = await readBody(req); if (b.secret !== BILLING_SECRET) return send(403, { code: "42501", message: "billing_forbidden" });
    if (u.pathname.endsWith("ai_training_config")) return send(200, { instructions: train.instructions, examples: train.examples.filter((e) => e.active).slice(0, 8).map((e) => ({ q: e.question, a: e.answer })), docs: train.docs.filter((d) => d.active).length });
    return send(200, kbHits(b.q || "", b.k || 4));
  }
  if (u.pathname.startsWith("/rest/v1/rpc/admin_ai_")) {
    const sub = subOf(req), b = await readBody(req), fn = u.pathname.slice("/rest/v1/rpc/".length);
    if (!sub || !admins.has(sub)) return send(400, { code: "42501", message: "admin_required" });
    const log = (action, id) => audit.push({ id: crypto.randomUUID(), admin_id: sub, action, target_type: "ai", target_id: id, details: null, created_at: new Date().toISOString() });
    if (fn === "admin_ai_training") return send(200, { ...train, docs: train.docs.map(({ chunks, ...d }) => ({ ...d, chunks: chunks.length })) });
    if (fn === "admin_ai_set_instructions") { train.instructions = b.p_text || ""; train.instructions_updated_at = new Date().toISOString(); log("ai.instructions", "instructions"); return send(200, null); }
    if (fn === "admin_ai_add_doc") { if (!b.p_chunks?.length) return send(400, { code: "22023", message: "empty_document" }); const id = crypto.randomUUID();
      train.docs.unshift({ id, title: b.p_title, source: b.p_source, active: true, chars: b.p_chunks.join("").length, chunks: b.p_chunks, created_at: new Date().toISOString() }); log("ai.doc.add", id); return send(200, id); }
    if (fn === "admin_ai_doc_set") { const d = train.docs.find((x) => x.id === b.p_id); if (!d) return send(400, { code: "P0002", message: "not_found" }); if (b.p_delete) train.docs.splice(train.docs.indexOf(d), 1); else if (b.p_active != null) d.active = b.p_active; log("ai.doc", d.id); return send(200, null); }
    if (fn === "admin_ai_add_example") { const id = crypto.randomUUID(); train.examples.push({ id, question: b.p_q, answer: b.p_a, active: true, created_at: new Date().toISOString() }); log("ai.example.add", id); return send(200, id); }
    if (fn === "admin_ai_example_set") { const e = train.examples.find((x) => x.id === b.p_id); if (!e) return send(400, { code: "P0002", message: "not_found" }); if (b.p_delete) train.examples.splice(train.examples.indexOf(e), 1); else if (b.p_active != null) e.active = b.p_active; return send(200, null); }
    if (fn === "admin_ai_kb_preview") return send(200, kbHits(b.q || "", 4).map(({ title, content, rank }) => ({ title, content, rank })));
    return send(404, { code: "PGRST202" });
  }
  if (u.pathname.startsWith("/rest/v1/rpc/admin_")) {
    const sub = subOf(req), b = await readBody(req), fn = u.pathname.slice("/rest/v1/rpc/".length);
    if (!sub || !admins.has(sub)) return send(400, { code: "42501", message: "admin_required" });
    const err = (m, code = "22023") => send(400, { code, message: m }); const now = () => new Date(Date.now() + ++evSeq).toISOString();
    const ev = (call_id, type, extra = {}) => vipEvents.push({ id: ++evSeq, call_id, type, tp_index: null, price: null, note: null, created_at: now(), seq: evSeq, ...extra });
    const log = (action, id, details = null) => audit.push({ id: crypto.randomUUID(), admin_id: sub, action, target_type: id ? "vip_call" : "user", target_id: id, details, created_at: now() });
    const find = (id) => vipCalls.find((c) => c.id === id);
    const levelsOk = (c) => { const up = c.direction === "long"; const gt = (a, x) => (up ? a > x : a < x); const t = [c.tp1, c.tp2, c.tp3, c.tp4];
      if (!gt(c.entry, c.stop) || !gt(c.tp1, c.entry)) return false; for (let i = 1; i < 4; i++) { if (t[i] == null) continue; if (t[i - 1] == null || !gt(t[i], t[i - 1])) return false; } return c.leverage == null || ["crypto_futures", "forex"].includes(c.market); };
    const fromP = (p) => { const n = (v) => (v === "" || v == null ? null : Number(v)); return { market: p.market, symbol: String(p.symbol).toUpperCase(), direction: p.direction, entry: n(p.entry), stop: n(p.stop), tp1: n(p.tp1), tp2: n(p.tp2), tp3: n(p.tp3), tp4: n(p.tp4), leverage: n(p.leverage), notes: p.notes || null, analyst: p.analyst || null }; };
    const publish = (c) => { if (c.status !== "draft") return "not_draft"; c.status = "active"; c.published_at = now(); ev(c.id, "published", { price: c.entry });
      for (const [uid] of subs) if (["pro", "max"].includes(curPlan(uid))) addNotif(uid, { kind: "vip_call", category: "market", title: `Nova call: ${c.direction.toUpperCase()} ${c.symbol}`, message: `Entrada ${c.entry} · Stop ${c.stop} · TP1 ${c.tp1}`, target: `/calls/${c.id}` });
      log("vip_call.publish", c.id); return null; };
    if (fn === "admin_create_call") { const c = { id: crypto.randomUUID(), ...fromP(b.p), status: "draft", targets_hit: 0, stop_hit: false, exit_price: null, close_reason: null, fees_pct: null, gross_result_pct: null, net_result_pct: null, created_at: now(), published_at: null, closed_at: null, updated_at: now(), seq: ++evSeq };
      if (!levelsOk(c)) return err("violates check constraint vip_calls_levels", "23514"); vipCalls.push(c); ev(c.id, "created"); log("vip_call.create", c.id, b.p); if (b.p_publish) publish(c); return send(200, c.id); }
    const c = find(b.p_id);
    if (fn === "admin_update_call") { if (!c) return err("not_found", "P0002"); if (!["draft", "active"].includes(c.status)) return err("call_finished"); const nc = { ...c, ...fromP(b.p) }; if (!levelsOk(nc)) return err("check constraint", "23514"); Object.assign(c, nc, { updated_at: now() }); if (c.status === "active") ev(c.id, "edited", { note: b.p.edit_note || null }); log("vip_call.update", c.id, b.p); return send(200, null); }
    if (fn === "admin_publish_call") { if (!c) return err("not_found", "P0002"); const e = publish(c); return e ? err(e) : send(200, null); }
    if (fn === "admin_hit_target") { if (!c) return err("not_found", "P0002"); if (c.status !== "active") return err("not_active"); const lvl = [c.tp1, c.tp2, c.tp3, c.tp4][b.p_tp - 1]; if (lvl == null) return err("invalid_target"); if (b.p_tp !== c.targets_hit + 1) return err("target_out_of_order");
      c.targets_hit = b.p_tp; ev(c.id, "tp_hit", { tp_index: b.p_tp, price: b.p_price ?? lvl }); log("vip_call.tp_hit", c.id); return send(200, null); }
    if (fn === "admin_close_call") { if (!c) return err("not_found", "P0002"); if (c.status !== "active") return err("not_active"); if (b.p_reason === "targets" && !c.targets_hit) return err("no_targets_hit");
      const ex = b.p_exit ?? (b.p_reason === "stop" ? c.stop : b.p_reason === "targets" ? [c.tp1, c.tp2, c.tp3, c.tp4][c.targets_hit - 1] : null); if (!ex) return err("exit_required");
      const d = c.direction === "long" ? 1 : -1, lev = c.leverage ?? 1, raw = (d * (ex - c.entry)) / c.entry * 100; const r4 = (x) => Math.round(x * 10000) / 10000;
      Object.assign(c, { status: "closed", exit_price: ex, close_reason: b.p_reason, fees_pct: b.p_fees ?? null, stop_hit: b.p_reason === "stop", gross_result_pct: r4(raw * lev), net_result_pct: b.p_fees == null ? null : r4((raw - b.p_fees) * lev), closed_at: now(), updated_at: now() });
      if (b.p_reason === "stop") ev(c.id, "stop_hit", { price: ex }); ev(c.id, "closed", { price: ex, note: b.p_note || null }); log("vip_call.close", c.id); return send(200, null); }
    if (fn === "admin_cancel_call") { if (!c) return err("not_found", "P0002"); if (!["draft", "active"].includes(c.status)) return err("call_finished"); c.status = "canceled"; ev(c.id, "canceled", { note: b.p_note || null }); log("vip_call.cancel", c.id); return send(200, null); }
    if (fn === "admin_add_call_note") { if (!c) return err("not_found", "P0002"); ev(c.id, "note", { note: b.p_note }); log("vip_call.note", c.id); return send(200, null); }
    if (fn === "admin_overview") { const plans = {}; for (const [uid] of subs) plans[curPlan(uid)] = (plans[curPlan(uid)] || 0) + 1; const cs = {}; for (const x of vipCalls) cs[x.status] = (cs[x.status] || 0) + 1;
      return send(200, { users: subs.size, plans, subscriptions: {}, mrr_cents: [...subs.keys()].reduce((a, uid) => a + ({ pro: 3000, max: 5000 }[curPlan(uid)] || 0), 0), canceled_30d: 0, payments_30d: null, ai_30d: { requests: 0, errors: 0, blocked: 0, input_tokens: 0, output_tokens: 0, avg_latency_ms: null }, calls: cs, generated_at: now() }); }
    if (fn === "admin_list_users") { const all = [...new Set([...subs.keys(), ...admins])]; const emailOf = (id) => idEmail.get(id) ?? [...created.entries()].find(([, v]) => v.id === id)?.[0] ?? Object.entries(USERS).find(([, v]) => v.id === id)?.[0] ?? `${id.slice(0, 6)}@teste.com`;
      return send(200, all.map((id) => ({ id, email: emailOf(id), name: "Maria Teste", created_at: now(), plan: curPlan(id), sub_status: subs.get(id)?.status ?? null, period_end: subs.get(id)?.current_period_end ?? null, ai_used: aiUsage.get(id) || 0, is_admin: admins.has(id) }))
        .filter((x) => !b.p_search || x.email.includes(b.p_search))); }
    if (fn === "admin_set_admin") { if (b.p_user === sub && !b.p_admin) return err("cannot_remove_self"); if (b.p_admin) admins.add(b.p_user); else admins.delete(b.p_user); log(b.p_admin ? "admin.grant" : "admin.revoke", null); return send(200, null); }
    if (fn === "admin_audit") return send(200, [...audit].reverse().slice(0, b.p_limit || 50));
    return send(404, { code: "PGRST202" });
  }
  if (u.pathname.startsWith("/rest/v1/rpc/billing_")) {
    const b = await readBody(req), fn = u.pathname.slice("/rest/v1/rpc/".length);
    if (b.secret !== BILLING_SECRET) return send(403, { code: "42501", message: "billing_forbidden" });
    if (fn === "billing_claim_event") { if (webhookEvents.has(b.p_event_id)) return send(200, false); webhookEvents.add(b.p_event_id); return send(200, true); }
    if (fn === "billing_release_event") { webhookEvents.delete(b.p_event_id); return send(200, null); }
    if (fn === "billing_user_by_customer") { for (const [k, v] of subs) if (v.provider_customer_id === b.p_customer) return send(200, k); return send(200, null); }
    if (fn === "billing_link_customer") { subs.set(b.p_user, { ...subRow(b.p_user), provider: b.p_provider, provider_customer_id: b.p_customer }); return send(200, null); }
    if (fn === "billing_sync_subscription") {
      const old = subs.get(b.p_user);
      subs.set(b.p_user, { ...subRow(b.p_user), plan_id: b.p_plan, status: b.p_status, provider: b.p_provider, provider_customer_id: b.p_customer ?? old?.provider_customer_id ?? null, provider_subscription_id: b.p_subscription ?? old?.provider_subscription_id ?? null,
        started_at: old?.started_at ?? b.p_started, current_period_start: b.p_period_start, current_period_end: b.p_period_end, cancel_at_period_end: !!b.p_cancel_at_period_end, canceled_at: b.p_canceled_at, updated_at: new Date().toISOString() });
      if (!old || old.plan_id !== b.p_plan || old.status !== b.p_status) subEvents.push({ user_id: b.p_user, from_plan: old?.plan_id ?? null, to_plan: b.p_plan, from_status: old?.status ?? null, to_status: b.p_status, reason: String(b.p_reason || "sync").slice(0, 80), created_at: new Date().toISOString() });
      return send(200, null);
    }
    if (fn === "billing_record_payment") {
      const ex = payments.find((p) => p.provider_invoice_id === b.p_invoice), url = /^https:\/\//.test(b.p_url || "") ? b.p_url : null;
      if (ex) Object.assign(ex, { status: ["refunded", "partially_refunded"].includes(ex.status) ? ex.status : b.p_status, amount_cents: b.p_amount, invoice_url: url ?? ex.invoice_url, paid_at: b.p_paid_at ?? ex.paid_at, plan_id: b.p_plan ?? ex.plan_id });
      else payments.push({ id: crypto.randomUUID(), user_id: b.p_user, provider: b.p_provider, provider_invoice_id: b.p_invoice, plan_id: b.p_plan, amount_cents: b.p_amount, currency: String(b.p_currency).toLowerCase(), status: b.p_status, invoice_url: url, period_start: b.p_period_start, period_end: b.p_period_end, paid_at: b.p_paid_at, created_at: new Date().toISOString() });
      return send(200, null);
    }
    if (fn === "billing_mark_refund") { const ex = payments.find((p) => p.provider_invoice_id === b.p_invoice); if (ex) ex.status = b.p_full ? "refunded" : "partially_refunded"; return send(200, null); }
    return send(404, { code: "PGRST202" });
  }
  send(404, { error: "not found" });
}).listen(4020, "127.0.0.1", () => console.log("mock supabase on 4020"));

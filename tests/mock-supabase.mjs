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
const session = (email) => {
  const u = lookup(email), now = Math.floor(Date.now() / 1000), exp = now + lifetime;
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email, aud: "authenticated", role: "authenticated", iat: now, exp, jti: crypto.randomUUID() })}.sig`;
  const refresh = crypto.randomUUID(); refreshTokens.set(refresh, email); (issued.get(email) || issued.set(email, new Set()).get(email)).add(access);
  return { access_token: access, token_type: "bearer", expires_in: lifetime, expires_at: exp, refresh_token: refresh, user: userObj(email, u) };
};
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
  if (u.pathname === "/__reset") { invalidateAll = false; revoked = new Set(); refreshTokens = new Map(); created.clear(); lifetime = 3600; pwOverride.clear(); issued.clear(); usedRecovery.clear(); stats.passwordCalls = {}; stats.signupCalls = {}; stats.signups = []; stats.resends = []; stats.recovers = []; stats.passwordUpdates = []; stats.logoutScopes = []; stats.profileWrites = []; stats.prefWrites = []; profiles.clear(); prefsStore.clear(); favs.length = 0; favSeq = 0; notifs.length = 0; notifSeq = 0; stats.favoriteWrites = []; stats.favoriteDeletes = []; stats.refreshCalls = stats.logouts = stats.userCalls = stats.verifies = 0; return send(200, { ok: true }); }
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
  send(404, { error: "not found" });
}).listen(4020, "127.0.0.1", () => console.log("mock supabase on 4020"));

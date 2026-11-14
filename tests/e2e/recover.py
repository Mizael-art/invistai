"""E2E da Recuperação de senha (Etapa 09). Mock do Supabase Auth (tests/mock-supabase.mjs). Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"}
SB = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test"}
s1 = start(3901, {**BASE, **SB, "FORGOT_RATE_IP_PER_HOUR": "1000"}); s2 = start(3902, BASE); s3 = start(3903, {**BASE, **SB})
B, B2, B3 = "http://127.0.0.1:3901", "http://127.0.0.1:3902", "http://127.0.0.1:3903"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def stats(): return json.loads(mk("/__stats"))
def sess(ctx): return [c for c in ctx.cookies() if re.match(r"^sb-.*-auth-token(\.\d+)?$", c["name"])]
def rec_cookie(ctx): return [c for c in ctx.cookies() if c["name"] == "iv_recovery"]
def forgot(pg, email, base=B):
    pg.goto(base + "/recuperar-senha"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.get_by_role("button", name=re.compile("^Enviar link")).click()
def open_link(pg, n, base=B):
    pg.goto(f"{base}/auth/confirm?token_hash=recovery-hash-{n}&type=recovery"); pg.wait_for_url(base + "/redefinir-senha"); pg.wait_for_selector("#password", timeout=15000)
def logout(pg):
    pg.get_by_role("button", name="Sair").click(); pg.wait_for_selector("header a.btn:has-text('Entrar')", timeout=10000)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []; calls = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        pg.on("request", lambda r: calls.append(r.url) if "/api/auth/forgot" in r.url or "/api/auth/reset-password" in r.url else None)
        mk("/__reset")
        # --- solicitar recuperação ---
        pg.goto(B + "/recuperar-senha"); pg.wait_for_selector("form")
        check("recuperar: campo e-mail, botão 'Enviar link' e 'Voltar ao login' (sem sidebar)", pg.get_by_label("E-mail").is_visible() and pg.get_by_role("button", name="Enviar link").is_visible() and pg.get_by_role("link", name="Voltar ao login").get_attribute("href") == "/login" and pg.locator("aside").count() == 0)
        pg.get_by_role("button", name="Enviar link").click(); check("validação: e-mail vazio → mensagem e foco", "Informe seu e-mail." in pg.inner_text("form") and pg.evaluate("document.activeElement.id") == "email")
        pg.fill("#email", "abc"); pg.get_by_role("button", name="Enviar link").click(); check("validação: e-mail inválido", "Informe um e-mail válido." in pg.inner_text("form"))
        check("validação inválida não chama a API", calls == [])
        pg.fill("#email", "ok@teste.com"); pg.get_by_role("button", name="Enviar link").click(); pg.wait_for_selector("[data-testid=forgot-sent]", timeout=8000); t1 = pg.inner_text("[data-testid=forgot-sent]")
        pg.goto(B + "/recuperar-senha"); pg.wait_for_selector("form"); pg.fill("#email", "ninguem@teste.com"); pg.get_by_role("button", name="Enviar link").click(); pg.wait_for_selector("[data-testid=forgot-sent]", timeout=8000); t2 = pg.inner_text("[data-testid=forgot-sent]")
        check("mensagem de confirmação é genérica e IDÊNTICA para e-mail existente e inexistente", t1 == t2 and "Se existir uma conta" in t1 and "ninguem" not in t1, t1[:80])
        check("provedor é consultado nos dois casos (sem pré-checagem que vaze cadastro)", stats()["recovers"] == ["ok@teste.com", "ninguem@teste.com"], str(stats()["recovers"]))
        btn = pg.get_by_role("button", name=re.compile("Enviar novamente em \\d+s")); check("reenvio bloqueado por cooldown após o pedido", btn.is_visible() and btn.is_disabled())
        r1 = pg.request.post(B + "/api/auth/forgot", data={"email": "api1@teste.com"}); r2 = pg.request.post(B + "/api/auth/forgot", data={"email": "api-inexistente@teste.com"})
        check("API: mesma resposta (status e corpo) para existente/inexistente", r1.status == r2.status == 200 and r1.json() == r2.json() == {"ok": True})
        r = pg.request.post(B + "/api/auth/forgot", data={"email": "api1@teste.com"}); check("API: segundo pedido no mesmo minuto → 429", r.status == 429 and r.json() == {"error": "rate_limited"})
        r = pg.request.post(B + "/api/auth/forgot", data={"email": "x"}, headers={"origin": "http://evil.com"}); check("API: Origin de outro site → 403", r.status == 403)
        r = pg.request.post(B + "/api/auth/forgot", headers={"content-type": "application/json"}, data="{x"); check("API: JSON inválido → 400", r.status == 400)
        for bad in [{}, {"email": "x"}, {"email": 1}]: r = pg.request.post(B + "/api/auth/forgot", data=bad); check(f"API: entrada inválida {json.dumps(bad)} → 400", r.status == 400)
        for email, txt, name in [("smtpfail@teste.com", "Não foi possível enviar o e-mail agora", "falha de SMTP"), ("rate@teste.com", "Muitas solicitações", "limite do provedor"), ("down@teste.com", "Não foi possível processar sua solicitação", "provedor indisponível")]:
            forgot(pg, email); pg.wait_for_selector("[role=alert].err", timeout=8000); check(f"falha: {name} (sem mensagem de sucesso)", txt in pg.inner_text("form") and pg.locator("[data-testid=forgot-sent]").count() == 0)
        pn = ctx.new_page(); forgot(pn, "ok@teste.com", B2); pn.wait_for_selector("[role=alert].err"); check("sem Supabase: 'ainda não está configurado' (sem sucesso falso)", "ainda não está configurado" in pn.inner_text("form") and pn.locator("[data-testid=forgot-sent]").count() == 0)
        mk("/__reset"); pg.goto(B + "/recuperar-senha"); pg.wait_for_selector("form"); pg.fill("#email", "slowrec@teste.com")
        pg.evaluate("(()=>{const f=document.querySelector('form');f.requestSubmit();f.requestSubmit();f.requestSubmit()})()"); pg.wait_for_selector("[data-testid=forgot-sent]", timeout=8000)
        check("envio repetido bloqueado (1 chamada ao provedor)", stats()["recovers"].count("slowrec@teste.com") == 1, str(stats()["recovers"]))
        codes = [pg.request.post(B3 + "/api/auth/forgot", data={"email": f"ip{i}@teste.com"}).status for i in range(13)]; check("API: limite por IP (10/h) → 429", 429 in codes[10:] and 429 not in codes[:10], str(codes))
        # --- link de recuperação e redefinição ---
        mk("/__reset"); open_link(pg, 501)
        ck = rec_cookie(ctx)
        check("link válido: vai a /redefinir-senha com cookie HttpOnly de recuperação e sessão", len(ck) == 1 and ck[0]["httpOnly"] and ck[0]["sameSite"] == "Lax" and len(sess(ctx)) >= 1)
        rules = lambda: {k: pg.locator(f"li[data-rule={k}]").get_attribute("data-ok") for k in ["length", "upper", "number", "special"]}
        check("redefinir: requisitos pendentes; atualizam ao digitar", set(rules().values()) == {"false"} and (pg.fill("#password", "Abcdef1!") or True) and set(rules().values()) == {"true"})
        pg.fill("#password", "x"); t = pg.locator("#password"); pg.get_by_role("button", name="Mostrar senha").click(); check("mostrar/ocultar senha", t.get_attribute("type") == "text")
        pg.fill("#password", ""); pg.get_by_role("button", name="Salvar nova senha").click(); check("validação: senha vazia", "Crie uma senha." in pg.inner_text("form") and pg.evaluate("document.activeElement.id") == "password")
        pg.fill("#password", "fraca"); pg.get_by_role("button", name="Salvar nova senha").click(); check("validação: senha fraca", "não atende aos requisitos" in pg.inner_text("form"))
        check("validação inválida não chama a API de redefinição", not [c for c in calls if "reset-password" in c])
        pg.fill("#password", "Weak@123"); pg.get_by_role("button", name="Salvar nova senha").click(); pg.wait_for_selector("[role=alert].err:has-text('regras de segurança')", timeout=8000); check("senha recusada pelo provedor (fraca/vazada) → mensagem; continua no formulário", pg.locator("#password").is_visible())
        pg.fill("#password", "Senha@123"); pg.get_by_role("button", name="Salvar nova senha").click(); pg.wait_for_selector("[role=alert].err:has-text('diferente da atual')", timeout=8000); check("mesma senha atual → 'deve ser diferente da atual'", True)
        pg.fill("#password", "Nova@Senha1"); pg.get_by_role("button", name="Salvar nova senha").click(); pg.wait_for_selector("text=Senha alterada", timeout=10000)
        st = stats()
        check("sucesso: resultado informado e botão 'Ir para o login'", pg.get_by_role("link", name="Ir para o login").get_attribute("href") == "/login")
        check("sucesso: senha atualizada no provedor e TODAS as sessões encerradas (global)", st["passwordUpdates"] == ["ok501@teste.com"] and "global" in st["logoutScopes"], str(st["logoutScopes"]))
        check("sucesso: cookies de sessão e de recuperação removidos", not sess(ctx) and not rec_cookie(ctx))
        pg.goto(B + "/login"); pg.fill("#email", "ok501@teste.com"); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_selector("[role=alert].err"); check("senha antiga deixa de funcionar", "E-mail ou senha incorretos." in pg.inner_text("form"))
        pg.fill("#password", "Nova@Senha1"); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_url(B + "/", timeout=10000); pg.wait_for_selector(".lrow", timeout=15000); check("nova senha permite entrar", pg.get_by_role("button", name="Sair").is_visible())
        # sessão normal (sem link de recuperação) não pode redefinir
        pg.goto(B + "/redefinir-senha"); pg.wait_for_selector("[data-testid=reset-invalid]"); check("logado normalmente, sem cookie de recuperação → página de link inválido", pg.get_by_role("link", name="Solicitar novo link").get_attribute("href") == "/recuperar-senha")
        status = pg.evaluate("fetch('/api/auth/reset-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'Outra@Senha9'})}).then(r=>r.status)"); check("API com sessão normal (sem cookie de recuperação) → 401", status == 401)
        pg.goto(B + "/recuperar-senha"); pg.wait_for_url(B + "/"); check("autenticado em /recuperar-senha → redireciona ao Início", True)
        logout(pg)
        # link reutilizado / expirado / inválido
        for q, nm in [("token_hash=recovery-hash-501&type=recovery", "link já utilizado"), ("token_hash=bad-hash&type=recovery", "token inválido"), ("token_hash=abc&type=recovery", "token curto"), ("type=recovery", "sem token")]:
            pg.goto(f"{B}/auth/confirm?{q}"); pg.wait_for_url(re.compile(r"/recuperar-senha\?link=invalid")); check(f"link inválido ({nm}) → /recuperar-senha com aviso", "Link de recuperação inválido ou expirado" in pg.inner_text("form") and not rec_cookie(ctx))
        pg.goto(B + "/redefinir-senha"); pg.wait_for_selector("[data-testid=reset-invalid]"); check("visitante em /redefinir-senha → link inválido (sem formulário)", pg.locator("#password").count() == 0)
        r = pg.request.get(B + "/auth/confirm?token_hash=recovery-hash-502&type=recovery&next=//evil.com", max_redirects=0); check("destino fixo: next é ignorado (sem open redirect)", r.status in (302, 307) and r.headers["location"].endswith("/redefinir-senha"), r.headers.get("location", ""))
        # sessão de recuperação expirada
        ctx.clear_cookies(); open_link(pg, 503); mk("/__invalidate"); pg.goto(B + "/redefinir-senha"); pg.wait_for_selector("[data-testid=reset-invalid]", timeout=10000); check("sessão de recuperação expirada/revogada → link inválido", True)
        mk("/__reset"); ctx.clear_cookies()
        # recuperação sem sessão para quem tem cookie mas token inválido via API
        status = pg.evaluate("document.cookie='iv_recovery=1; path=/'; fetch('/api/auth/reset-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'Outra@Senha9'})}).then(r=>r.status)"); check("cookie de recuperação forjado via JS, sem sessão válida → 401", status == 401)
        # API reset
        r = pg.request.post(B + "/api/auth/reset-password", data={"password": "Abcdef1!"}, headers={"origin": "http://evil.com"}); check("API reset: Origin de outro site → 403", r.status == 403)
        r = pg.request.post(B + "/api/auth/reset-password", headers={"content-type": "application/json"}, data="{x"); check("API reset: JSON inválido → 400", r.status == 400)
        for bad in [{}, {"password": "fraca"}, {"password": 1}]: r = pg.request.post(B + "/api/auth/reset-password", data=bad); check(f"API reset: entrada inválida {json.dumps(bad)} → 400", r.status == 400)
        r = pg.request.post(B + "/api/auth/reset-password", data={"password": "Abcdef1!"}); check("API reset: sem cookie de recuperação → 401 invalid_link", r.status == 401 and r.json() == {"error": "invalid_link"})
        # login → esqueci minha senha
        pg.goto(B + "/login"); pg.get_by_role("link", name="Esqueci minha senha").click(); pg.wait_for_url("**/recuperar-senha"); check("login → 'Esqueci minha senha' abre a recuperação", pg.get_by_role("button", name="Enviar link").is_visible())
        # EN / claro / mobile
        ectx = b.new_context(viewport={"width": 1440, "height": 900}); ectx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); pe = ectx.new_page(); pe.goto(B + "/recuperar-senha"); pe.wait_for_selector("form")
        pe.get_by_role("button", name="Send link").click(); check("inglês e tema claro, validação em inglês", "Enter your email." in pe.inner_text("form") and pe.evaluate("document.documentElement.dataset.theme") == "light")
        pe.fill("#email", "en@teste.com"); pe.get_by_role("button", name="Send link").click(); pe.wait_for_selector("[data-testid=forgot-sent]", timeout=8000); check("confirmação genérica em inglês", "If an account exists" in pe.inner_text("[data-testid=forgot-sent]")); pe.screenshot(path="docs/screenshots/etapa09_desktop_light_en.png")
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/recuperar-senha"); mb.wait_for_selector("form")
        check("mobile: formulário utilizável e sem rolagem horizontal", mb.locator("#email").is_visible() and not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1")); mb.screenshot(path="docs/screenshots/etapa09_mobile.png")
        check_js(errs)
        b.close()
finally:
    for s in (s1, s2, s3, m, sb): stop(s)
finish()

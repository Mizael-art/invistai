"""E2E do Login (Etapa 07). Sobe um MOCK do Supabase Auth (tests/mock-supabase.mjs). Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"}
s1 = start(3701, {**BASE, "SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test"})
s2 = start(3702, BASE)                                              # sem Supabase configurado
B, B2 = "http://127.0.0.1:3701", "http://127.0.0.1:3702"
def mk(path, method="GET"): return urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:4020" + path, method=method)).read().decode()
def stats(): return json.loads(mk("/__stats"))
def reset(): mk("/__reset")
def sess_cookies(ctx): return [c for c in ctx.cookies() if re.match(r"^sb-.*-auth-token(\.\d+)?$", c["name"])]
def logout(pg):
    pg.get_by_test_id("user-menu").click(); pg.get_by_role("menuitem", name="Sair").click(); pg.wait_for_selector("header a.btn:has-text('Entrar')", timeout=10000)
_n = [0]
def fresh():
    _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email, pw="Senha@123"):
    if email == "ok@teste.com" and pw == "Senha@123": email = fresh()
    pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", pw); pg.get_by_role("button", name=re.compile("^Entrar")).click()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []; posts = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0])); pg.on("request", lambda r: posts.append(r.url) if "/api/auth/login" in r.url else None)
        # --- estrutura ---
        pg.goto(B + "/login"); pg.wait_for_selector("form")
        check("login: campos e-mail/senha rotulados e botão Entrar", pg.get_by_label("E-mail").is_visible() and pg.locator("#password").is_visible() and pg.get_by_role("button", name="Entrar").is_visible())
        check("login: links 'Esqueci minha senha' e 'Criar conta'", pg.get_by_role("link", name="Esqueci minha senha").get_attribute("href") == "/recuperar-senha" and pg.get_by_role("link", name="Criar conta").get_attribute("href") == "/cadastro")
        check("login: sem Google/Apple e sem sidebar", pg.get_by_text(re.compile("Google|Apple")).count() == 0 and pg.locator("aside").count() == 0)   
        check("login: alternância de idioma e tema presentes", pg.get_by_role("button", name="Alternar idioma").is_visible() and pg.get_by_role("button", name="Alternar tema").is_visible())
        # --- validação local ---
        pg.get_by_role("button", name="Entrar").click()
        check("validação: e-mail vazio -> mensagem e foco", "Informe seu e-mail." in pg.inner_text("form") and pg.evaluate("document.activeElement.id") == "email" and pg.locator("#email").get_attribute("aria-invalid") == "true")
        pg.fill("#email", "abc"); pg.get_by_role("button", name="Entrar").click(); check("validação: e-mail inválido", "Informe um e-mail válido." in pg.inner_text("form"))
        pg.fill("#email", "ok@teste.com"); pg.get_by_role("button", name="Entrar").click(); check("validação: senha vazia -> mensagem e foco", "Informe sua senha." in pg.inner_text("form") and pg.evaluate("document.activeElement.id") == "password")
        check("validação inválida não chama a API", posts == [])
        pg.fill("#password", "segredo"); t = pg.locator("#password"); btn = pg.get_by_role("button", name="Mostrar senha")
        check("mostrar/ocultar senha", t.get_attribute("type") == "password" and (btn.click() or True) and t.get_attribute("type") == "text" and pg.get_by_role("button", name="Ocultar senha").get_attribute("aria-pressed") == "true")
        # --- falhas de autenticação ---
        for email, pw, txt, name in [("ok@teste.com", "errada", "E-mail ou senha incorretos.", "senha incorreta"), ("naoexiste@teste.com", "Senha@123", "E-mail ou senha incorretos.", "e-mail inexistente (mesma mensagem)"), ("unconf@teste.com", "Senha@123", "Confirme seu e-mail antes de entrar.", "e-mail não confirmado"), ("rate@teste.com", "Senha@123", "Muitas tentativas.", "limite do provedor"), ("down@teste.com", "Senha@123", "Não foi possível entrar agora.", "provedor indisponível")]:
            login(pg, email, pw); pg.wait_for_selector("[role=alert].err", timeout=8000)
            check(f"falha: {name}", txt in pg.inner_text("form") and "/login" in pg.url and not sess_cookies(ctx))
        login(pg, "ok@teste.com", "errada"); pg.wait_for_selector("[role=alert].err"); check("senha incorreta limpa e foca o campo de senha", pg.input_value("#password") == "" and pg.evaluate("document.activeElement.id") == "password")
        # --- sucesso ---
        reset(); login(pg, "  OK@Teste.com  "); pg.wait_for_url(B + "/", timeout=10000); pg.wait_for_selector(".lrow", timeout=15000)
        check("sucesso: e-mail normalizado, redireciona ao Início e cria sessão", "Olá, Maria!" in pg.inner_text("main") and len(sess_cookies(ctx)) >= 1)
        check("sucesso: cabeçalho mostra iniciais e 'Sair' (sem 'Entrar')", pg.locator("header a.av").inner_text() == "MT" and pg.get_by_test_id("user-menu").is_visible() and pg.locator("header a.btn", has_text="Entrar").count() == 0)
        check("cookie de sessão HttpOnly e SameSite=Lax", all(c["httpOnly"] and c["sameSite"] == "Lax" for c in sess_cookies(ctx)), str(sess_cookies(ctx)[:1]))
        # já autenticado
        pg.goto(B + "/login"); pg.wait_for_url(B + "/"); pg.wait_for_selector(".lrow", timeout=15000); pg.wait_for_load_state("networkidle"); check("autenticado em /login → redireciona ao Início", True)
        pg.goto(B + "/login?next=/noticias"); pg.wait_for_url("**/noticias"); pg.wait_for_selector("article", timeout=15000); pg.wait_for_load_state("networkidle"); check("autenticado em /login?next=… → vai ao destino", True)
        # persistência
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr"); pg.get_by_role("link", name="Notícias").first.click(); pg.wait_for_url("**/noticias"); check("sessão persiste entre páginas", pg.get_by_test_id("user-menu").is_visible())
        # rotas privadas autenticado
        for path in ["/perfil", "/notificacoes", "/favoritos"]:
            r = pg.goto(B + path); check(f"rota privada {path} acessível com sessão", r.status == 200 and "/login" not in pg.url)
        # logout
        logout(pg); pg.wait_for_selector(".lrow", timeout=15000)
        check("logout: volta a visitante, cookies removidos, provedor notificado", pg.locator("header a.btn", has_text="Entrar").is_visible() and not sess_cookies(ctx) and stats()["logouts"] == 1)
        for path in ["/perfil", "/notificacoes", "/favoritos"]:
            pg.goto(B + path); pg.wait_for_url(re.compile("/login")); check(f"visitante em {path} → /login?next=", "next=" + path.replace("/", "%2F") in pg.url and "expired" not in pg.url)
        # next + redirecionamento seguro
        reset(); pg.goto(B + "/login?next=/mercado%3Fcat%3Dforex"); pg.fill("#email", fresh()); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^Entrar")).click()
        pg.wait_for_url("**/mercado?cat=forex", timeout=10000); check("login respeita ?next= interno (com query)", True); logout(pg)
        for evil in ["//evil.com", "https://evil.com", "/%5Cevil.com", "javascript:alert(1)"]:
            ctx.clear_cookies(); pg.goto(B + "/login?next=" + evil); pg.fill("#email", fresh()); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_url(re.compile(re.escape(B) + r"/?$"), timeout=10000)
            check(f"open redirect bloqueado: next={evil}", pg.url.startswith(B))
            logout(pg)
        # envio duplo
        reset(); ctx.clear_cookies(); pg.goto(B + "/login"); pg.fill("#email", "slow@teste.com"); pg.fill("#password", "Senha@123")
        pg.evaluate("(()=>{const f=document.querySelector('form');f.requestSubmit();f.requestSubmit();f.requestSubmit()})()"); pg.wait_for_url(B + "/", timeout=10000)
        check("envio repetido é bloqueado (1 chamada ao provedor)", stats()["passwordCalls"].get("slow@teste.com") == 1, str(stats()["passwordCalls"]))
        logout(pg)
        # expiração de sessão
        reset(); login(pg, "ok@teste.com"); pg.wait_for_url(B + "/"); mk("/__invalidate"); pg.goto(B + "/perfil"); pg.wait_for_url(re.compile("/login"))
        check("sessão expirada em rota privada → /login com aviso e cookies limpos", "expired=1" in pg.url and "Sua sessão expirou" in pg.inner_text("main, form, body") and not sess_cookies(ctx))
        # refresh de token
        reset(); mk("/__lifetime?s=92"); login(pg, "ok@teste.com"); pg.wait_for_url(B + "/"); c0 = [c["value"] for c in sess_cookies(ctx)]; time.sleep(3)
        pg.goto(B + "/perfil"); check("access token expirado é renovado (refresh) e a rota privada segue acessível", "/login" not in pg.url and stats()["refreshCalls"] == 1 and [c["value"] for c in sess_cookies(ctx)] != c0, str(stats()))
        mk("/__lifetime?s=3600")
        # API direta
        reset(); ctx.clear_cookies()
        r = pg.request.post(B + "/api/auth/login", data={"email": "ok@teste.com", "password": "Senha@123"}, headers={"origin": "http://evil.com"}); check("API: Origin de outro site -> 403", r.status == 403)
        r = pg.request.post(B + "/api/auth/login", headers={"content-type": "application/json"}, data="{x"); check("API: JSON inválido -> 400", r.status == 400)
        for bad in [{}, {"email": "x"}, {"email": "a@b.co"}, {"email": 1, "password": "x"}]:
            r = pg.request.post(B + "/api/auth/login", data=bad); check(f"API: entrada inválida {json.dumps(bad)} -> 400", r.status == 400)
        r = pg.request.post(B + "/api/auth/login", data={"email": "ok@teste.com", "password": "errada"}); body = r.text()
        check("API: erro não vaza e-mail/senha nem detalhes do provedor", r.status == 401 and "ok@teste" not in body and "errada" not in body and "Invalid" not in body, body)
        codes = [pg.request.post(B + "/api/auth/login", data={"email": "rl@teste.com", "password": "x"}).status for _ in range(10)]; check("API: limite de tentativas por e-mail/IP -> 429", 429 in codes, str(codes))
        # Supabase não configurado
        pn = ctx.new_page(); pn.goto(B2 + "/login"); pn.fill("#email", "ok@teste.com"); pn.fill("#password", "Senha@123"); pn.get_by_role("button", name=re.compile("^Entrar")).click(); pn.wait_for_selector("[role=alert].err")
        check("sem Supabase: login informa 'ainda não está configurado'", "ainda não está configurado" in pn.inner_text("form"))
        pn.goto(B2 + "/perfil"); pn.wait_for_url(re.compile("/login")); check("sem Supabase: rota privada redireciona ao login", True)
        pn.goto(B2 + "/"); pn.wait_for_selector(".lrow", timeout=15000); check("sem Supabase: Início segue funcionando como visitante", pn.locator("header a.btn", has_text="Entrar").is_visible())
        # EN / tema / mobile
        ectx = b.new_context(viewport={"width": 1440, "height": 900}); ectx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); pe = ectx.new_page(); pe.goto(B + "/login"); pe.wait_for_selector("form")
        check("inglês e tema claro", pe.get_by_label("Email").is_visible() and pe.get_by_role("button", name="Sign in").is_visible() and pe.evaluate("document.documentElement.dataset.theme") == "light")
        pe.get_by_role("button", name="Sign in").click(); check("validação em inglês", "Enter your email." in pe.inner_text("form")); pe.screenshot(path="docs/screenshots/etapa07_desktop_light_en.png")
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/login"); mb.wait_for_selector("form")
        check("mobile: formulário visível e sem rolagem horizontal", mb.locator("#email").is_visible() and not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1")); mb.screenshot(path="docs/screenshots/etapa07_mobile.png")
        check_js(errs)
        b.close()
finally:
    for s in (s1, s2, m, sb): stop(s)
finish()

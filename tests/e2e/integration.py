"""E2E de integração final (Etapa 15): jornada completa de um usuário, varredura de todas as páginas (desktop/mobile, PT/EN, escuro/claro),
404, cabeçalhos de segurança, CSRF nas APIs e queda de provedores sem derrubar o app. Mocks: tests/mock-server.mjs e tests/mock-supabase.mjs."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
SB = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "SUPPORT_EMAIL": "atendimento@tradeon-suporte.test", "REGISTER_RATE_IP_PER_HOUR": "1000", "SEARCH_RATE_PER_MIN": "1000"}
OK = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", **SB}
DOWN = {**OK, "COINGECKO_BASE_URL": "http://127.0.0.1:4010/down", "FOREX_BASE_URL": "http://127.0.0.1:4010/down/fx", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/down"}
s1 = start(3971, OK); s2 = start(3972, DOWN)
B, BD = "http://127.0.0.1:3971", "http://127.0.0.1:3972"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def stats(): return json.loads(mk("/__stats"))
def fwrites(n): 
    for _ in range(60):
        if len(stats()["favoriteWrites"]) >= n: return True
        time.sleep(0.2)
    return False
PUBLIC = ["/", "/mercado", "/mercado/bitcoin", "/noticias", "/aprender", "/vip", "/suporte"]
AUTH = ["/login", "/cadastro", "/recuperar-senha"]
PRIVATE = ["/perfil", "/favoritos", "/notificacoes"]
def settle(pg): pg.wait_for_selector("main h1, form", timeout=20000); pg.wait_for_load_state("networkidle")
def hscroll(pg): return pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        def newpage(ctx):
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0])); return pg
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = newpage(ctx)
        mk("/__reset")
        # ===== 1. visitante =====
        for path in PRIVATE:
            pg.goto(B + path); pg.wait_for_url(re.compile("/login"))
            check(f"visitante: {path} exige login (validado no servidor) e guarda o destino", "next=" + path.replace("/", "%2F") in pg.url)
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000)
        check("visitante: Início com dados, botão 'Entrar' e sino sem contador", pg.locator("header a.btn", has_text="Entrar").is_visible() and pg.locator("[data-testid=bell-count]").count() == 0)
        r = pg.request.post(B + "/api/favorites", data={"itemType": "asset", "itemId": "bitcoin"}); check("visitante: API de favoritos recusa sem sessão (401)", r.status == 401)
        # ===== 2. cadastro → confirmação → login =====
        email = "jornada@teste.com"
        pg.goto(B + "/cadastro"); pg.wait_for_selector("form"); pg.fill("#name", "Joana Jornada"); pg.fill("#email", email); pg.fill("#phone", "(11) 91234-5678"); pg.fill("#password", "Abcdef1!")
        pg.get_by_role("button", name=re.compile("^Criar conta")).click(); pg.wait_for_selector("text=Verifique seu e-mail", timeout=10000)
        check("cadastro: conta criada no provedor, aguardando confirmação", stats()["signups"][-1]["email"] == email)
        pg.goto(B + "/login?next=%2Ffavoritos"); pg.fill("#email", email); pg.fill("#password", "Abcdef1!"); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_selector("[role=alert].err")
        check("login antes de confirmar: bloqueado com explicação", "Confirme seu e-mail" in pg.inner_text("form"))
        mk("/__confirm?email=" + email); pg.get_by_role("button", name=re.compile("^Entrar")).click(); pg.wait_for_url(B + "/favoritos", timeout=15000); settle(pg)
        check("login após confirmar: volta ao destino pedido (/favoritos) e mostra estado vazio", pg.locator("[data-testid=fv-empty]").is_visible())
        check("sessão: iniciais no cabeçalho e 1 notificação real (boas-vindas)", pg.locator("header a.av").count() == 1 and pg.get_by_role("button", name="Sair").is_visible() and pg.locator("[data-testid=bell-count]").inner_text() == "1", pg.locator("header a.av").inner_text() + "|" + (pg.locator("[data-testid=bell-count]").inner_text() if pg.locator("[data-testid=bell-count]").count() else "-"))
        # ===== 3. mercado → detalhe → notícias → busca (favoritos pelo mesmo serviço) =====
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr", timeout=20000); pg.wait_for_load_state("networkidle")
        pg.locator("tbody tr", has_text="Bitcoin").get_by_role("button", name="Favoritar").click(); assert fwrites(1)
        pg.locator("tbody tr", has_text="Bitcoin").locator("a").first.click(); pg.wait_for_url("**/mercado/bitcoin"); pg.wait_for_selector("#dados", timeout=20000)
        check("mercado → detalhe: favorito aparece marcado no detalhe", pg.get_by_role("button", name=re.compile("Remover dos favoritos")).count() >= 1)
        pg.goto(B + "/noticias"); pg.wait_for_selector("article", timeout=20000); pg.wait_for_load_state("networkidle")
        title = pg.locator("article").first.locator("h2, h3").first.inner_text().strip()
        pg.locator("article").first.get_by_role("button", name="Favoritar").click(); assert fwrites(2)
        box = pg.locator("header").get_by_role("combobox"); box.fill("eth"); pg.wait_for_selector("[role=option]", timeout=10000)
        pg.locator("[role=option]", has_text="Ethereum").first.click(); pg.wait_for_url("**/mercado/ethereum", timeout=15000); pg.wait_for_selector("#dados", timeout=20000)
        pg.get_by_role("button", name="Favoritar").first.click(); assert fwrites(3)
        check("busca global → detalhe do ativo → favoritar", stats()["favoriteWrites"][-1]["id"] == "ethereum")
        pg.goto(B + "/favoritos"); pg.wait_for_selector("article", timeout=20000)
        check("favoritos: 2 ativos + 1 notícia salvos nas outras páginas", pg.locator("article").count() == 3 and pg.locator("article[data-kind=news]").count() == 1 and title[:20] in pg.locator("article[data-kind=news]").inner_text())
        # ===== 4. notificações → perfil (preferências) =====
        pg.get_by_test_id("bell").click(); pg.wait_for_url("**/notificacoes"); pg.wait_for_selector(".nt-item")
        pg.locator(".nt-item").first.get_by_role("button", name="Abrir").click(); pg.wait_for_url("**/perfil"); pg.wait_for_selector("#pf-name", timeout=15000)
        check("notificação abre o destino (perfil) e é marcada como lida", pg.locator("[data-testid=bell-count]").count() == 0 or pg.reload() or pg.locator("[data-testid=bell-count]").count() == 0)
        pg.get_by_role("button", name="English (US)").click(); pg.wait_for_function("document.documentElement.lang==='en'", timeout=10000)
        pg.get_by_role("button", name="Claro").click() if pg.get_by_role("button", name="Claro").count() else pg.get_by_role("button", name="Light").click()
        pg.wait_for_function("document.documentElement.dataset.theme==='light'", timeout=10000)
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr", timeout=20000)
        check("preferências do perfil valem no app todo (inglês + claro no Mercado)", pg.inner_text("h1") == "Market" and pg.evaluate("document.documentElement.dataset.theme") == "light")
        pg.get_by_test_id("nav-support").click(); pg.wait_for_url("**/suporte"); check("menu → Suporte (em inglês)", pg.inner_text("h1") == "Support")
        # ===== 5. logout → novo login em outro dispositivo =====
        pg.get_by_role("button", name="Sign out").click(); pg.wait_for_selector("header a.btn", timeout=10000)
        pg.goto(B + "/favoritos"); pg.wait_for_url(re.compile("/login")); check("logout encerra a sessão: área privada volta a exigir login", "/login" in pg.url)
        c2 = b.new_context(viewport={"width": 1440, "height": 900}); p2 = newpage(c2)
        p2.goto(B + "/login"); p2.fill("#email", email); p2.fill("#password", "Abcdef1!"); p2.get_by_role("button", name=re.compile("^Entrar")).click(); p2.wait_for_url(B + "/", timeout=15000); p2.wait_for_selector(".lrow", timeout=20000)
        check("outro dispositivo: idioma e tema da conta aplicados no login", p2.evaluate("document.documentElement.lang") == "en" and p2.evaluate("document.documentElement.dataset.theme") == "light")
        p2.goto(B + "/favoritos"); p2.wait_for_selector("article", timeout=20000); check("outro dispositivo: favoritos sincronizados", p2.locator("article").count() == 3)
        # ===== 6. varredura de páginas =====
        def sweep(page, base, label, paths, mobile=False):
            bad = []
            for path in paths:
                r = page.goto(base + path)
                try: settle(page)
                except Exception: bad.append(f"{path}:sem-h1"); continue
                if r.status != 200: bad.append(f"{path}:{r.status}")
                if hscroll(page): bad.append(f"{path}:hscroll")
                if not page.title().endswith("TRADEON"): bad.append(f"{path}:title")
                if mobile and path not in AUTH and not page.locator("#bn").is_visible(): bad.append(f"{path}:bottomnav")
                if not mobile and path not in AUTH and not page.locator("aside").is_visible(): bad.append(f"{path}:sidebar")
            check(f"varredura {label}: {len(paths)} páginas abrem (200), título, navegação, sem rolagem horizontal", not bad, ", ".join(bad))
        sweep(p2, B, "desktop EN/claro (logado)", PUBLIC + PRIVATE)
        c3 = b.new_context(viewport={"width": 1440, "height": 900}); p3 = newpage(c3); sweep(p3, B, "desktop PT/escuro (visitante)", PUBLIC + AUTH)
        c4 = b.new_context(viewport={"width": 390, "height": 844}); p4 = newpage(c4)
        p4.goto(B + "/login"); p4.fill("#email", email); p4.fill("#password", "Abcdef1!"); p4.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); p4.wait_for_url(B + "/", timeout=15000)
        sweep(p4, B, "mobile 390px (logado)", PUBLIC + PRIVATE, mobile=True)
        c5 = b.new_context(viewport={"width": 390, "height": 844}); p5 = newpage(c5); sweep(p5, B, "mobile 390px (visitante, telas de acesso)", AUTH + ["/suporte"], mobile=True)
        # ===== 7. 404, cabeçalhos e CSRF =====
        r = p3.goto(B + "/pagina-que-nao-existe"); settle(p3)
        check("404: status 404, layout do app, mensagem traduzida e caminhos de volta", r.status == 404 and p3.get_by_test_id("not-found").is_visible() and p3.inner_text("h1") == "Página não encontrada" and p3.locator("aside").is_visible() and p3.get_by_role("link", name="Voltar ao Início").count() == 1)
        p3.goto(B + "/mercado/moeda-inexistente-xyz"); p3.wait_for_selector("main h1", timeout=20000)
        check("ativo inexistente: página 'não encontrado' do Mercado (noindex)", p3.get_by_role("link", name=re.compile("Mercado|mercado")).count() >= 1 and p3.locator("meta[name=robots][content*=noindex]").count() >= 1, p3.inner_text("main h1"))
        h = p3.request.get(B + "/").headers
        check("cabeçalhos de segurança (nosniff, frame DENY/frame-ancestors, referrer, permissions; sem x-powered-by)", h.get("x-content-type-options") == "nosniff" and h.get("x-frame-options") == "DENY" and "frame-ancestors 'none'" in h.get("content-security-policy", "") and h.get("referrer-policy") == "strict-origin-when-cross-origin" and "camera=()" in h.get("permissions-policy", "") and "x-powered-by" not in h)
        ev = {"origin": "http://evil.example"}
        st = [p2.request.post(B + "/api/favorites", data={"itemType": "asset", "itemId": "x"}, headers=ev).status, p2.request.put(B + "/api/preferences", data={"newsCategories": ["crypto"]}, headers=ev).status,
              p2.request.post(B + "/api/refresh", headers=ev).status, p2.request.post(B + "/api/notifications/read", data={"all": True}, headers=ev).status, p2.request.put(B + "/api/profile", data={"name": "X"}, headers=ev).status]
        check("CSRF: todas as APIs que alteram estado recusam outra origem (403)", st == [403] * 5, str(st))
        check("segredos: HTML não expõe chaves (anon key, NewsAPI) nem service_role", all(s not in p3.content() for s in ["anon-test", "service_role", "NEWS_API_KEY", "X-Api-Key"]))
        # ===== 8. provedores fora do ar =====
        c6 = b.new_context(viewport={"width": 1440, "height": 900}); p6 = newpage(c6)
        bad = []
        for path in ["/", "/mercado", "/mercado/bitcoin", "/noticias", "/favoritos", "/suporte"]:
            t0 = time.time(); r = p6.goto(BD + path)
            try: p6.wait_for_selector("main h1, form", timeout=30000)
            except Exception: bad.append(f"{path}:sem-h1 {time.time()-t0:.0f}s"); continue
            if path == "/favoritos": 
                if "/login" not in p6.url: bad.append(path)
                continue
            if r.status >= 500 or not p6.locator("aside").is_visible() or p6.get_by_test_id("page-error").count(): bad.append(path)
        check("provedores fora do ar: nenhuma página cai; menu e cabeçalho continuam", not bad, ", ".join(bad))
        p6.goto(BD + "/"); p6.wait_for_selector(".note[role=status]", timeout=30000)
        check("provedores fora do ar: aviso de falha com 'Tentar novamente', sem preço inventado", p6.get_by_role("button", name="Tentar novamente").count() >= 1 and not re.search(r"US\$\s?[0-9]", p6.inner_text("main").replace("\xa0", " ")))
        check_js(errs)
        b.close()
finally:
    for s in (s1, s2, m, sb): stop(s)
finish()

"""E2E de Notificações (Etapa 13). Mock do Supabase (Auth + REST com RLS simulada). Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
ENV = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", "REGISTER_RATE_IP_PER_HOUR": "1000"}
s1 = start(3951, ENV); B = "http://127.0.0.1:3951"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def notify(email, **kw): mk("/__notify?" + urllib.parse.urlencode({"email": email, **kw}))
def notifs(): return json.loads(mk("/__notifs"))
_n = [1200]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email):
    pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(B + "/", timeout=15000); pg.wait_for_selector(".lrow", timeout=20000)
def page(pg, qs=""): pg.goto(B + "/notificacoes" + qs); pg.wait_for_selector("h1"); pg.wait_for_selector(".nt-item, [data-testid=nt-empty], [data-testid=nt-empty-filter], [role=alert]", timeout=20000); pg.wait_for_load_state("networkidle")   # espera a hidratação antes de clicar
def bell(pg): c = pg.locator("[data-testid=bell-count]"); return c.inner_text() if c.count() else ""
def post(pg, body): return pg.evaluate("(b)=>fetch('/api/notifications/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)", body)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        mk("/__reset")
        pg.goto(B + "/notificacoes"); pg.wait_for_url(re.compile("/login")); check("visitante em /notificacoes → /login?next=", "next=%2Fnotificacoes" in pg.url)
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000); check("visitante: sino sem contador", bell(pg) == "")
        uA = fresh(); login(pg, uA); page(pg)
        check("conta sem notificações: estado vazio objetivo (nenhuma notificação fictícia)", pg.locator("[data-testid=nt-empty]").is_visible() and "Nenhuma notificação." in pg.inner_text("main") and pg.locator(".nt-item").count() == 0 and bell(pg) == "")
        check("aviso de que nada é enviado por e-mail/push", "Nenhuma notificação é enviada por e-mail ou push" in pg.inner_text("main"))
        # semeia eventos do sistema
        notify(uA, kind="welcome"); notify(uA, kind="email_confirmed"); notify(uA, kind="password_changed", category="account", target="/perfil")
        notify(uA, kind="custom_market", category="market", title="Aviso de mercado", message="Texto do sistema", target="/mercado")
        notify(uA, kind="custom_news", category="news", title="Aviso de notícias", message="Sem destino", target="")
        page(pg)
        check("lista: 5 notificações, mais recentes primeiro", pg.locator(".nt-item").count() == 5 and "Aviso de notícias" in pg.locator(".nt-item").first.inner_text())
        it = pg.locator(".nt-item", has_text="Senha alterada")
        check("item: título, mensagem traduzida, categoria e data", "A senha da sua conta foi alterada" in it.inner_text() and "Conta" in it.inner_text() and "Recebida" in it.inner_text())
        check("contador do sino reflete não lidas (5) e rótulo acessível", bell(pg) == "5" and "5 não lidas" in pg.get_by_test_id("bell").get_attribute("aria-label"))
        check("não lidas marcadas visualmente e por texto acessível", pg.locator(".nt-item[data-unread=true]").count() == 5)
        # marcar uma
        it.get_by_role("button", name=re.compile("Marcar como lida")).click(); pg.wait_for_selector(".nt-item[data-unread=false]", timeout=8000)
        pg.wait_for_function("document.querySelector('[data-testid=bell-count]')?.innerText==='4'", timeout=20000)
        check("marcar como lida: persiste no banco e o sino cai para 4", len([n for n in notifs() if n["read_at"]]) == 1 and bell(pg) == "4")
        pg.wait_for_timeout(1500); check("contador da central não desconta duas vezes após atualizar (4 não lidas)", pg.get_by_test_id("unread-total").inner_text() == "4 não lidas", pg.get_by_test_id("unread-total").inner_text())
        pg.reload(); pg.wait_for_selector(".nt-item"); pg.wait_for_load_state("networkidle"); check("estado de leitura persiste após recarregar", pg.locator(".nt-item[data-unread=false]").count() == 1)
        # filtros
        pg.locator("nav[aria-label=Notificações]").get_by_role("link", name="Mercado").click(); pg.wait_for_function("location.search.includes('cat=market')"); pg.wait_for_function("document.querySelectorAll('.nt-item').length===1")
        check("filtro por categoria (Mercado)", "Aviso de mercado" in pg.inner_text(".nt-item"))
        pg.goto(B + "/notificacoes?state=unread"); pg.wait_for_selector(".nt-item"); check("filtro 'Não lidas'", pg.locator(".nt-item").count() == 4 and pg.locator(".nt-item[data-unread=false]").count() == 0)
        pg.goto(B + "/notificacoes?cat=market&state=unread"); pg.wait_for_selector(".nt-item"); check("filtros combinados", pg.locator(".nt-item").count() == 1)
        pg.goto(B + "/notificacoes?cat=xx&state=zz&page=-3"); pg.wait_for_selector(".nt-item"); check("parâmetros inválidos caem no padrão", pg.locator(".nt-item").count() == 5)
        # abrir com destino → marca lida e navega
        page(pg); pg.locator(".nt-item", has_text="Aviso de mercado").get_by_role("button", name="Abrir").click(); pg.wait_for_url("**/mercado"); pg.wait_for_selector("tbody tr", timeout=20000)
        ok_db = [n for n in notifs() if n["kind"] == "custom_market"][0]["read_at"] is not None
        pg.reload(); pg.wait_for_selector("tbody tr", timeout=20000)
        check("abrir: navega ao destino e marca como lida", ok_db and bell(pg) == "3", f"db={ok_db} bell={bell(pg)}")
        page(pg); check("notificação sem destino não tem botão 'Abrir'", pg.locator(".nt-item", has_text="Aviso de notícias").get_by_role("button", name="Abrir").count() == 0)
        # marcar todas
        pg.get_by_role("button", name="Marcar todas como lidas").click(); pg.wait_for_selector("text=Marcadas como lidas.", timeout=8000)
        pg.wait_for_function("!document.querySelector('[data-testid=bell-count]')", timeout=20000)
        check("marcar todas: todas lidas no banco, sino sem contador, botão desabilitado", all(n["read_at"] for n in notifs() if n["read_at"] is not None) and len([n for n in notifs() if n["read_at"] is None]) == 0 and pg.get_by_role("button", name="Marcar todas como lidas").is_disabled())
        pg.goto(B + "/notificacoes?state=unread"); pg.wait_for_selector("[data-testid=nt-empty-filter]"); check("'Não lidas' vazio: mensagem e 'Limpar filtros'", pg.get_by_role("link", name="Limpar filtros").get_attribute("href") == "/notificacoes")
        # isolamento entre contas
        c2 = b.new_context(viewport={"width": 1440, "height": 900}); p2 = c2.new_page(); uB = fresh(); login(p2, uB); notify(uB, kind="welcome"); page(p2)
        check("outra conta só vê as próprias notificações", p2.locator(".nt-item").count() == 1 and bell(p2) == "1")
        idA = notifs()[0]["id"]; before = [n["read_at"] for n in notifs() if n["user_id"] != notifs()[-1]["user_id"]]
        notify(uA, kind="welcome"); uidA = [n for n in notifs() if n["kind"] == "custom_market"][0]["user_id"]; idA2 = [n for n in notifs() if n["read_at"] is None and n["user_id"] == uidA][0]["id"]
        st = post(p2, {"ids": [idA2]}); check("outra conta não marca notificação alheia como lida (RLS + user_id da sessão)", st == 200 and [n for n in notifs() if n["id"] == idA2][0]["read_at"] is None)
        # API
        check("API: sem sessão → 401", pg.request.post(B + "/api/notifications/read", data={"all": True}).status == 401)
        check("API: Origin de outro site → 403", pg.request.post(B + "/api/notifications/read", data={"all": True}, headers={"origin": "http://evil.com"}).status == 403)
        check("API: entradas inválidas → 400", all(post(pg, x) == 400 for x in [{}, {"ids": []}, {"ids": ["x"]}, {"all": False}, {"all": True, "category": "signals"}, {"all": True, "user_id": idA}]))
        check("API: repetir 'marcar como lida' é idempotente", post(pg, {"ids": [idA]}) == 200 and post(pg, {"ids": [idA]}) == 200)
        # contador 9+ e paginação
        c3 = b.new_context(viewport={"width": 1440, "height": 900}); p3 = c3.new_page(); uC = fresh(); login(p3, uC); notify(uC, n="25"); page(p3)
        check("sino mostra 9+ acima de 9", bell(p3) == "9+")
        check("paginação: 20 por página", p3.locator(".nt-item").count() == 20 and p3.get_by_role("link", name=re.compile("Próxima")).is_visible())
        ids1 = p3.locator(".nt-item").evaluate_all("e=>e.map(x=>x.dataset.id)"); nxt = p3.get_by_role("link", name=re.compile("Próxima")).get_attribute("href"); p3.goto(B + nxt); p3.wait_for_selector(".nt-item"); p3.wait_for_load_state("networkidle"); p3.wait_for_function("document.querySelectorAll('.nt-item').length===5", timeout=20000)
        ids2 = p3.locator(".nt-item").evaluate_all("e=>e.map(x=>x.dataset.id)"); check("paginação: página 2 com 5, sem repetir", not set(ids1) & set(ids2))
        p3.get_by_role("button", name="Marcar todas como lidas").click(); p3.wait_for_function("!document.querySelector('[data-testid=bell-count]')", timeout=20000); uidC = [n["user_id"] for n in notifs() if n["read_at"] is not None][-1]; check("marcar todas abrange todas as páginas (não só a visível)", len([n for n in notifs() if n["user_id"] == uidC]) >= 25 and not [n for n in notifs() if n["user_id"] == uidC and n["read_at"] is None])
        # cadastro real gera boas-vindas
        c4 = b.new_context(viewport={"width": 1440, "height": 900}); p4 = c4.new_page(); e = f"novo{_n[0]}x@teste.com"
        p4.goto(B + "/cadastro"); p4.wait_for_selector("form"); p4.wait_for_load_state("networkidle"); p4.fill("#name", "Novo Usuario"); p4.fill("#email", e); p4.fill("#phone", "(11) 91234-5678"); p4.fill("#password", "Abcdef1!"); p4.get_by_role("button", name=re.compile("^Criar conta")).click(); p4.wait_for_selector("text=Verifique seu e-mail", timeout=20000)
        check("cadastro gera a notificação de boas-vindas (evento real do sistema)", any(n["kind"] == "welcome" for n in notifs() if n.get("user_id") and n["user_id"] not in ("",)) )
        # links
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000); pg.get_by_test_id("bell").click(); pg.wait_for_url("**/notificacoes"); check("sino abre a central", True)
        pg.get_by_role("link", name="Configurar alertas").click(); pg.wait_for_url("**/perfil"); pg.wait_for_selector("[data-testid=prefs-notifications]", timeout=15000); check("'Configurar alertas' abre as preferências no perfil", pg.locator("[data-testid=prefs-notifications]").count() == 1)
        # EN / claro / mobile
        ectx = b.new_context(viewport={"width": 1440, "height": 900}); pe = ectx.new_page(); login(pe, uA); ectx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); page(pe)
        check("inglês e tema claro (títulos traduzidos)", pe.inner_text("h1") == "Notifications" and "Password changed" in pe.inner_text("main") and pe.evaluate("document.documentElement.dataset.theme") == "light"); pe.screenshot(path="docs/screenshots/etapa13_desktop_light_en.png")
        mctx = b.new_context(viewport={"width": 390, "height": 844}); mb = mctx.new_page(); login(mb, uC); notify(uC, kind="password_changed"); page(mb)
        check("mobile: sem rolagem horizontal; sino com contador visível", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1") and mb.get_by_test_id("bell").is_visible() and bell(mb) == "1"); mb.screenshot(path="docs/screenshots/etapa13_mobile.png")
        check_js(errs)
        b.close()
finally:
    for s in (s1, m, sb): stop(s)
finish()

"""E2E de Perfil e configurações (Etapa 10). Mock do Supabase Auth/REST (tests/mock-supabase.mjs). Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
BASE = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"}
SB = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test"}
s1 = start(3911, {**BASE, **SB}); s2 = start(3912, {**BASE, **SB, "SUPPORT_EMAIL": "suporte@exemplo.test"})
B, B2 = "http://127.0.0.1:3911", "http://127.0.0.1:3912"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def stats(): return json.loads(mk("/__stats"))
_n = [800]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email, base=B, pw="Senha@123"):
    pg.goto(base + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", pw); pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(base + "/", timeout=15000); pg.wait_for_selector(".lrow", timeout=20000)
def perfil(pg, base=B): pg.goto(base + "/perfil"); pg.wait_for_selector("#pf-name", timeout=15000)
def reload_wait(pg): pg.wait_for_load_state("load"); pg.wait_for_selector("#pf-name", timeout=15000)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        mk("/__reset")
        # --- proteção ---
        pg.goto(B + "/perfil"); pg.wait_for_url(re.compile("/login")); check("visitante em /perfil → /login?next=%2Fperfil", "next=%2Fperfil" in pg.url)
        u1 = fresh(); login(pg, u1); perfil(pg)
        t = pg.inner_text("main")
        check("cabeçalho do perfil: nome, e-mail e e-mail confirmado", "Maria Teste" in t and u1 in t and "E-mail confirmado" in t)
        check("dados pessoais: nome preenchido, telefone vazio, e-mail somente leitura com aviso", pg.input_value("#pf-name") == "Maria Teste" and pg.input_value("#pf-phone") == "" and pg.locator("#pf-email").is_disabled() and "não pode ser alterado" in t)
        check("salvar/cancelar desabilitados sem alterações", pg.get_by_role("button", name="Salvar alterações").is_disabled() and pg.get_by_role("button", name="Cancelar").first.is_disabled())
        # --- editar / cancelar / validar ---
        pg.fill("#pf-name", "Outro Nome"); pg.fill("#pf-phone", "(11) 91234-5678")
        check("alterar habilita salvar e cancelar", pg.get_by_role("button", name="Salvar alterações").is_enabled() and pg.get_by_role("button", name="Cancelar").first.is_enabled())
        w0 = len(stats()["profileWrites"]); pg.get_by_role("button", name="Cancelar").first.click()
        check("cancelar descarta as alterações (sem chamar a API)", pg.input_value("#pf-name") == "Maria Teste" and pg.input_value("#pf-phone") == "" and len(stats()["profileWrites"]) == w0 and pg.get_by_role("button", name="Salvar alterações").is_disabled())
        pg.fill("#pf-name", ""); pg.fill("#pf-phone", "(11) 91234-5678"); pg.get_by_role("button", name="Salvar alterações").click(); check("validação: nome vazio → mensagem e foco", "Informe seu nome." in pg.inner_text("form[aria-label='Dados pessoais']") and pg.evaluate("document.activeElement.id") == "pf-name")
        pg.fill("#pf-name", "Ana Souza"); pg.fill("#pf-phone", "123"); pg.get_by_role("button", name="Salvar alterações").click(); check("validação: telefone inválido → mensagem e foco", "telefone válido" in pg.inner_text("form[aria-label='Dados pessoais']") and pg.evaluate("document.activeElement.id") == "pf-phone")
        check("validação inválida não grava", len(stats()["profileWrites"]) == w0)
        # --- salvar (com envio triplo) ---
        pg.fill("#pf-name", "  Ana   Souza "); pg.fill("#pf-phone", "(21) 98765-4321")
        pg.evaluate("(()=>{const f=document.querySelector(\"form[aria-label='Dados pessoais']\");f.requestSubmit();f.requestSubmit();f.requestSubmit()})()"); pg.wait_for_selector("[data-testid=pf-msg]:has-text('Alterações salvas.')", timeout=8000)
        w = stats()["profileWrites"]
        check("salvar: grava nome normalizado e telefone E.164 (uma única escrita apesar de 3 envios)", len(w) == w0 + 1 and w[-1]["name"] == "Ana Souza" and w[-1]["phone"] == "+5521987654321", str(w[-1]))
        check("campos refletem o valor normalizado e voltam a 'sem alterações'", pg.input_value("#pf-name") == "Ana Souza" and pg.input_value("#pf-phone") == "+5521987654321" and pg.get_by_role("button", name="Salvar alterações").is_disabled())
        pg.reload(); reload_wait(pg); check("dados persistem após recarregar", pg.input_value("#pf-name") == "Ana Souza" and pg.input_value("#pf-phone") == "+5521987654321" and "Ana Souza" in pg.inner_text("[data-testid=pf-name-title]"))
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000); check("Início usa o nome salvo na saudação", "Olá, Ana!" in pg.inner_text("main"))
        # --- API de perfil ---
        js = lambda body, extra="": pg.evaluate("(b)=>fetch('/api/profile',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)", body)
        perfil(pg)
        check("API: e-mail no corpo é rejeitado (campo protegido) → 400", js({"name": "Ana", "phone": "(11) 91234-5678", "email": "novo@teste.com"}) == 400)
        check("API: id/lang/role no corpo → 400", all(js({"name": "Ana", "phone": "(11) 91234-5678", k: v}) == 400 for k, v in [("id", "x"), ("lang", "en"), ("role", "admin")]))
        check("API: nome/telefone inválidos → 400", js({"name": "A", "phone": "(11) 91234-5678"}) == 400 and js({"name": "Ana", "phone": "1"}) == 400)
        r = pg.request.put(B + "/api/profile", data={"name": "Ana", "phone": "(11) 91234-5678"}); check("API: sem sessão → 401", r.status == 401)
        r = pg.request.put(B + "/api/profile", data={"name": "Ana", "phone": "(11) 91234-5678"}, headers={"origin": "http://evil.com"}); check("API: Origin de outro site → 403", r.status == 403)
        r = pg.request.put(B + "/api/profile", headers={"content-type": "application/json"}, data="{x"); check("API: JSON inválido → 400", r.status == 400)
        codes = pg.evaluate("Promise.all(Array.from({length:24},()=>fetch('/api/profile',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Ana Souza',phone:'(21) 98765-4321'})}).then(r=>r.status)))"); check("API: limite de requisições → 429", 429 in codes, str(sorted(set(codes))))
        # --- preferências do app ---
        perfil(pg); pg.get_by_role("button", name="Claro").click(); pg.wait_for_function("document.documentElement.dataset.theme==='light'", timeout=10000); reload_wait(pg)
        check("tema Claro: aplicado, salvo na conta e marcado", stats()["profileWrites"][-1].get("theme") == "light" and pg.get_by_role("button", name="Claro").get_attribute("aria-pressed") == "true")
        pg.get_by_role("button", name="English (US)").click(); pg.wait_for_function("document.documentElement.lang==='en'", timeout=10000); reload_wait(pg)
        check("idioma English: interface em inglês, salvo na conta", stats()["profileWrites"][-1].get("lang") == "en" and "My profile" in pg.inner_text("h1") and pg.get_by_role("button", name="English (US)").get_attribute("aria-pressed") == "true")
        # --- outro dispositivo: preferências da conta valem no login ---
        c2 = b.new_context(viewport={"width": 1440, "height": 900}); p2 = c2.new_page(); login(p2, u1)
        check("outro dispositivo: login aplica tema claro e inglês da conta", p2.evaluate("document.documentElement.dataset.theme") == "light" and p2.evaluate("document.documentElement.lang") == "en" and "Hello, Ana!" in p2.inner_text("main"))
        c3 = b.new_context(viewport={"width": 1440, "height": 900}); c3.add_cookies([{"name": "iv_theme", "value": "light", "url": B}]); p3 = c3.new_page(); login(p3, fresh())
        check("usuário sem preferência salva: o login NÃO sobrescreve a escolha local", p3.evaluate("document.documentElement.dataset.theme") == "light")
        # alternar pelo cabeçalho também salva na conta
        n0 = len(stats()["profileWrites"]); p2.get_by_test_id("user-menu").click(); p2.get_by_role("menuitem", name="Toggle theme").click(); p2.wait_for_function("document.documentElement.dataset.theme==='dark'", timeout=10000)
        for _ in range(50):
            if len(stats()["profileWrites"]) > n0: break
            time.sleep(0.1)
        check("cabeçalho (logado): alternar tema também salva na conta", len(stats()["profileWrites"]) > n0 and stats()["profileWrites"][-1].get("theme") == "dark")
        p2.wait_for_load_state("load")
        perfil(pg); pg.get_by_role("button", name="Escuro").click() if pg.get_by_role("button", name="Escuro").count() else pg.get_by_role("button", name="Dark").click()
        pg.wait_for_function("document.documentElement.dataset.theme==='dark'", timeout=10000); reload_wait(pg); pg.get_by_role("button", name="Português (BR)").click(); pg.wait_for_function("document.documentElement.lang==='pt-BR'", timeout=10000); reload_wait(pg)
        check("voltar a Escuro e Português funciona", pg.evaluate("document.documentElement.dataset.theme") == "dark" and "Meu perfil" in pg.inner_text("h1"))
        r = pg.request.put(B + "/api/preferences/app", data={"theme": "auto"}); check("API tema/idioma: sem sessão → 401 (e 'auto' nunca é aceito)", r.status in (400, 401))
        st = pg.evaluate("(b)=>fetch('/api/preferences/app',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)", {"theme": "auto"}); check("API tema: valor 'auto' → 400", st == 400)
        # --- categorias de notícias ---
        perfil(pg); nf = pg.locator("[data-testid=prefs-news]")
        check("notícias: nenhuma marcada e 'Salvar categorias' desabilitado", nf.locator("input:checked").count() == 0 and nf.get_by_role("button", name="Salvar categorias").is_disabled())
        nf.get_by_label("Criptomoedas").check(); nf.get_by_label("Forex e moedas").check(); nf.get_by_role("button", name="Salvar categorias").click(); nf.locator("text=Categorias salvas.").wait_for(timeout=8000)
        check("notícias: categorias salvas na conta", sorted(stats()["prefWrites"][-1]["news_categories"]) == ["crypto", "forex"], str(stats()["prefWrites"][-1]))
        pg.reload(); reload_wait(pg); nf = pg.locator("[data-testid=prefs-news]"); check("notícias: persistem após recarregar", nf.get_by_label("Criptomoedas").is_checked() and nf.get_by_label("Forex e moedas").is_checked() and not nf.get_by_label("Bolsa e ações").is_checked())
        pg.goto(B + "/noticias"); pg.wait_for_selector("article", timeout=20000); check("integração: feed 'Para você' aparece nas Notícias", pg.locator("nav[aria-label=Categorias] a", has_text="Para você").count() == 1)
        perfil(pg); nf = pg.locator("[data-testid=prefs-news]"); nf.get_by_label("Criptomoedas").uncheck(); nf.get_by_label("Forex e moedas").uncheck(); nf.get_by_role("button", name="Salvar categorias").click(); nf.locator("text=Categorias salvas.").wait_for(timeout=8000)
        check("notícias: remover todas as categorias é salvo", stats()["prefWrites"][-1]["news_categories"] == [])
        # --- categorias de notificações ---
        nt = pg.locator("[data-testid=prefs-notifications]")
        check("notificações: só categorias existentes e aviso de que o envio não está ativo", [x.inner_text().strip() for x in nt.locator("label").all()] == ["Mercado", "Notícias", "Conta"] and "envio de notificações ainda não está ativo" in nt.inner_text())
        nt.get_by_label("Mercado").check(); nt.get_by_label("Conta").check(); nt.get_by_role("button", name="Salvar categorias").click(); nt.locator("text=Categorias salvas.").wait_for(timeout=8000)
        check("notificações: salvas na conta (sem tocar nas de notícias)", sorted(stats()["prefWrites"][-1]["notification_categories"]) == ["account", "market"] and "news_categories" not in stats()["prefWrites"][-1], str(stats()["prefWrites"][-1]))
        pg.reload(); reload_wait(pg); nt = pg.locator("[data-testid=prefs-notifications]"); check("notificações: persistem após recarregar", nt.get_by_label("Mercado").is_checked() and nt.get_by_label("Conta").is_checked() and not nt.get_by_label("Notícias").is_checked())
        st = lambda body: pg.evaluate("(b)=>fetch('/api/preferences',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)", body)
        check("API: categorias inexistentes (sinais/VIP), vazio e extras → 400", all(st(x) == 400 for x in [{"notificationCategories": ["signals"]}, {"notificationCategories": ["vip"]}, {}, {"newsCategories": ["bonds"]}, {"newsCategories": ["crypto"], "x": 1}]))
        r = pg.request.put(B + "/api/preferences", data={"newsCategories": ["crypto"]}); check("API preferências: sem sessão → 401", r.status == 401)
        # --- sessões ---
        perfil(pg); check("sessões: não há lista fictícia; nota sobre validade do acesso já emitido", "até 1 hora" in pg.inner_text("main") and pg.locator("[data-testid=sessions-list]").count() == 0)
        pg.get_by_role("button", name="Encerrar outras sessões").click(); check("sessões: pede confirmação antes de encerrar", pg.get_by_role("button", name="Confirmar: encerrar outras sessões").is_visible())
        pg.get_by_role("button", name="Cancelar").last.click(); check("sessões: cancelar não chama o provedor", "others" not in stats()["logoutScopes"])
        pg.get_by_role("button", name="Encerrar outras sessões").click(); pg.get_by_role("button", name="Confirmar: encerrar outras sessões").click(); pg.wait_for_selector("[data-testid=sessions-msg]:has-text('Outras sessões encerradas.')", timeout=8000)
        check("sessões: chama o provedor com escopo 'others' (recurso real) e mantém a sessão atual", stats()["logoutScopes"].count("others") == 1 and pg.get_by_test_id("user-menu").is_visible())
        pg.reload(); reload_wait(pg); check("sessão atual continua válida após encerrar as outras", "/login" not in pg.url)
        p2.goto(B + "/perfil"); p2.wait_for_url(re.compile("/login"), timeout=15000); check("a outra sessão foi realmente encerrada (acesso negado)", "expired=1" in p2.url)
        r = pg.request.post(B + "/api/auth/sessions/others"); check("API sessões: sem sessão → 401", r.status == 401)
        # --- exclusão ---
        dc = pg.locator("[data-testid=delete-card]"); check("exclusão: sem e-mail de suporte configurado o botão fica indisponível, com explicação", dc.get_by_role("button").is_disabled() and "ainda não foi configurado" in dc.inner_text() and dc.locator("a").count() == 0)
        check("exclusão: não há exclusão imediata (apenas solicitação ao suporte)", "Nenhum dado é apagado imediatamente" in dc.inner_text() and pg.get_by_role("button", name=re.compile("Excluir|Apagar", re.I)).count() == 0)
        p4 = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); login(p4, fresh(), B2); perfil(p4, B2); a = p4.locator("[data-testid=delete-card] a")
        check("exclusão: com SUPPORT_EMAIL configurado vira link mailto real", a.count() == 1 and a.get_attribute("href").startswith("mailto:suporte@exemplo.test?subject="))
        # --- e-mail não confirmado ---
        p5 = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); login(p5, "soft@teste.com"); perfil(p5)
        check("e-mail não confirmado: estado identificado e reenvio disponível", "E-mail não confirmado" in p5.inner_text("main") and p5.get_by_role("button", name="Reenviar e-mail de confirmação").count() >= 1)
        # --- EN/claro/mobile ---
        ectx = b.new_context(viewport={"width": 1440, "height": 900}); pe = ectx.new_page(); login(pe, fresh()); ectx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); perfil(pe)
        check("inglês e tema claro no perfil", "My profile" in pe.inner_text("h1") and "Personal data" in pe.inner_text("main") and pe.evaluate("document.documentElement.dataset.theme") == "light"); pe.screenshot(path="docs/screenshots/etapa10_desktop_light_en.png", full_page=True)
        mctx = b.new_context(viewport={"width": 390, "height": 844}); mb = mctx.new_page(); login(mb, fresh()); perfil(mb)
        check("mobile: sem rolagem horizontal e formulário utilizável", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1") and mb.locator("#pf-name").is_visible()); mb.screenshot(path="docs/screenshots/etapa10_mobile.png", full_page=True)
        check_js(errs)
        b.close()
finally:
    for s in (s1, s2, m, sb): stop(s)
finish()

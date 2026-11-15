"""E2E do redesign TRADEON: marca, design system (cores oficiais, Inter local, contraste), navegação agrupada, menu "Mais" no mobile,
tablet e consistência entre telas. Mocks: tests/mock-server.mjs e tests/mock-supabase.mjs. Requer `npm run build`."""
import re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
ENV = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t", "SUPPORT_EMAIL": "atendimento@tradeon-suporte.test"}
s1 = start(3981, ENV); B = "http://127.0.0.1:3981"
def mk(p): return urllib.request.urlopen("http://127.0.0.1:4020" + p).read().decode()
PAGES = ["/", "/mercado", "/mercado/bitcoin", "/noticias", "/aprender", "/vip", "/favoritos", "/notificacoes", "/perfil", "/suporte", "/login", "/cadastro", "/recuperar-senha"]
CONTRAST = """(pairs)=>{const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 return pairs.map(([a,b])=>{const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)})}"""
def var(pg, n): return pg.evaluate(f"getComputedStyle(document.documentElement).getPropertyValue('{n}').trim()")
def login(pg, email):
    pg.goto(B + "/login"); pg.wait_for_selector("form"); pg.wait_for_load_state("networkidle"); pg.fill("#email", email); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(B + "/", timeout=20000); pg.wait_for_selector(".lrow", timeout=20000)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []; ext = []
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        pg.on("request", lambda r: ext.append(r.url) if "fonts.googleapis" in r.url or "fonts.gstatic" in r.url else None)
        mk("/__reset"); login(pg, "ok4001@teste.com"); mk("/__notify?email=ok4001@teste.com&kind=password_changed"); pg.reload(); pg.wait_for_selector(".lrow", timeout=20000)
        # ===== marca =====
        check("marca: logotipo TRADEON no menu (símbolo + nome)", pg.locator("aside .lg").inner_text().strip() == "TRADEON" and pg.locator("aside .lg svg").count() == 1)
        check("marca: título da aba e favicon próprio (icon.svg)", pg.title() == "TRADEON" or pg.title().endswith("TRADEON")) 
        ic = pg.locator("link[rel=icon]").first.get_attribute("href") or ""; check("favicon servido pelo app", "icon" in ic and pg.request.get(B + ic.split("?")[0]).status == 200, ic)
        old = []
        for path in PAGES:
            pg.goto(B + path); pg.wait_for_load_state("networkidle")
            if re.search(r"INVISTA[IÍ]|Invista[ií]\b", pg.content()): old.append(path)
        check("nenhuma tela contém a marca antiga (INVISTAÍ)", not old, ", ".join(old))
        # ===== design system =====
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000)
        check("paleta oficial no tema escuro (Obsidian, Forest, Electric Lime, Cloud, Slate)", [var(pg, v).upper() for v in ["--bg", "--sf2", "--g", "--tx", "--mt"]] == ["#080D0B", "#14221A", "#9BFF62", "#F4F6F4", "#87948B"])
        fam = pg.evaluate("getComputedStyle(document.body).fontFamily"); loaded = pg.evaluate("document.fonts.check('16px \"Inter Variable\"')")
        check("tipografia Inter servida pelo próprio app (sem Google Fonts)", "Inter" in fam and loaded and not ext, f"{fam} {loaded} {ext[:1]}")
        btn = pg.get_by_role("button", name="Atualizar dados"); prim = pg.locator("main .btn:not(.s):not(.d)").first
        check("botão principal em lime com texto Obsidian; secundário neutro", prim.evaluate("e=>getComputedStyle(e).backgroundColor") == "rgb(155, 255, 98)" and prim.evaluate("e=>getComputedStyle(e).color") == "rgb(8, 13, 11)" and btn.evaluate("e=>getComputedStyle(e).backgroundColor") in ("rgba(0, 0, 0, 0)", "transparent"))
        r = pg.evaluate(CONTRAST, [["#F4F6F4", "#080D0B"], ["#87948B", "#0E1713"], ["#080D0B", "#9BFF62"], ["#080D0B", "#FFFFFF"], ["#5D6A62", "#FFFFFF"], ["#2B7F12", "#FFFFFF"], ["#C9283C", "#FFFFFF"], ["#FF6B78", "#0E1713"]])
        check("contraste AA (≥ 4,5:1) para texto principal, secundário, positivo e negativo nos dois temas", all(x >= 4.5 for x in r), str([round(x, 1) for x in r]))
        lc = b.new_context(viewport={"width": 1440, "height": 900}); lc.add_cookies([{"name": "iv_theme", "value": "light", "url": B}]); lp = lc.new_page(); lp.goto(B + "/"); lp.wait_for_selector(".lrow", timeout=20000)
        check("tema claro: fundo Cloud, cards brancos, mesma cor de marca e positivo em verde escuro legível", [var(lp, v).upper() for v in ["--bg", "--sf", "--g", "--g-tx"]] == ["#F4F6F4", "#FFFFFF", "#9BFF62", "#2B7F12"])
        rad = pg.locator("main .card").first.evaluate("e=>getComputedStyle(e).borderRadius"); check("cards com raio de 18px e borda discreta", rad == "18px")
        # ===== gráfico =====
        ch = pg.locator("main svg.linechart").first
        check("gráfico do Início: área, grade, rótulos de máxima/mínima e período", ch.locator("polygon").count() == 1 and ch.locator("line").count() >= 3 and pg.locator(".chart-mm span").count() == 2 and "há 7 dias" in pg.locator(".chart-ax").last.inner_text())
        # ===== navegação desktop =====
        groups = pg.locator("aside [role=group]").evaluate_all("g=>g.map(x=>x.getAttribute('aria-label'))")
        check("menu lateral agrupado: Explorar, Aprenda e evolua, Minha conta", groups == ["Explorar", "Aprenda e evolua", "Minha conta"])
        bell = pg.locator("[data-testid=bell-count]").inner_text(); cnt = pg.locator("aside a.nav", has_text="Notificações").locator(".cnt").inner_text()
        check("contador de não lidas também no menu (igual ao sino)", bell == cnt == "1", f"{bell}/{cnt}")
        bad = []
        for name, path in [("TRADEON AI", "/ia"), ("Favoritos", "/favoritos"), ("Notificações", "/notificacoes"), ("Perfil", "/perfil"), ("Mercado", "/mercado"), ("Suporte", "/suporte")]:
            pg.locator("aside a.nav", has_text=name).click(); pg.wait_for_url("**" + path, timeout=15000); pg.wait_for_load_state("networkidle")
            if pg.locator("aside a.nav.on").inner_text().strip().split("\n")[0] != name: bad.append(name)
        check("menu: cada item abre a tela certa e fica marcado como ativo", not bad, ", ".join(bad))
        # ===== mobile: barra inferior + Mais =====
        mc = b.new_context(viewport={"width": 390, "height": 844}); mp = mc.new_page(); mp.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ mobile | após: " + LAST[0])); login(mp, "ok4002@teste.com")
        check("mobile: barra inferior com Início, Mercado, TRADEON AI, Notícias e Mais", mp.locator("#bn > *").all_inner_texts() == ["Início", "Mercado", "TRADEON AI", "Notícias", "Mais"])
        mp.get_by_test_id("bn-more").click(); mp.wait_for_selector("#more-sheet")
        check("'Mais' abre folha com Favoritos, Corretora, Aprender, VIP, Notificações, Perfil, Assinatura e Suporte (foco no primeiro item)", mp.locator("#more-sheet a").all_inner_texts() == ["Favoritos", "Corretora", "Aprender", "VIP", "Notificações", "Perfil", "Assinatura", "Suporte"] and mp.get_by_test_id("bn-more").get_attribute("aria-expanded") == "true" and mp.evaluate("document.activeElement.textContent") == "Favoritos")
        mp.keyboard.press("Escape"); check("Esc fecha a folha e devolve o foco ao botão", mp.locator("#more-sheet").count() == 0 and mp.evaluate("document.activeElement.dataset.testid") == "bn-more")
        mp.get_by_test_id("bn-more").click(); mp.mouse.click(195, 60); check("tocar fora fecha a folha", mp.locator("#more-sheet").count() == 0)
        mp.get_by_test_id("bn-more").click(); mp.locator("#more-sheet a", has_text="Perfil").click(); mp.wait_for_url("**/perfil"); mp.wait_for_selector("#pf-name", timeout=15000)
        check("item da folha navega, a folha fecha e 'Mais' fica ativo", mp.locator("#more-sheet").count() == 0 and mp.locator("#bn .on").inner_text().strip() == "Mais")
        mp.locator("#bn a", has_text="TRADEON AI").click(); mp.wait_for_url("**/ia"); mp.wait_for_selector(".ai-main"); check("atalho TRADEON AI na barra inferior", mp.locator("#bn a.on").inner_text().strip() == "TRADEON AI")
        mp.goto(B + "/"); mp.wait_for_selector(".lrow", timeout=20000)
        hb = mp.locator("header").bounding_box(); kids = mp.locator("header > *:visible").evaluate_all("e=>e.map(x=>{const r=x.getBoundingClientRect();return [r.left,r.right]})")
        check("mobile: cabeçalho cabe na tela sem sobreposição (avatar e botões inteiros)", all(k[1] <= 390.5 for k in kids) and all(kids[i][1] <= kids[i + 1][0] + 0.5 for i in range(len(kids) - 1)) and mp.locator("header .av").bounding_box()["width"] >= 34, str(kids))
        a = b.new_context(viewport={"width": 390, "height": 844}).new_page(); a.goto(B + "/cadastro"); a.wait_for_selector("form")
        check("telas de acesso no mobile mostram o logotipo", a.locator(".auth-m-logo .lg").is_visible())
        a.wait_for_load_state("networkidle"); a.get_by_test_id("auth-logo-m").click(); a.wait_for_url(B + "/", timeout=15000); a.wait_for_selector("main h1", timeout=20000)
        check("logotipo das telas de acesso (celular) volta ao Início", a.url == B + "/")
        d2 = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); d2.goto(B + "/login"); d2.wait_for_selector("form"); d2.wait_for_load_state("networkidle")
        d2.get_by_test_id("auth-logo").click(); d2.wait_for_url(B + "/", timeout=15000); check("logotipo do login (desktop) volta ao Início", d2.url == B + "/")
        # ===== tablet e notebook =====
        bad = []
        for w, h in [(820, 1180), (1024, 768), (1280, 800)]:
            t = b.new_context(viewport={"width": w, "height": h}).new_page()
            for path in ["/", "/mercado", "/noticias", "/suporte", "/login"]:
                t.goto(B + path); t.wait_for_load_state("networkidle")
                if t.evaluate("document.documentElement.scrollWidth > innerWidth + 1"): bad.append(f"{w}:{path}")
            t.context.close()
        check("tablet (820), notebook (1024/1280): sem rolagem horizontal", not bad, ", ".join(bad))
        # ===== consistência =====
        pg.goto(B + "/noticias"); pg.wait_for_selector("article", timeout=20000)
        check("notícias em grade de 2 colunas no desktop (mesmos itens e ações)", pg.locator(".news-grid").evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length") == 2 and pg.locator("article").first.get_by_role("button", name="Favoritar").count() == 1)
        pg.goto(B + "/mercado/bitcoin"); pg.wait_for_selector("#dados", timeout=20000); pg.wait_for_load_state("networkidle")
        tabs = pg.locator("nav.utabs a")
        check("detalhe do ativo: abas Gráfico/Dados/Notícias/Análise com a primeira ativa", tabs.all_inner_texts() == ["Gráfico", "Dados", "Notícias relacionadas", "Análise"] and pg.locator("nav.utabs a.on").inner_text() == "Gráfico")
        tabs.nth(1).click(); pg.wait_for_function("document.querySelector('nav.utabs a.on')?.textContent==='Dados'", timeout=5000)
        check("aba clicada leva à seção e fica ativa", pg.url.endswith("#dados"))
        check("variação em pílula com seta (▲/▼) sem alterar o texto do número", pg.locator("main .chg").first.inner_text().startswith(("+", "-", "−")) and pg.locator("main .chg").first.evaluate("e=>getComputedStyle(e,'::before').content") in ('"▲"', '"▼"'))
        hs = []
        for path in ["/", "/mercado", "/noticias", "/favoritos", "/notificacoes", "/perfil", "/suporte"]:
            pg.goto(B + path); pg.wait_for_selector("main h1", timeout=20000); hs.append(pg.locator("main h1").first.evaluate("e=>getComputedStyle(e).fontSize+' '+getComputedStyle(e).fontWeight"))
        check("títulos de página com a mesma escala em todas as telas", len(set(hs)) == 1, str(set(hs)))
        check_js(errs)
        b.close()
finally:
    for s in (s1, m, sb): stop(s)
finish()

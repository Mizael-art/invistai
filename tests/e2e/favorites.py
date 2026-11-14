"""E2E de Favoritos (Etapa 11). Mock do Supabase (Auth + REST com RLS simulada). Requer `npm run build`."""
import json, re, subprocess, os, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
sb = subprocess.Popen(["node", "tests/mock-supabase.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1)
SB = {"SUPABASE_URL": "http://127.0.0.1:4020", "SUPABASE_ANON_KEY": "anon-test", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"}
s1 = start(3921, {**SB, "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx"})
s2 = start(3922, {**SB, "COINGECKO_BASE_URL": "http://127.0.0.1:4010/rl", "FOREX_BASE_URL": "http://127.0.0.1:4010/down"})
B, B2 = "http://127.0.0.1:3921", "http://127.0.0.1:3922"
def mk(path): return urllib.request.urlopen("http://127.0.0.1:4020" + path).read().decode()
def stats(): return json.loads(mk("/__stats"))
def favs(): return json.loads(mk("/__favs"))
_n = [1000]
def fresh(): _n[0] += 1; return f"ok{_n[0]}@teste.com"
def login(pg, email, base=B):
    pg.goto(base + "/login"); pg.wait_for_selector("form"); pg.fill("#email", email); pg.fill("#password", "Senha@123"); pg.get_by_role("button", name=re.compile("^(Entrar|Sign in)")).click(); pg.wait_for_url(base + "/", timeout=15000); pg.wait_for_selector(".lrow", timeout=20000)
def wait_writes(n, timeout=8):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if len(stats()["favoriteWrites"]) >= n: return True
        time.sleep(0.1)
    return False
def fav_page(pg, qs="", base=B): pg.goto(base + "/favoritos" + qs); pg.wait_for_selector("h1"); pg.wait_for_selector("article, [data-testid=fv-empty], [data-testid=fv-noresults]", timeout=20000); pg.wait_for_load_state("networkidle")   # espera a hidratação antes de clicar
def post(pg, body): return pg.evaluate("(b)=>fetch('/api/favorites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)", body)
def delete(pg, body): return pg.evaluate("(b)=>fetch('/api/favorites',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)", body)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read"]); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        mk("/__reset")
        pg.goto(B + "/favoritos"); pg.wait_for_url(re.compile("/login")); check("visitante em /favoritos → /login?next=%2Ffavoritos", "next=%2Ffavoritos" in pg.url)
        uA = fresh(); login(pg, uA); fav_page(pg)
        check("conta nova: estado vazio com 'Voltar ao mercado' e 'Ver notícias' (sem conteúdo aleatório)", pg.locator("[data-testid=fv-empty]").is_visible() and "Nenhum favorito salvo." in pg.inner_text("main") and pg.get_by_role("link", name="Voltar ao mercado").get_attribute("href") == "/mercado" and pg.get_by_role("link", name="Ver notícias").get_attribute("href") == "/noticias" and pg.locator("article").count() == 0)
        check("abas Todos/Ativos/Notícias com contagem zero", [pg.locator(f"[data-testid=count-{k}]").inner_text() for k in ("all", "asset", "news")] == ["0", "0", "0"])
        # --- favoritar a partir das outras páginas (mesmo serviço) ---
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr"); pg.wait_for_load_state("networkidle")
        pg.locator("tbody tr", has_text="Bitcoin").get_by_role("button", name="Favoritar").click(); assert wait_writes(1)
        pg.locator("tbody tr", has_text="Ethereum").get_by_role("button", name="Favoritar").click(); assert wait_writes(2)
        check("Mercado: estrelas ficam marcadas (★)", pg.locator("tbody tr", has_text="Bitcoin").get_by_role("button").first.inner_text() == "★")
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000); pg.wait_for_load_state("networkidle")
        pg.locator(".lrow", has_text="Solana").get_by_role("button", name="Favoritar").click(); assert wait_writes(3)
        pg.goto(B + "/mercado/binancecoin"); pg.wait_for_selector("#dados", timeout=20000); pg.wait_for_load_state("networkidle")
        pg.get_by_role("button", name="Favoritar").first.click(); assert wait_writes(4)
        pg.goto(B + "/noticias?cat=crypto"); pg.wait_for_selector("article", timeout=20000); pg.wait_for_load_state("networkidle")
        pg.locator("article").nth(0).get_by_role("button", name="Favoritar").click(); assert wait_writes(5); pg.locator("article").nth(1).get_by_role("button", name="Favoritar").click(); assert wait_writes(6)
        check("favoritos gravados com metadados (ativos: símbolo/nome; notícias: título/fonte/data/URL https)", all(w["metadata"] for w in stats()["favoriteWrites"]) and [w["type"] for w in stats()["favoriteWrites"]].count("asset") == 4 and [w["type"] for w in stats()["favoriteWrites"]].count("news") == 2 and all(w["metadata"]["url"].startswith("https://") for w in stats()["favoriteWrites"] if w["type"] == "news"))
        # --- lista ---
        fav_page(pg); t = pg.inner_text("main")
        check("lista: 6 favoritos (4 ativos + 2 notícias), contagens nas abas", pg.locator("article").count() == 6 and [pg.locator(f"[data-testid=count-{k}]").inner_text() for k in ("all", "asset", "news")] == ["6", "4", "2"])
        check("ordem: mais recentes primeiro (notícias salvas por último vêm antes)", pg.locator("article").nth(0).get_attribute("data-kind") == "news" and pg.locator("article").nth(5).get_attribute("data-id") == "bitcoin")
        a = pg.locator("article[data-id=bitcoin]")
        check("ativo: símbolo, nome, preço com moeda, variação, fonte e horário", "BTC" in a.inner_text() and "Bitcoin" in a.inner_text() and "US$" in a.inner_text().replace("\xa0", " ") and "+2,40%" in a.inner_text() and "Fonte: CoinGecko" in a.inner_text() and "Atualizado:" in a.inner_text())
        check("ativo: 'Abrir ativo' → detalhes do ativo", a.get_by_role("link", name="Abrir ativo").get_attribute("href") == "/mercado/bitcoin")
        n0 = pg.locator("article[data-kind=news]").first; lk = n0.locator("h2 a")
        check("notícia: título, fonte, data; 'Abrir notícia' → matéria original em nova aba segura", lk.get_attribute("target") == "_blank" and "noopener" in lk.get_attribute("rel") and lk.get_attribute("href").startswith("https://exemplo.test/") and "Fonte Cripto" in n0.inner_text() and n0.get_by_role("link", name=re.compile("Abrir notícia")).get_attribute("href") == lk.get_attribute("href"))
        # --- abas ---
        pg.locator("nav[aria-label=Tipos]").get_by_role("link", name=re.compile("^Ativos")).click(); pg.wait_for_function("location.search.includes('type=asset')"); pg.wait_for_function("document.querySelectorAll('article').length===4")
        check("aba Ativos: só ativos", pg.locator("article[data-kind=news]").count() == 0)
        pg.locator("nav[aria-label=Tipos]").get_by_role("link", name=re.compile("^Notícias")).click(); pg.wait_for_function("location.search.includes('type=news')"); pg.wait_for_function("document.querySelectorAll('article').length===2")
        check("aba Notícias: só notícias", pg.locator("article[data-kind=asset]").count() == 0)
        pg.locator("nav[aria-label=Tipos]").get_by_role("link", name=re.compile("^Todos")).click(); pg.wait_for_function("document.querySelectorAll('article').length===6"); check("aba Todos restaura tudo", True)
        # --- busca ---
        box = pg.get_by_placeholder("Buscar nos favoritos")
        box.fill("bitcoin"); pg.wait_for_function("location.search.includes('q=bitcoin')"); pg.wait_for_function("document.querySelectorAll('article').length===1"); check("busca por nome do ativo", pg.locator("article").first.get_attribute("data-id") == "bitcoin")
        box.fill("SOL"); pg.wait_for_function("location.search.includes('q=SOL')"); pg.wait_for_function("document.querySelectorAll('article').length===1"); check("busca por símbolo (sem diferenciar caixa)", pg.locator("article").first.get_attribute("data-id") == "solana")
        box.fill("cripto")
        try: pg.wait_for_function("location.search.includes('q=cripto')"); pg.wait_for_function("document.querySelectorAll('article').length===2")
        except Exception: print("DIAG url=", pg.url, "input=", box.input_value(), "articles=", pg.locator("article").count()); raise
        check("busca por título/fonte da notícia", pg.locator("article[data-kind=news]").count() == 2)
        box.fill("zzzz"); pg.wait_for_selector("[data-testid=fv-noresults]", timeout=8000); check("busca sem resultado: mensagem simples (não é o estado vazio)", "Nenhum resultado encontrado." in pg.inner_text("main") and pg.locator("[data-testid=fv-empty]").count() == 0)
        pg.get_by_role("link", name="Limpar busca e filtros").click(); pg.wait_for_function("document.querySelectorAll('article').length===6"); check("limpar restaura a lista", pg.url.endswith("/favoritos"))
        pg.goto(B + "/favoritos?type=news&q=1"); pg.wait_for_selector("article"); check("busca combinada com aba (notícias contendo '1')", pg.locator("article").count() == 1)
        pg.goto(B + "/favoritos?type=zzz&page=-9&q=%00"); pg.wait_for_selector("article"); check("parâmetros inválidos caem no padrão", pg.locator("article").count() == 6)
        # --- remover ---
        fav_page(pg); d0 = len(stats()["favoriteDeletes"])
        pg.locator("article[data-id=ethereum]").get_by_role("button", name=re.compile("Remover dos favoritos")).click(); pg.wait_for_function("document.querySelectorAll('article[data-id=ethereum]').length===0", timeout=8000)
        check("remover: some da lista na hora e é apagado no banco", stats()["favoriteDeletes"][d0:] == [{"type": "asset", "id": "ethereum"}] and not [f for f in favs() if f["item_id"] == "ethereum"])
        pg.wait_for_function("document.querySelector('[data-testid=count-all]').innerText==='5'", timeout=20000); check("contagens atualizadas após remover", [pg.locator(f"[data-testid=count-{k}]").inner_text() for k in ("all", "asset", "news")] == ["5", "3", "2"])
        pg.reload(); pg.wait_for_selector("article"); check("remoção persiste após recarregar", pg.locator("article[data-id=ethereum]").count() == 0 and pg.locator("article").count() == 5)
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr"); pg.wait_for_load_state("networkidle"); check("Mercado reflete a remoção (estrela vazia no ETH, cheia no BTC)", pg.locator("tbody tr", has_text="Ethereum").get_by_role("button").first.inner_text() == "☆" and pg.locator("tbody tr", has_text="Bitcoin").get_by_role("button").first.inner_text() == "★")
        # --- outro dispositivo e isolamento entre contas ---
        c2 = b.new_context(viewport={"width": 1440, "height": 900}); p2 = c2.new_page(); login(p2, uA); fav_page(p2)
        check("outro dispositivo (mesma conta) vê os mesmos favoritos", p2.locator("article").count() == 5 and p2.locator("article[data-id=bitcoin]").count() == 1)
        fav_page(pg); pg.locator("article[data-id=solana]").get_by_role("button", name=re.compile("Remover dos favoritos")).click(); pg.wait_for_function("document.querySelectorAll('article[data-id=solana]').length===0", timeout=8000)
        p2.reload(); p2.wait_for_selector("article"); check("remoção em um dispositivo aparece no outro", p2.locator("article[data-id=solana]").count() == 0 and p2.locator("article").count() == 4)
        c3 = b.new_context(viewport={"width": 1440, "height": 900}); p3 = c3.new_page(); uB = fresh(); login(p3, uB); fav_page(p3)
        check("outra conta não vê favoritos alheios (lista vazia)", p3.locator("[data-testid=fv-empty]").is_visible() and p3.locator("article").count() == 0)
        before = [f for f in favs() if f["item_id"] == "bitcoin"]; st = delete(p3, {"itemType": "asset", "itemId": "bitcoin"})
        check("outra conta não consegue remover o favorito alheio (RLS + user_id da sessão)", st == 200 and [f for f in favs() if f["item_id"] == "bitcoin"] == before and len(before) == 1)
        # --- duplicatas ---
        s1_ = post(p3, {"itemType": "asset", "itemId": "bitcoin", "metadata": {"symbol": "BTC", "name": "Bitcoin"}}); s2_ = post(p3, {"itemType": "asset", "itemId": "bitcoin", "metadata": {"symbol": "BTC", "name": "Bitcoin"}})
        check("favoritar duas vezes não duplica (uma linha por usuário+item)", s1_ == s2_ == 200 and len([f for f in favs() if f["item_id"] == "bitcoin"]) == 2)   # A + B
        # --- API ---
        check("API: sem sessão → 401 (POST e DELETE)", pg.request.post(B + "/api/favorites", data={"itemType": "asset", "itemId": "x"}).status == 401 and pg.request.delete(B + "/api/favorites", data={"itemType": "asset", "itemId": "x"}).status == 401)
        check("API: metadados do tipo errado / extras → 400", post(p3, {"itemType": "asset", "itemId": "x", "metadata": {"title": "t", "source": "s", "url": "https://a.co", "publishedAt": "2026-01-01T00:00:00Z"}}) == 400 and post(p3, {"itemType": "asset", "itemId": "x", "metadata": {"symbol": "A", "name": "B", "x": 1}}) == 400 and post(p3, {"itemType": "news", "itemId": "x", "metadata": {"symbol": "A", "name": "B"}}) == 400)
        codes = p3.evaluate("Promise.all(Array.from({length:70},(_, i)=>fetch('/api/favorites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({itemType:'asset',itemId:'coin-'+(i+7),metadata:{symbol:'C'+(i+7),name:'Coin '+(i+7)}})}).then(r=>r.status)))"); check("API: limite de requisições → 429", 429 in codes, str(sorted(set(codes))))
        # --- paginação (conta C) ---
        c4 = b.new_context(viewport={"width": 1440, "height": 900}); p4 = c4.new_page(); uC = fresh(); login(p4, uC)
        for i in range(25): assert post(p4, {"itemType": "asset", "itemId": f"coin-{i+7}", "metadata": {"symbol": f"C{i+7}", "name": f"Coin {i+7}"}}) == 200
        fav_page(p4); p1 = p4.locator("article").evaluate_all("els=>els.map(e=>e.dataset.id)")
        check("paginação: 20 por página, contagem 25, 'Próxima' visível", len(p1) == 20 and p4.locator("[data-testid=count-all]").inner_text() == "25" and p4.get_by_role("link", name=re.compile("Próxima")).is_visible())
        p4.get_by_role("link", name=re.compile("Próxima")).click(); p4.wait_for_function("location.search.includes('page=2')"); p4.wait_for_function("document.querySelectorAll('article').length===5"); p2_ = p4.locator("article").evaluate_all("els=>els.map(e=>e.dataset.id)")
        check("paginação: página 2 com 5 itens, sem repetir a página 1", len(p2_) == 5 and not set(p1) & set(p2_))
        p4.get_by_role("link", name=re.compile("Anterior")).click(); p4.wait_for_function("!location.search.includes('page=')"); p4.wait_for_function("document.querySelectorAll('article').length===20"); check("paginação: voltar restaura a página 1", True)
        # --- provedor de cotações fora do ar ---
        post(p4, {"itemType": "asset", "itemId": "legacy-asset"}); post(p4, {"itemType": "news", "itemId": "semdados1"})
        c5 = b.new_context(viewport={"width": 1440, "height": 900}); p5 = c5.new_page(); login(p5, uC, B2); fav_page(p5, "?q=coin%207", B2)
        a5 = p5.locator("article[data-id=coin-7]")
        check("provedor fora do ar: ativo aparece com nome/símbolo salvos e aviso (nunca preço inventado)", "C7" in a5.inner_text() and "Cotação indisponível no momento." in a5.inner_text() and "US$" not in a5.inner_text() and a5.get_by_role("link", name="Abrir ativo").is_visible())
        p5.locator("nav[aria-label=Tipos]").get_by_role("link", name=re.compile("^Todos")).click(); p5.wait_for_selector("article")
        p5.goto(B2 + "/favoritos?q=legacy"); p5.wait_for_selector("article, [data-testid=fv-noresults], [data-testid=fv-empty], .note", timeout=20000); check("busca encontra favorito sem metadados pelo id", p5.locator("article[data-id=legacy-asset]").count() == 1 and "Cotação indisponível" in p5.locator("article").first.inner_text())
        p5.goto(B2 + "/favoritos?q=semdados"); p5.wait_for_selector("article"); check("notícia sem metadados: 'sem dados disponíveis', sem link, removível", "Notícia salva sem dados disponíveis." in p5.inner_text("article") and p5.locator("article a").count() == 0 and p5.get_by_role("button", name=re.compile("Remover dos favoritos")).is_enabled())
        p5.get_by_role("button", name=re.compile("Remover dos favoritos")).click(); p5.wait_for_selector("[data-testid=fv-all-removed], [data-testid=fv-noresults]", timeout=10000)
        check("removendo o último item visível: lista esvazia com aviso e o banco é atualizado", p5.locator("article").count() == 0 and not [f for f in favs() if f["item_id"] == "semdados1"])
        # --- EN / claro / mobile ---
        ectx = b.new_context(viewport={"width": 1440, "height": 900}); ectx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}, {"name": "iv_theme", "value": "light", "url": B}]); pe = ectx.new_page(); login(pe, uC); fav_page(pe)
        check("inglês e tema claro", "Favorites" in pe.inner_text("h1") and pe.get_by_placeholder("Search favorites").is_visible() and pe.get_by_role("link", name="Open asset").first.is_visible() and pe.evaluate("document.documentElement.dataset.theme") == "light"); pe.screenshot(path="docs/screenshots/etapa11_desktop_light_en.png")
        mctx = b.new_context(viewport={"width": 390, "height": 844}); mb = mctx.new_page(); login(mb, uA); fav_page(mb)
        check("mobile: sem rolagem horizontal e botões acessíveis", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1") and mb.get_by_role("link", name="Abrir ativo").first.is_visible()); mb.screenshot(path="docs/screenshots/etapa11_mobile.png")
        check_js(errs)
        b.close()
finally:
    for s in (s1, s2, m, sb): stop(s)
finish()

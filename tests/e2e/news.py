"""E2E da página Notícias (Etapa 04). Requer `npm run build`. Servidor mock de NewsAPI (tests/mock-server.mjs)."""
import re
from playwright.sync_api import sync_playwright
from common import *

m = mock()
def env(base, key="t"):
    e = {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": f"http://127.0.0.1:4010/{base}"}
    if key: e["NEWS_API_KEY"] = key
    return e
s_ok, s_rl, s_down, s_nokey, s_part = start(3401, env("ok")), start(3402, env("rl")), start(3403, env("down")), start(3404, env("ok", None)), start(3405, env("part"))
B = "http://127.0.0.1:3401"
def cards(pg): return pg.locator("article")
def titles(pg): return pg.locator("article h2").all_inner_texts()
def wait_cards(pg, n=None, timeout=15000):
    pg.wait_for_selector("article", timeout=timeout)
    if n is not None: pg.wait_for_function(f"document.querySelectorAll('article').length==={n}", timeout=8000)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"]); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(B + "/noticias"); wait_cards(pg)
        check("título e 5 chips (Todas + 4 categorias), 'Todas' ativa; visitante sem 'Para você'", pg.inner_text("h1") == "Notícias" and pg.locator("nav[aria-label=Categorias] a").count() == 5 and pg.locator("nav[aria-label=Categorias] a[aria-current=page]").inner_text() == "Todas")
        check("feed 'Todas': 35 notícias únicas mescladas das 4 categorias", cards(pg).count() == 35, str(cards(pg).count()))
        ts = [int(x) for x in pg.locator("article").evaluate_all("els=>els.map(e=>e.dataset.ts)")]
        check("ordenado pela data real de publicação (mais recente primeiro)", ts == sorted(ts, reverse=True))
        check("sem imagens (direitos não verificados)", pg.locator("article img").count() == 0)
        c0 = cards(pg).first
        link = c0.locator("h2 a")
        check("card: categoria, título com link externo seguro, fonte, horário", c0.locator(".bd").count() == 1 and link.get_attribute("target") == "_blank" and "noopener" in link.get_attribute("rel") and link.get_attribute("href").startswith("https://exemplo.test/") and "Fonte" in c0.inner_text() and c0.locator("time").count() == 1)
        check("card: favoritar, compartilhar e 'Ler na fonte'", c0.get_by_role("button", name="Favoritar").count() == 1 and c0.get_by_role("button", name="Compartilhar").count() == 1 and c0.get_by_role("link", name=re.compile("Ler na fonte")).count() == 1)
        tt = titles(pg); urls = pg.locator("article h2 a").evaluate_all("els=>els.map(e=>e.href)")
        check("sem duplicatas (URL canônica e título), sem item sem título/[Removed]/antigo", len(set(tt)) == len(tt) and len(set(urls)) == len(urls) and not any("utm_" in u for u in urls) and not any(t in ("[Removed]", "Cripto antiga") for t in tt))
        check("título repetido entre categorias aparece uma vez", tt.count("Cripto 2") == 1)
        # categoria
        pg.get_by_role("link", name="Criptomoedas", exact=True).click(); pg.wait_for_function("location.search.includes('cat=crypto')"); wait_cards(pg, 16)
        check("categoria Criptomoedas: 16 itens, todos da categoria, chip ativo", pg.locator("article[data-cat=crypto]").count() == 16 and pg.locator("nav[aria-label=Categorias] a[aria-current=page]").inner_text() == "Criptomoedas")
        # paginação
        p1 = set(titles(pg)); pg.get_by_role("link", name="Próxima").click(); pg.wait_for_function("location.search.includes('page=2')"); wait_cards(pg, 9)
        p2 = titles(pg); check("paginação: página 2 sem duplicar a 1; última página sem 'Próxima' ativa", not (p1 & set(p2)) and pg.get_by_role("link", name="Próxima").count() == 0)
        pg.get_by_role("link", name="Anterior").click(); pg.wait_for_function("!location.search.includes('page=')"); wait_cards(pg, 16); check("paginação: voltar restaura a página 1", set(titles(pg)) == p1)
        # busca
        pg.goto(B + "/noticias"); wait_cards(pg, 35)
        box = pg.get_by_placeholder("Buscar no feed carregado"); box.fill("Cripto 3"); pg.wait_for_function("location.search.includes('q=')"); wait_cards(pg, 1)
        check("busca por título", titles(pg) == ["Cripto 3"])
        pg.get_by_role("button", name="Limpar busca").click(); pg.wait_for_function("!location.search.includes('q=')"); wait_cards(pg, 35); check("limpar busca restaura o feed", True)
        box.fill("cambio"); pg.wait_for_function("location.search.includes('q=cambio')"); wait_cards(pg, 10); check("busca sem acento/caixa (título e fonte)", all("Câmbio" in t for t in titles(pg)))
        box.fill("zzzz"); pg.wait_for_selector("text=Nenhuma notícia encontrada para a busca.", timeout=5000); check("busca sem resultado mostra mensagem", True)
        box.fill("   "); pg.wait_for_timeout(900); box.fill("zzzz"); box.fill(""); pg.wait_for_function("!location.search.includes('q=')", timeout=5000); check("busca apagada volta ao feed completo", True)
        pg.goto(B + "/noticias?cat=stocks&q=Bolsa+4"); wait_cards(pg, 1); check("busca combinada com categoria", titles(pg) == ["Bolsa 4"])
        pg.get_by_role("button", name="Limpar filtros").click(); pg.wait_for_url(B + "/noticias"); wait_cards(pg, 35); check("limpar filtros restaura categoria e busca", True)
        # favorito e compartilhar
        c0 = cards(pg).first; fb = c0.get_by_role("button", name="Favoritar"); fb.click(); pg.wait_for_selector("article .fav-msg:has-text('não configuradas')")
        check("favorito sem contas: reverte e informa", fb.inner_text() == "☆")
        href = c0.locator("h2 a").get_attribute("href"); c0.get_by_role("button", name="Compartilhar").click(); pg.wait_for_selector("article .fav-msg:has-text('Link copiado')", timeout=4000)
        check("compartilhar copia a URL original da matéria", pg.evaluate("navigator.clipboard.readText()") == href)
        # preferências (visitante)
        pg.locator("summary", has_text="Minhas categorias").click(); check("preferências: visitante é convidado a entrar", pg.get_by_role("link", name="Entre para salvar suas categorias.").is_visible())
        # APIs
        r = pg.request.put(B + "/api/preferences", data={"newsCategories": ["bonds"]}); check("API prefs: categoria inválida -> 400", r.status == 400)
        r = pg.request.put(B + "/api/preferences", data={"newsCategories": ["crypto"]}); check("API prefs: válida sem Supabase -> 503", r.status == 503)
        r = pg.request.put(B + "/api/preferences", headers={"content-type": "application/json"}, data="{x"); check("API prefs: JSON inválido -> 400", r.status == 400)
        meta = {"title": "T", "source": "S", "url": "https://ex.com/a", "publishedAt": "2026-01-01T10:00:00Z"}
        r = pg.request.post(B + "/api/favorites", data={"itemType": "news", "itemId": "abc", "metadata": {**meta, "url": "http://ex.com/a"}}); check("API fav: metadados com URL http -> 400", r.status == 400)
        r = pg.request.post(B + "/api/favorites", data={"itemType": "news", "itemId": "abc", "metadata": {**meta, "url": "javascript:alert(1)"}}); check("API fav: javascript: -> 400", r.status == 400)
        r = pg.request.post(B + "/api/favorites", data={"itemType": "news", "itemId": "abc", "metadata": meta}); check("API fav: notícia válida sem Supabase -> 503", r.status == 503)
        # params inválidos
        pg.goto(B + "/noticias?cat=xxx&page=-9&q=%00"); wait_cards(pg, 35); check("parâmetros inválidos caem no padrão", True)
        # EN
        ctx.add_cookies([{"name": "iv_lang", "value": "en", "url": B}]); pg.goto(B + "/noticias"); wait_cards(pg)
        check("inglês: UI e feed em EN", pg.inner_text("h1") == "News" and titles(pg)[0].startswith("EN ") and pg.get_by_placeholder("Search the loaded feed").is_visible())
        pg.screenshot(path="docs/screenshots/etapa04_desktop_en.png"); ctx.clear_cookies()
        check("sem erros de JS", not errs, "; ".join(errs)[:200])
        # mobile
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/noticias"); wait_cards(mb)
        check("mobile: sem rolagem horizontal", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        mb.screenshot(path="docs/screenshots/etapa04_mobile.png")
        # falhas de provedor
        for port, txt, name in [(3402, "Limite de requisições", "429"), (3403, "Provedor indisponível", "500")]:
            f = b.new_page(); f.goto(f"http://127.0.0.1:{port}/noticias"); f.wait_for_selector(".note", timeout=15000)
            check(f"provedor {name}: aviso + 'Tentar novamente', chips e navegação preservados", txt in f.inner_text("main") and f.get_by_role("button", name="Tentar novamente").count() >= 1 and f.locator("nav[aria-label=Categorias] a").count() == 5 and f.locator("aside a.nav").count() == 10)
        nk = b.new_page(); nk.goto("http://127.0.0.1:3404/noticias"); nk.wait_for_selector(".note", timeout=15000)
        check("sem NEWS_API_KEY: 'provedor não configurado' (sem retry) e página funcional", "Provedor não configurado" in nk.inner_text("main") and nk.get_by_role("button", name="Tentar novamente").count() == 0 and nk.get_by_role("link", name="Mercado").first.is_visible())
        pt = b.new_page(); pt.goto("http://127.0.0.1:3405/noticias"); wait_cards(pt, 25)
        check("falha parcial: mostra as demais categorias + aviso da categoria indisponível", "Algumas categorias estão indisponíveis: Forex e moedas" in pt.inner_text("main") and pt.locator("article[data-cat=forex]").count() == 0)
        b.close()
finally:
    for s in (s_ok, s_rl, s_down, s_nokey, s_part, m): stop(s)
finish()

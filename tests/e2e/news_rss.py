"""E2E do provedor de notícias por RSS (sem chave). As fontes reais são redirecionadas ao servidor mock (NEWS_RSS_TEST_PREFIX).
O mock serve feeds com itens recentes, um item antigo (> 7 dias), um link javascript: e a fonte de Economia fora do ar (falha parcial)."""
import re
from playwright.sync_api import sync_playwright
from common import *

m = mock()
ENV = {"NEWS_PROVIDER": "rss", "NEWS_RSS_TEST_PREFIX": "http://127.0.0.1:4010/rss/", "NEWS_RSS_TEST_PREFIX_ALLOW": "1", "COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "FOREX_BASE_URL": "http://127.0.0.1:4010/ok/fx"}
s1 = start(3991, ENV); B = "http://127.0.0.1:3991"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:60] + " @ " + pg.url + " | após: " + LAST[0]))
        pg.goto(B + "/noticias"); pg.wait_for_selector("article", timeout=20000); t = pg.inner_text("main")
        check("feed RSS funciona sem chave: manchetes reais das fontes (Livecoins, Money Times)", pg.locator("article").count() >= 6 and "Livecoins" in t and "Money Times" in t and "não configurado" not in t)
        check("fonte de cada item e link para a matéria original (nova aba segura)", all(a.get_attribute("target") == "_blank" and "noopener" in a.get_attribute("rel") and a.get_attribute("href").startswith("https://") for a in pg.locator("article h2 a").all()))
        check("itens antigos (> 7 dias) e links javascript: descartados", "Velha" not in t and "XSS" not in t and pg.locator("a[href^='javascript']").count() == 0)
        check("entidades decodificadas no título (&amp; → &)", "& mais" in t and "&amp;" not in t)
        check("falha parcial: Economia fora do ar é avisada e as outras categorias continuam", "Economia global" in pg.locator("[role=status]").first.inner_text() and pg.locator("article").count() > 0)
        dates = pg.locator("article time").evaluate_all("e=>e.map(x=>Date.parse(x.getAttribute('datetime')))")
        check("ordenado do mais recente para o mais antigo", dates == sorted(dates, reverse=True) and len(dates) > 1)
        pg.locator("nav[aria-label=Categorias]").get_by_role("link", name=re.compile("Criptomoedas")).click(); pg.wait_for_url(re.compile("cat=crypto")); pg.wait_for_selector("article")
        check("categoria Criptomoedas: só itens de cripto", pg.locator("article").count() >= 1 and all(c == "crypto" for c in pg.locator("article").evaluate_all("e=>e.map(x=>x.dataset.cat)")))
        pg.goto(B + "/noticias?q=ibovespa"); pg.wait_for_selector("article, [role=status]", timeout=20000)
        check("busca no feed RSS", pg.locator("article").count() >= 1 and all("ibovespa" in x.lower() for x in pg.locator("article h2").all_inner_texts()))
        pg.goto(B + "/"); pg.wait_for_selector(".lrow", timeout=20000)
        check("Início: bloco de notícias recentes com RSS", pg.locator("main .card", has_text="Notícias recentes").locator(".lrow").count() == 5)
        pg.goto(B + "/mercado/bitcoin"); pg.wait_for_selector("#noticias", timeout=20000); nt = pg.inner_text("#noticias")
        check("detalhe do ativo: notícias relacionadas pelo nome (Bitcoin)", "Bitcoin" in nt and "Ibovespa" not in nt)
        e = b.new_context(viewport={"width": 1440, "height": 900}); e.add_cookies([{"name": "iv_lang", "value": "en", "url": B}]); pe = e.new_page()
        pe.goto(B + "/noticias"); pe.wait_for_selector("article", timeout=20000); te = pe.inner_text("main")
        check("inglês: fontes em inglês (CoinDesk, Cointelegraph, investingLive)", all(s in te for s in ["CoinDesk", "Cointelegraph", "investingLive"]) and "Money Times" not in te)
        check_js(errs)
        b.close()
finally:
    for s in (s1, m): stop(s)
finish()

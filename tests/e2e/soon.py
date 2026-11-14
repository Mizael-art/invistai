"""E2E da página Aprender "Em breve" (Etapa 05). Requer `npm run build`."""
import re
from playwright.sync_api import sync_playwright
from common import *

m = mock()
s1 = start(3501, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"})
B = "http://127.0.0.1:3501"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []; api = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("request", lambda r: api.append(r.url) if "/api/" in r.url else None)
        pg.goto(B + "/aprender"); pg.wait_for_selector("h1")
        check("título 'Em breve' e rótulo Aprender", pg.inner_text("h1") == "Em breve" and "Aprender" in pg.inner_text(".soon .bd"))
        check("menu continua visível e 'Aprender' ativo (sidebar)", pg.locator("aside a.nav").count() == 9 and pg.locator("aside a.nav.on").inner_text().strip() == "Aprender")
        body = pg.inner_text("main")
        check("sem cursos/progresso/downloads/ebooks/checkout fictícios", not re.search(r"%|Baixar|Download|Assinar|Comprar|Ebook|PDF|concluíd", body, re.I) and pg.locator("table,progress,[role=progressbar]").count() == 0)
        check("apenas ações de navegação (Voltar e Início)", pg.locator("main button, main a").count() == 2 and pg.get_by_role("button", name=re.compile("Voltar")).count() == 1 and pg.get_by_role("link", name="Voltar ao Início").count() == 1)
        check("a página não chama APIs nem simula dados", api == [])
        # voltar sem histórico -> Início
        pg.get_by_role("button", name=re.compile("Voltar")).click(); pg.wait_for_url(B + "/"); pg.wait_for_selector(".lrow", timeout=15000); check("Voltar sem histórico interno vai ao Início", True)
        # Início -> Aprender -> Voltar -> Início
        pg.get_by_role("link", name="Aprender").first.click(); pg.wait_for_url("**/aprender"); pg.get_by_role("button", name=re.compile("Voltar")).click(); pg.wait_for_url(B + "/"); check("Início → Aprender → Voltar retorna ao Início", True)
        # Mercado -> Aprender -> Voltar -> Mercado
        pg.get_by_role("link", name="Mercado").first.click(); pg.wait_for_url("**/mercado"); pg.wait_for_selector("tbody tr", timeout=15000)
        pg.get_by_role("link", name="Aprender").first.click(); pg.wait_for_url("**/aprender"); pg.get_by_role("button", name=re.compile("Voltar")).click(); pg.wait_for_url("**/mercado")
        check("Mercado → Aprender → Voltar retorna ao Mercado (histórico real)", True)
        # atalho do Início
        pg.goto(B + "/"); pg.wait_for_selector(".qa2"); pg.locator(".qa2 a[href='/aprender']").click(); pg.wait_for_url("**/aprender"); check("atalho 'Aprender' do Início abre a tela", pg.inner_text("h1") == "Em breve")
        pg.get_by_role("link", name="Voltar ao Início").click(); pg.wait_for_url(B + "/"); check("'Voltar ao Início' funciona", True)
        # tema claro e EN
        ctx.add_cookies([{"name": "iv_theme", "value": "light", "url": B}, {"name": "iv_lang", "value": "en", "url": B}]); pg.goto(B + "/aprender"); pg.wait_for_selector("h1")
        check("tema claro e inglês", pg.evaluate("document.documentElement.dataset.theme") == "light" and pg.inner_text("h1") == "Coming soon" and pg.get_by_role("button", name=re.compile("Back")).is_visible())
        pg.screenshot(path="docs/screenshots/etapa05_desktop_light_en.png"); ctx.clear_cookies()
        check("sem erros de JS", not errs, "; ".join(errs)[:200])
        # mobile
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/aprender"); mb.wait_for_selector("h1")
        check("mobile: barra inferior com Aprender ativo", mb.locator("#bn a").count() == 4 and mb.locator("#bn .on").inner_text().strip() == "Mais" and (mb.get_by_test_id("bn-more").click() or mb.locator("#more-sheet a.on").inner_text().strip() == "Aprender"))
        check("mobile: sem rolagem horizontal", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        mb.screenshot(path="docs/screenshots/etapa05_mobile.png")
        b.close()
finally:
    for s in (s1, m): stop(s)
finish()

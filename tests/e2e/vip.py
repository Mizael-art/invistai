"""E2E da página VIP "Em breve" (Etapa 06). Requer `npm run build`."""
import re
from playwright.sync_api import sync_playwright
from common import *

m = mock()
s1 = start(3601, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"})
B = "http://127.0.0.1:3601"
FAKE = r"LONG|SHORT|Entrada|Alvo|Stop|TP\d|Telegram|Assinar|Assinatura|Plano|R\$|Mensal|Anual|Checkout|Pix|cartão|ilimitad|Renov|Cancelar|Premium|\d+\s*%"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []; api = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("request", lambda r: api.append(r.url) if "/api/" in r.url else None)
        pg.goto(B + "/vip"); pg.wait_for_selector("h1")
        check("título 'Em breve' e rótulo VIP", pg.inner_text("h1") == "Em breve" and pg.inner_text(".soon .bd") == "VIP")
        check("menu visível e 'VIP' ativo (sidebar)", pg.locator("aside a.nav").count() == 10 and pg.locator("aside a.nav.on").inner_text().strip() == "VIP")
        body = pg.inner_text("main")
        check("sem sinais, entradas/alvos/stops, planos, preços, assinatura, pagamento, Telegram ou IA ilimitada", not re.search(FAKE, body, re.I), body[:120].replace("\n", " "))
        check("sem tabelas, cartões de sinal ou elementos de checkout", pg.locator("main table, main form, main input, main progress, main [role=progressbar]").count() == 0)
        check("apenas ações de navegação (Voltar e Início)", pg.locator("main button, main a").count() == 2)
        check("a página não chama APIs", api == [])
        pg.get_by_role("button", name=re.compile("Voltar")).click(); pg.wait_for_url(B + "/"); pg.wait_for_selector(".lrow", timeout=15000); check("Voltar sem histórico interno vai ao Início", True)
        # cartão VIP do Início
        card = pg.locator(".vipc"); check("Início: cartão VIP informa 'em breve' (sem planos/preços)", "em breve" in card.inner_text().lower() and not re.search(r"R\$|Plano|Assinar", card.inner_text()))
        card.get_by_role("link").click(); pg.wait_for_url("**/vip"); check("Início → cartão VIP abre a tela 'Em breve'", pg.inner_text("h1") == "Em breve")
        pg.get_by_role("button", name=re.compile("Voltar")).click(); pg.wait_for_url(B + "/"); check("Início → VIP → Voltar retorna ao Início", True)
        pg.locator(".qa2 a[href='/vip']").click(); pg.wait_for_url("**/vip"); check("atalho 'VIP' do Início abre a tela", pg.inner_text("h1") == "Em breve")
        # Notícias -> VIP -> Voltar
        pg.get_by_role("link", name="Notícias").first.click(); pg.wait_for_url("**/noticias"); pg.wait_for_selector("article", timeout=15000)
        pg.get_by_role("link", name="VIP").first.click(); pg.wait_for_url("**/vip"); pg.get_by_role("button", name=re.compile("Voltar")).click(); pg.wait_for_url("**/noticias")
        check("Notícias → VIP → Voltar retorna às Notícias", True)
        # rotas inexistentes de VIP
        for path in ["/vip/checkout", "/vip/planos", "/vip/sinais"]:
            r = pg.request.get(B + path); check(f"rota inexistente {path} -> 404", r.status == 404)
        for path in ["/api/checkout", "/api/subscriptions", "/api/signals"]:
            r = pg.request.get(B + path); check(f"API inexistente {path} -> 404", r.status == 404)
        ctx.add_cookies([{"name": "iv_theme", "value": "light", "url": B}, {"name": "iv_lang", "value": "en", "url": B}]); pg.goto(B + "/vip"); pg.wait_for_selector("h1")
        check("tema claro e inglês", pg.evaluate("document.documentElement.dataset.theme") == "light" and pg.inner_text("h1") == "Coming soon" and "not available yet" in pg.inner_text("main"))
        pg.screenshot(path="docs/screenshots/etapa06_desktop_light_en.png"); ctx.clear_cookies()
        check("sem erros de JS", not errs, "; ".join(errs)[:200])
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/vip"); mb.wait_for_selector("h1")
        check("mobile: barra inferior com VIP ativo", mb.locator("#bn a").count() == 4 and mb.locator("#bn .on").inner_text().strip() == "Mais" and (mb.get_by_test_id("bn-more").click() or mb.locator("#more-sheet a.on").inner_text().strip() == "VIP"))
        check("mobile: sem rolagem horizontal", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        mb.screenshot(path="docs/screenshots/etapa06_mobile.png")
        b.close()
finally:
    for s in (s1, m): stop(s)
finish()

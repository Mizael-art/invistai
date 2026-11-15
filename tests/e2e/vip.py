"""E2E do hub VIP (Etapa 06, atualizado na Etapa 3 do ecossistema): o hub lista os recursos pagos, mostra o que ainda está em
desenvolvimento como 'Em breve' e não exibe nenhuma call/nível sem plano. Requer `npm run build`."""
import re
from playwright.sync_api import sync_playwright
from common import *

m = mock()
s1 = start(3601, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"})
B = "http://127.0.0.1:3601"
LEVELS = r"\bLONG\b|\bSHORT\b|Entrada|\bTP\d|Stop"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(B + "/vip"); pg.wait_for_selector("h1")
        check("hub VIP com título e 'VIP' ativo no menu", pg.inner_text("h1") == "VIP" and pg.locator("aside a.nav").count() == 12 and pg.locator("aside a.nav.on").inner_text().strip() == "VIP")
        check("Calls VIP disponível para PRO · MAX; Carteiras e Bots 'Em breve'", "PRO · MAX" in pg.get_by_test_id("vip-calls").inner_text() and "Em breve" in pg.get_by_test_id("vip-portfolios").inner_text() and "Em breve" in pg.get_by_test_id("vip-bots").inner_text())
        check("hub não expõe nenhuma call/nível", not re.search(LEVELS, pg.inner_text("main")))
        check("módulos em desenvolvimento não são links", pg.locator("[data-testid=vip-portfolios] a, a[data-testid=vip-portfolios], a[data-testid=vip-bots]").count() == 0)
        pg.get_by_test_id("vip-calls").click(); pg.wait_for_url(re.compile("/login\\?next=%2Fcalls")); check("Calls VIP exige login (visitante → /login)", True)
        pg.goto(B + "/"); pg.wait_for_selector(".vipc"); card = pg.locator(".vipc")
        check("Início: cartão VIP descreve as Calls VIP sem números", "Calls VIP" in card.inner_text() and not re.search(r"R\$|\d+\s*%", card.inner_text()))
        card.get_by_role("link").click(); pg.wait_for_url("**/vip"); check("Início → cartão VIP abre o hub", pg.inner_text("h1") == "VIP")
        for path in ["/vip/checkout", "/vip/planos", "/vip/sinais", "/api/checkout", "/api/signals"]:
            r = pg.request.get(B + path); check(f"rota inexistente {path} -> 404", r.status == 404)
        ctx.add_cookies([{"name": "iv_theme", "value": "light", "url": B}, {"name": "iv_lang", "value": "en", "url": B}]); pg.goto(B + "/vip"); pg.wait_for_selector("h1")
        check("tema claro e inglês", pg.evaluate("document.documentElement.dataset.theme") == "light" and "Coming soon" in pg.inner_text("main") and "Available" not in pg.get_by_test_id("vip-calls").inner_text())
        pg.screenshot(path="docs/screenshots/etapa06_desktop_light_en.png"); ctx.clear_cookies()
        check("sem erros de JS", not errs, "; ".join(errs)[:200])
        mb = b.new_context(viewport={"width": 390, "height": 844}).new_page(); mb.goto(B + "/vip"); mb.wait_for_selector("h1")
        check("mobile: 'Mais' ativo com VIP marcado na folha", mb.locator("#bn .on").inner_text().strip() == "Mais" and (mb.get_by_test_id("bn-more").click() or mb.locator("#more-sheet a.on").inner_text().strip() == "VIP"))
        check("mobile: sem rolagem horizontal", not mb.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
        mb.screenshot(path="docs/screenshots/etapa06_mobile.png")
        b.close()
finally:
    stop(s1); stop(m)
finish()

"""E2E do "casco" do app: abertura animada, ícone/manifesto para a tela inicial, linhas de moedas clicáveis e layout no celular.
Requer `npm run build`."""
import json, re, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *

m = mock()
s1 = start(3995, {"COINGECKO_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_BASE_URL": "http://127.0.0.1:4010/ok", "NEWS_API_KEY": "t"}); B = "http://127.0.0.1:3995"
HUMAN = "Object.defineProperty(navigator, 'webdriver', { get: () => false })"     # simula um navegador comum (a abertura é omitida para automação)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        # manifesto e ícones
        man = json.loads(urllib.request.urlopen(B + "/manifest.webmanifest").read())
        check("manifesto: nome, tela cheia e cores do app", man["name"] == "TRADEON" and man["display"] == "standalone" and man["start_url"] == "/" and man["background_color"] == "#080D0B")
        check("manifesto: ícones 192/512 e maskable", {i["sizes"] for i in man["icons"]} == {"192x192", "512x512"} and any(i.get("purpose") == "maskable" for i in man["icons"]))
        for path in ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/apple-icon.png"]:
            r = urllib.request.urlopen(B + path); check(f"ícone servido: {path}", r.status == 200 and r.headers["content-type"] == "image/png")
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:80]))
        pg.goto(B + "/"); html = pg.content()
        check("página declara manifesto, ícone Apple e modo app no iOS", 'rel="manifest"' in html and 'rel="apple-touch-icon"' in html and "apple-mobile-web-app-capable" in html or "mobile-web-app-capable" in html)
        check("automação: sem abertura (não bloqueia a interface)", not pg.evaluate("document.documentElement.classList.contains('splash')"))
        # abertura animada para usuário comum
        h = b.new_context(viewport={"width": 390, "height": 844}); h.add_init_script(HUMAN); hp = h.new_page(); hp.on("pageerror", lambda e: errs.append(str(e)[:80]))
        hp.goto(B + "/", wait_until="commit"); hp.wait_for_selector(".splash-ov", state="visible", timeout=5000)
        check("abertura aparece ao entrar, com a marca TRADEON", hp.locator(".splash-ov").is_visible() and "TRADEON" in hp.inner_text(".splash-word").replace("\n", ""))
        t0 = time.time(); hp.wait_for_function("!document.documentElement.classList.contains('splash')", timeout=6000); dt = time.time() - t0
        check("abertura dura ~2–3 s e some sozinha", 1.5 <= dt <= 3.5 and not hp.locator(".splash-ov").is_visible(), f"{dt:.2f}s")
        hp.locator("#bn a", has_text="Mercado").click(); hp.wait_for_url("**/mercado"); hp.wait_for_selector("tbody tr", timeout=15000)
        check("navegação interna não repete a abertura", not hp.evaluate("document.documentElement.classList.contains('splash')"))
        hp.reload(wait_until="commit"); hp.wait_for_selector(".splash-ov", state="visible", timeout=5000); check("reabrir/recarregar o app mostra a abertura de novo", True)
        r = b.new_context(reduced_motion="reduce"); r.add_init_script(HUMAN); rp = r.new_page(); rp.goto(B + "/", wait_until="commit"); t0 = time.time()
        rp.wait_for_function("!document.documentElement.classList.contains('splash')", timeout=5000); check("com 'reduzir movimento' a abertura é curta", time.time() - t0 < 1.6, f"{time.time() - t0:.2f}s")
        # linhas clicáveis
        pg.goto(B + "/"); pg.wait_for_selector(".lrow[data-asset]", timeout=20000); pg.wait_for_load_state("networkidle")
        row = pg.locator(".lrow[data-asset]").first; aid = row.get_attribute("data-asset"); bb = row.bounding_box()
        pg.mouse.click(bb["x"] + bb["width"] * 0.55, bb["y"] + bb["height"] / 2); pg.wait_for_url(f"**/mercado/{aid}", timeout=10000)
        check("Início: clicar em qualquer parte da linha da moeda abre a página dela", True)
        check("página da moeda tem o botão 'Analisar … com TRADEON AI'", "com TRADEON AI" in pg.get_by_test_id("ask-ai").inner_text() and "/ia?ask=" in pg.get_by_test_id("ask-ai").get_attribute("href"))
        pg.goto(B + "/"); pg.wait_for_selector(".lrow[data-asset]"); pg.wait_for_load_state("networkidle")
        fav = pg.locator(".lrow[data-asset]").first.locator("button").first; fav.click(); pg.wait_for_timeout(600)
        check("botão de favoritar continua clicável dentro da linha (não navega)", pg.url.rstrip("/") == B)
        pg.goto(B + "/mercado"); pg.wait_for_selector("tbody tr.rowlink"); pg.wait_for_load_state("networkidle")
        cb = pg.locator("tbody tr.rowlink").nth(1).locator("td.num").first.bounding_box(); pg.mouse.click(cb["x"] + cb["width"] / 2, cb["y"] + cb["height"] / 2); pg.wait_for_url(re.compile(r"/mercado/[^/?]+$"), timeout=10000)
        check("Mercado: clicar no preço/linha abre a moeda", True)
        # celular
        for w in [360, 375, 390]:
            mp = b.new_page(viewport={"width": w, "height": 800})
            for path in ["/", "/mercado", "/mercado/bitcoin"]:
                mp.goto(B + path); mp.wait_for_load_state("networkidle")
                check(f"{w}px {path}: sem rolagem horizontal", mp.evaluate("document.documentElement.scrollWidth <= innerWidth"), str(mp.evaluate("document.documentElement.scrollWidth")))
            mp.goto(B + "/mercado"); mp.wait_for_selector(".tw table")
            check(f"{w}px: tabela do mercado cabe inteira (favorito visível)", mp.evaluate("[...document.querySelectorAll('.tw')].every(t => t.scrollWidth <= t.clientWidth)") and mp.locator("tbody tr").first.locator("button").first.is_visible())
            mp.goto(B + "/mercado/bitcoin"); mp.wait_for_selector(".tf-bar")
            check(f"{w}px: barra do gráfico inteira (Indicadores visível)", mp.evaluate("(() => { const r = document.querySelector('.tf-r button:last-child').getBoundingClientRect(); return r.right <= innerWidth; })()"))
        check("sem erros de JS", not errs, "; ".join(errs)[:200])
        b.close()
finally:
    stop(s1); stop(m)
finish()
